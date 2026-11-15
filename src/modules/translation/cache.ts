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
import * as zlog from "../../utils/logger";

export interface TranslationCacheEntry {
	/** Deterministic sha256 of the canonical request material. */
	key: string;
	text: string;
	targetLang: string;
	providerId: string;
	translation: string;
	/** Snapshot of the effective runtime config (for diagnostics only). */
	runtime?: Record<string, unknown>;
}

/** Synchronous Firefox nsICryptoHash (crypto.subtle would force the cache API async). */
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

const DEFAULT_PARTITION = 0;

class TranslationCache {
	private queues = new Map<number, Map<string, TranslationCacheEntry>>();
	private loadPromises = new Map<number, Promise<void>>();
	/** itemID -> chained save promise: writes to one article's file must not interleave. */
	private saveChains = new Map<number, Promise<void>>();

	private key(
		text: string,
		targetLang: string,
		providerId: string,
		runtimeConfig: TranslationRuntimeConfig,
		context: TranslationContext,
		terminology?: MatchedTermSet | null,
	): string {
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
			v: 3, // cache key schema version
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
			return Infinity;
		}
		return Number.isFinite(v) && v > 0 ? v : fallback;
	}

	private getMemoryLimit(): number {
		return this.resolveLimit(getPref(PREFS.CACHE_LIMIT), DEFAULT_LIMIT);
	}

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
			zlog.debug(`translation cache loaded for item ${itemID}: ${queue.size} entries`);
		} catch (error) {
			zlog.warn(`Failed to load translation cache for item ${itemID}:`,
				error,
			);
		}
	}

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
				const persistLimit = this.getPersistLimit();
				const toSave = [...queue.values()].slice(-persistLimit);
				await Zotero.File.putContentsAsync(file, JSON.stringify(toSave));
			})
			.catch((error) => {
				zlog.warn(`Failed to save translation cache for item ${itemID}:`,
					error,
				);
			});
		this.saveChains.set(itemID, next);
	}

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
			zlog.debug(`cache miss: item=${itemID} text_len=${text.length} lang=${targetLang} provider=${providerId} key=${key.slice(0, 12)}`);
			return null;
		}
		// Refresh recency: Map iteration order follows insertion order
		queue.delete(key);
		queue.set(key, entry);
		zlog.debug(`cache hit: item=${itemID} text_len=${text.length} lang=${targetLang} provider=${providerId} key=${key.slice(0, 12)}`);
		return entry.translation;
	}

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
		zlog.debug(`cache put: item=${itemID} text_len=${text.length} lang=${targetLang} provider=${providerId} key=${key.slice(0, 12)}`);
		this.trim(itemID);
		if (this.shouldPersist()) {
			// Fire-and-forget; failures are logged in save()
			this.save(itemID);
		}
	}

	get size(): number {
		let total = 0;
		for (const queue of this.queues.values()) {
			total += queue.size;
		}
		return total;
	}
}

export const translationCache = new TranslationCache();
