/**
 * Termbase store - persistence in the Zotero data directory
 * (`zctr/termbases-v<ver>[+g<commit>]/<termbaseId>.json`, P2 plan §3.5).
 *
 * Termbases live in a PER-BUILD VERSIONED directory (same policy as the
 * translation cache, per the user's decision): a dev build never sees the
 * release build's termbases and rolling back keeps each build's data
 * intact. Forward compatibility comes from `schemaVersion` inside each
 * file - unknown fields are ignored on load, invalid entries are skipped
 * individually instead of failing the whole termbase.
 *
 * A ONE-TIME migration moves termbases created by pre-versioning builds
 * (legacy `zctr/termbases/`) into the current versioned directory on first
 * access, so upgrading never makes user data silently disappear.
 *
 * Filesystem layer uses the PROVEN Zotero.File / nsIFile APIs (the same
 * ones the translation cache uses successfully): DataDirectory.dir (the
 * modern, non-deprecated accessor), directory enumeration with the
 * canonical QueryInterface pattern (see Zotero schema.js), and
 * getContentsAsync/putContentsAsync for IO.
 *
 * A session-level id registry guarantees that termbases created during
 * this session are listed even if the on-disk scan misbehaves; the scan is
 * a union with the registry.
 */

import {
	TERMBASE_SCHEMA_VERSION,
	type Termbase,
	validateTermbase,
} from "./model";
import {parseTermbaseJson} from "./io";
import {getTermbaseSubdirName} from "../../utils/build-info";

const DIR_NAME = "zctr";

/**
 * Session-level cache of loaded termbases: translations match against this
 * instead of reading the data directory every request. Invalidated by
 * saveTermbase / deleteTermbase.
 */
let termbaseCache: Termbase[] | null = null;

/** Ids created/known during this session (union with the disk scan). */
const knownIds = new Set<string>();

function invalidateCache(): void {
	termbaseCache = null;
}

function getTermbaseDir(): any | null {
	try {
		// Modern, non-deprecated accessor (was Zotero.getZoteroDirectory()).
		const dir = Zotero.File.pathToFile(Zotero.DataDirectory.dir);
		dir.append(DIR_NAME);
		if (!dir.exists()) {
			// nsIFile.DIRECTORY_TYPE === 1
			dir.create(1, 0o755);
		}
		const sub = dir.clone();
		sub.append(getTermbaseSubdirName());
		if (!sub.exists()) {
			sub.create(1, 0o755);
		}
		return sub;
	} catch (error) {
		ztoolkit.log(
			`[ZCTr] Failed to access termbase directory (${Zotero.DataDirectory.dir}):`,
			(error as Error)?.name,
			(error as Error)?.message,
			error,
		);
		return null;
	}
}

function termbaseFile(termbaseId: string): any | null {
	const dir = getTermbaseDir();
	if (!dir) {
		return null;
	}
	const file = dir.clone();
	file.append(`${termbaseId}.json`);
	return file;
}

/** True when `dir` contains at least one *.json termbase file. */
function hasJsonEntries(dir: any): boolean {
	try {
		const entries = dir.directoryEntries;
		while (entries.hasMoreElements()) {
			const entry = entries.getNext();
			// Canonical Zotero pattern: QI the enumerator element.
			entry.QueryInterface?.(Ci.nsIFile) ?? entry;
			if (String(entry.leafName || "").endsWith(".json")) {
				return true;
			}
		}
	} catch (error) {
		ztoolkit.log("[ZCTr] 术语库目录检查失败:", error);
	}
	return false;
}

/**
 * One-time migration from the legacy UNVERSIONED termbase directory
 * (`zctr/termbases/`, used by builds before per-build versioned dirs):
 * copies every *.json into the current versioned directory and removes the
 * originals. Runs only while the current directory holds no termbases yet.
 * Termbases are user data - the migration keeps them visible after an
 * upgrade instead of silently appearing empty. Failures are logged per
 * file and never break the store.
 */
