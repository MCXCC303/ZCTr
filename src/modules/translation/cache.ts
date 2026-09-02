/**
 * ZCTr translation cache - per-article LRU queues.
 *
 * Users often translate the same passage repeatedly; a local hit returns
 * the previous translation instantly without a provider request.
 *
 * Every article (PDF attachment item) has its own in-memory LRU queue and,
 * when persistence is enabled, its own persisted queue file, so that caching
 * many articles does not cause each article's entries to evict each other.
 *
 * Layout:
 * - In memory:   Map<itemID, Map<key, entry>> (Map order = recency, tail =
 *   most recent). Each article's queue is capped by `cacheLimit`.
 * - On disk:     one JSON file per article in the Zotero data directory
 *   (zctr/cache/<itemID>.json), capped by `cachePersistLimit`. Files are
 *   loaded lazily when the article is first queried and writes for the same
 *   article are serialized so concurrent puts cannot interleave.
 *
 * Configuration is read from prefs on every access:
 * - cacheLimit:        per-article in-memory queue length (default 50)
 * - cachePersistLimit: how many most-recent entries are written to the
 *   article's persisted file (default 100)
 * - cachePersist:      whether entries are persisted to the Zotero data
 *   directory so they survive restarts
 * A limit of -1 means unlimited.
 *
 * The cache key is sha256(canonical JSON of source text, target language,
 * provider id, prompt version and the effective runtime config). Switching
 * providers, changing sampling parameters or bumping the prompt version
 * therefore produces fresh translations. Entries whose item id cannot be
 * resolved fall back to a shared default partition.
 *
 * Each build writes into its own versioned subdirectory (see
 * src/utils/build-info.ts): releases use `cache-v<version>`, development
 * builds `cache-v<version>+g<commit>`. The legacy `zctr/cache` directory is
 * never read or written by this version, so upgrading or rolling back keeps
 * the other build's cache untouched.
 *
 * Note: the previous single-file cache (zctr/cache.json) is no longer read;
 * the per-article format is incompatible and the old file is left untouched.
 */

import {getPref, PREFS} from "../../utils/prefs";
import {getCacheSubdirName} from "../../utils/build-info";
import {TRANSLATION_PROMPT_VERSION} from "./prompt";
import {
	canonicalRuntimeConfig,
	type TranslationRuntimeConfig,
} from "../runtime/runtime-config";
import {
	canonicalContext,
	CONTEXT_VERSION,
	hasAttachedContext,
	type TranslationContext,
} from "../context/context";
import {canonicalMatchedTermSet} from "../terminology/model";
import type {MatchedTermSet} from "../terminology/model";

export interface TranslationCacheEntry {
	/** Deterministic cache key (sha256 of the canonical request material),
	 * persisted so lookups do not recompute it. */
	key: string;
	/** The original (unnormalized) text, as sent to the provider. */
	text: string;
	targetLang: string;
	providerId: string;
	translation: string;
	/** Snapshot of the effective runtime config (for diagnostics only). */
	runtime?: Record<string, unknown>;
}

/**
 * SHA-256 of a UTF-8 string, hex-encoded, via the synchronous Firefox
 * nsICryptoHash (keeps cache get/put synchronous, unlike crypto.subtle).
 */
function sha256Hex(input: string): string {
	const hash = Cc["@mozilla.org/security/hash;1"].createInstance(
		Ci.nsICryptoHash,
	) as unknown as {
		init: (algorithm: number) => void;
		update: (data: Uint8Array, length: number) => void;
		finish: (binary: boolean) => string;
	};
	hash.init(Ci.nsICryptoHash.SHA256 as number);
	const bytes = new TextEncoder().encode(input);
	hash.update(bytes, bytes.length);
	const digest = hash.finish(false);
	return Array.from(digest, (ch) =>
		ch.charCodeAt(0).toString(16).padStart(2, "0"),
	).join("");
}

const DEFAULT_LIMIT = 50;
const DEFAULT_PERSIST_LIMIT = 100;
const CACHE_DIR_NAME = "zctr";

/** Fallback partition for entries without a resolvable item id. */
const DEFAULT_PARTITION = 0;

class TranslationCache {
	/** itemID -> per-article LRU queue. */
	private queues = new Map<number, Map<string, TranslationCacheEntry>>();
	/** itemID -> per-article persisted-load promise (lazy, once per article). */
	private loadPromises = new Map<number, Promise<void>>();
	/**
	 * itemID -> chained save promise. Serializes writes to the same article's
	 * file so a slow earlier write cannot overwrite a newer one out of order.
	 */
	private saveChains = new Map<number, Promise<void>>();