async function migrateLegacyTermbases(): Promise<void> {
	try {
		const dir = getTermbaseDir();
		if (!dir || hasJsonEntries(dir)) {
			return;
		}
		const legacy = Zotero.File.pathToFile(Zotero.DataDirectory.dir);
		legacy.append(DIR_NAME);
		legacy.append("termbases");
		if (!legacy.exists() || !legacy.isDirectory()) {
			return;
		}
		const files: any[] = [];
		const entries = legacy.directoryEntries;
		while (entries.hasMoreElements()) {
			const entry: any = entries.getNext();
			entry.QueryInterface?.(Ci.nsIFile) ?? entry;
			if (String(entry.leafName || "").endsWith(".json")) {
				files.push(entry);
			}
		}
		if (!files.length) {
			return;
		}
		for (const file of files) {
			const name = String(file.leafName || "");
			try {
				const content = await (Zotero.File as any).getContentsAsync(file);
				const target = dir.clone();
				target.append(name);
				await (Zotero.File as any).putContentsAsync(target, content);
				file.remove(false);
				knownIds.add(name.slice(0, -".json".length));
				ztoolkit.log(
					`[ZCTr] 术语库已从旧目录迁移到 ${dir.path}: ${name}`,
				);
			} catch (error) {
				ztoolkit.log(`[ZCTr] 术语库迁移失败 (${name}):`, error);
			}
		}
	} catch (error) {
		ztoolkit.log("[ZCTr] 术语库迁移扫描失败:", error);
	}
}

/** All termbase ids present on disk (deterministic order). */
export async function listTermbaseIds(): Promise<string[]> {
	await migrateLegacyTermbases();
	const ids = new Set<string>(knownIds);
	const dir = getTermbaseDir();
	if (dir) {
		try {
			const entries = dir.directoryEntries;
			while (entries.hasMoreElements()) {
				const entry = entries.getNext();
				// Canonical Zotero pattern: QI the enumerator element.
				entry.QueryInterface?.(Ci.nsIFile) ?? entry;
				const name = String(entry.leafName || "");
				if (name.endsWith(".json")) {
					ids.add(name.slice(0, -".json".length));
				}
			}
		} catch (error) {
			ztoolkit.log(
				`[ZCTr] Failed to enumerate termbase directory (${dir.path}):`,
				(error as Error)?.name,
				(error as Error)?.message,
				error,
			);
		}
	}
	return [...ids].sort();
}

/** Load one termbase; null when missing or unreadable. */
export async function loadTermbase(
	termbaseId: string,
): Promise<Termbase | null> {
	const file = termbaseFile(termbaseId);
	if (!file || !file.exists()) {
		return null;
	}
	try {
		const content = await (Zotero.File as any).getContentsAsync(file);
		const termbase = parseTermbaseJson(content);
		const issues = validateTermbase(termbase);
		if (issues.length) {
			ztoolkit.log(
				`[ZCTr] Termbase ${termbaseId} 校验失败，已忽略问题词条: ${issues.slice(0, 3).join("; ")}`,
			);
		}
		return termbase;
	} catch (error) {
		ztoolkit.log(`[ZCTr] Failed to load termbase ${termbaseId}:`, error);
		return null;
	}
}

/** Load every termbase, cached for the session (see invalidateCache). */
export async function listTermbases(): Promise<Termbase[]> {
	if (termbaseCache) {
		return termbaseCache;
	}
	const ids = await listTermbaseIds();
	const termbases: Termbase[] = [];
	for (const id of ids) {
		const tb = await loadTermbase(id);
		if (tb) {
			termbases.push(tb);
		}
	}
	termbaseCache = termbases;
	Zotero.debug(
		`[ZCTr] termbases loaded: ${termbases.length} (${ids.join(", ") || "none"})`,
	);
	return termbaseCache;
}

/** Persist a termbase (creates or overwrites `<termbaseId>.json`). */
export async function saveTermbase(termbase: Termbase): Promise<void> {
	const issues = validateTermbase(termbase);
	if (issues.length) {
		throw new Error(`术语库校验失败: ${issues.join("; ")}`);
	}
	await migrateLegacyTermbases();
	const file = termbaseFile(termbase.termbaseId);
	if (!file) {
		throw new Error("无法访问术语库目录");
	}
	try {
		await (Zotero.File as any).putContentsAsync(
			file,
			JSON.stringify(termbase, null, "\t"),
		);
		knownIds.add(termbase.termbaseId);
		invalidateCache();
	} catch (error) {
		ztoolkit.log(`[ZCTr] Failed to save termbase ${termbase.termbaseId}:`, error);
		throw error;
	}
}

/** Delete a termbase file (no-op when missing). */
export async function deleteTermbase(termbaseId: string): Promise<void> {
	const file = termbaseFile(termbaseId);
	if (!file || !file.exists()) {
		knownIds.delete(termbaseId);
		invalidateCache();
		return;
	}
	try {
		file.remove(false);
		knownIds.delete(termbaseId);
		invalidateCache();
	} catch (error) {
		ztoolkit.log(`[ZCTr] Failed to delete termbase ${termbaseId}:`, error);
	}
}

/** Current persisted schema version (for cache fingerprints). */
export function termbaseSchemaVersion(): number {
	return TERMBASE_SCHEMA_VERSION;
}