	private key(
		text: string,
		targetLang: string,
		providerId: string,
		runtimeConfig: TranslationRuntimeConfig,
		context: TranslationContext,
		terminology?: MatchedTermSet | null,
	): string {
		// NFC-normalize the source text so visually identical text whose
		// characters are encoded as precomposed vs. decomposed (e.g. U+00C5
		// vs U+0041+U+030A) maps to the same key. PDF text extraction can
		// produce either form, and mixing them used to evict the cache.
		// NFC (not NFKC) only merges canonically-equivalent forms, so
		// visually distinct text never collides.
		//
		// `stream` is deliberately excluded: it is transport behavior and
		// does not change the semantic input (runtime canonical form omits
		// it). `model` is intentionally not part of the key yet - switching
		// models within the same provider entry is a known limitation
		// (deferred, see ZCTr-context-M1-plan.md §8).
		//
		// The context fingerprint covers every attached context field
		// (policy, document, local); the same selection under a different
		// abstract / local context / policy must not hit the old entry
		// (architecture §15). The termbase fingerprint covers the injected
		// matched terms: a termbase edit must not silently reuse a
		// translation generated under a different terminology
		// (terminology architecture §19).
		const contextFingerprint = hasAttachedContext(context)
			? sha256Hex(JSON.stringify(canonicalContext(context)))
			: null;
		const termbaseMaterial = terminology
			? {
					ids: terminology.termbaseIds,
					schemaVersion: terminology.schemaVersion,
					matchedFingerprint: sha256Hex(
						JSON.stringify(canonicalMatchedTermSet(terminology)),
					),
				}
			: null;
		const material = {
			v: 2, // cache key schema version
			sourceText: text.normalize("NFC"),
			targetLang,
			providerId,
			runtime: canonicalRuntimeConfig(runtimeConfig),
			promptVersion: TRANSLATION_PROMPT_VERSION,
			context: contextFingerprint
				? {version: CONTEXT_VERSION, fingerprint: contextFingerprint}
				: null,
			termbase: termbaseMaterial,
		};
		return sha256Hex(JSON.stringify(material));
	}

	private resolveLimit(value: unknown, fallback: number): number {
		const v = value as number;
		if (v === -1) {
			// Unlimited
			return Infinity;
		}
		return Number.isFinite(v) && v > 0 ? v : fallback;
	}

	/** Per-article in-memory queue limit. */
	private getMemoryLimit(): number {
		return this.resolveLimit(getPref(PREFS.CACHE_LIMIT), DEFAULT_LIMIT);
	}

	/** How many most-recent entries each article's persisted file keeps. */
	private getPersistLimit(): number {
		return this.resolveLimit(
			getPref(PREFS.CACHE_PERSIST_LIMIT),
			DEFAULT_PERSIST_LIMIT,
		);
	}

	private shouldPersist(): boolean {
		return !!getPref(PREFS.CACHE_PERSIST);
	}

	private normalizeItemID(itemID: number | undefined): number {
		return Number.isFinite(itemID) && (itemID as number) > 0
			? (itemID as number)
			: DEFAULT_PARTITION;
	}

	private getCacheDir(): any | null {
		if (!this.shouldPersist()) {
			return null;
		}
		// DataDirectory.dir is the modern, non-deprecated accessor.
		const dir = Zotero.File.pathToFile(Zotero.DataDirectory.dir);
		dir.append(CACHE_DIR_NAME);
		if (!dir.exists()) {
			// nsIFile.DIRECTORY_TYPE === 1
			dir.create(1, 0o755);
		}
		const sub = dir.clone();
		sub.append(getCacheSubdirName());
		if (!sub.exists()) {
			sub.create(1, 0o755);
		}
		return sub;
	}

	private getCacheFile(itemID: number): any | null {
		const dir = this.getCacheDir();
		if (!dir) {
			return null;
		}
		const file = dir.clone();
		file.append(`${itemID}.json`);
		return file;
	}

	private getQueue(
		itemID: number,
		create = false,
	): Map<string, TranslationCacheEntry> | null {
		let queue = this.queues.get(itemID);
		if (!queue && create) {
			queue = new Map();
			this.queues.set(itemID, queue);
		}
		return queue ?? null;
	}

	/**
	 * Load the persisted entries of one article (idempotent; callers can
	 * await or fire-and-forget). Each article is loaded at most once.
	 */
	load(itemID: number): Promise<void> {
		itemID = this.normalizeItemID(itemID);
		if (!this.loadPromises.has(itemID)) {
			this.loadPromises.set(itemID, this.doLoad(itemID));
		}
		return this.loadPromises.get(itemID) as Promise<void>;
	}

	private async doLoad(itemID: number): Promise<void> {
		try {
			const file = this.getCacheFile(itemID);
			if (!file || !file.exists()) {
				return;
			}
			const content = await (Zotero.File as any).getContentsAsync(file);
			const list = JSON.parse(content);
			if (!Array.isArray(list)) {
				return;
			}
			const queue = this.getQueue(itemID, true) as Map<
				string,
				TranslationCacheEntry
			>;
			for (const e of list) {
				if (
					e &&
					typeof e.text === "string" &&
					typeof e.translation === "string" &&
					typeof e.key === "string" &&
					e.key
				) {
					queue.set(e.key, e);
				}
			}
			this.trim(itemID);
			Zotero.debug(
				`[ZCTr] translation cache loaded for item ${itemID}: ${queue.size} entries`,
			);
		} catch (error) {
			ztoolkit.log(
				`[ZCTr] Failed to load translation cache for item ${itemID}:`,
				error,
			);
		}
	}

	/**
	 * Queue a save of one article's file. Writes for the same article are
	 * chained so they run in order; each write snapshots the queue at its
	 * execution time, so the last queued write persists the newest state.
	 */
	private save(itemID: number): void {
		if (!this.shouldPersist()) {
			return;
		}
		const prev = this.saveChains.get(itemID) ?? Promise.resolve();
		const next = prev
			.then(async () => {
				const file = this.getCacheFile(itemID);
				const queue = this.getQueue(itemID);
				if (!file || !queue) {
					return;
				}
				// Persist only the most-recent entries (Map order = recency),
				// so the on-disk queue is capped independently of the memory
				// queue.
				const persistLimit = this.getPersistLimit();
				const toSave = [...queue.values()].slice(0, persistLimit);
				await Zotero.File.putContentsAsync(file, JSON.stringify(toSave));
			})
			.catch((error) => {
				ztoolkit.log(
					`[ZCTr] Failed to save translation cache for item ${itemID}:`,
					error,
				);
			});
		this.saveChains.set(itemID, next);
	}

	/** Evict the oldest entries of one article until its queue fits its limit. */
	private trim(itemID: number): void {
		const queue = this.getQueue(itemID);
		if (!queue) {
			return;
		}
		const limit = this.getMemoryLimit();
		while (queue.size > limit) {
			queue.delete(queue.keys().next().value as string);
		}
		if (queue.size === 0) {
			this.queues.delete(itemID);
		}
	}

	/**
	 * Look up a cached translation for an article. Returns null on miss; on
	 * hit, moves the entry to the most-recent position (LRU).
	 */
	async get(
		itemID: number | undefined,
		text: string,
		targetLang: string,
		providerId: string,
		runtimeConfig: TranslationRuntimeConfig,
		context: TranslationContext,
		terminology?: MatchedTermSet | null,
	): Promise<string | null> {
		itemID = this.normalizeItemID(itemID);
		await this.load(itemID);
		const queue = this.getQueue(itemID);
		if (!queue) {
			return null;
		}
		const key = this.key(text, targetLang, providerId, runtimeConfig, context, terminology);
		const entry = queue.get(key);
		if (!entry) {
			return null;
		}
		// Refresh recency: Map iteration order follows insertion order
		queue.delete(key);
		queue.set(key, entry);
		return entry.translation;
	}

	/** Store (or refresh) a translation for an article, evicting if needed. */
	async put(
		itemID: number | undefined,
		text: string,
		targetLang: string,
		providerId: string,
		runtimeConfig: TranslationRuntimeConfig,
		context: TranslationContext,
		terminology: MatchedTermSet | null | undefined,
		translation: string,
	): Promise<void> {
		itemID = this.normalizeItemID(itemID);
		await this.load(itemID);
		const queue = this.getQueue(itemID, true) as Map<
			string,
			TranslationCacheEntry
		>;
		const key = this.key(text, targetLang, providerId, runtimeConfig, context, terminology);
		queue.delete(key);
		queue.set(key, {
			key,
			text,
			targetLang,
			providerId,
			runtime: canonicalRuntimeConfig(runtimeConfig),
			translation,
		});
		this.trim(itemID);
		if (this.shouldPersist()) {
			// Fire-and-forget; save() logs its own failures
			this.save(itemID);
		}
	}

	/** Total number of cached entries across all articles. */
	get size(): number {
		let total = 0;
		for (const queue of this.queues.values()) {
			total += queue.size;
		}
		return total;
	}
}

/** Session-wide cache instance. */
export const translationCache = new TranslationCache();
