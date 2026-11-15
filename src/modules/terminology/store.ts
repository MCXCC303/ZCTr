import {
	TERMBASE_SCHEMA_VERSION,
	type Termbase,
	validateTermbase,
} from "./model";
import {parseTermbaseJson} from "./io";
import {getTermbaseSubdirName} from "../../utils/build-info";
import {getString} from "../../utils/locale";
import * as zlog from "../../utils/logger";

const DIR_NAME = "zctr";

let termbaseCache: Termbase[] | null = null;

const knownIds = new Set<string>();

function invalidateCache(): void {
	termbaseCache = null;
}

function getTermbaseDir(): any | null {
	try {
		// DataDirectory.dir is the non-deprecated accessor.
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
		zlog.warn(`Failed to access termbase directory (${Zotero.DataDirectory.dir}):`,
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

function hasJsonEntries(dir: any): boolean {
	try {
		const entries = dir.directoryEntries;
		while (entries.hasMoreElements()) {
			const entry = entries.getNext();
			// QueryInterface the enumerator element to nsIFile.
			entry.QueryInterface?.(Ci.nsIFile) ?? entry;
			if (String(entry.leafName || "").endsWith(".json")) {
				return true;
			}
		}
	} catch (error) {
		zlog.warn("Termbase directory check failed:", error);
	}
	return false;
}

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
				zlog.info(`Termbase migrated from the legacy directory to ${dir.path}: ${name}`);
			} catch (error) {
				zlog.warn(`Termbase migration failed (${name}):`, error);
			}
		}
	} catch (error) {
		zlog.warn("Termbase migration scan failed:", error);
	}
}

export async function listTermbaseIds(): Promise<string[]> {
	await migrateLegacyTermbases();
	const ids = new Set<string>(knownIds);
	const dir = getTermbaseDir();
	if (dir) {
		try {
			const entries = dir.directoryEntries;
			while (entries.hasMoreElements()) {
				const entry = entries.getNext();
				entry.QueryInterface?.(Ci.nsIFile) ?? entry;
				const name = String(entry.leafName || "");
				if (name.endsWith(".json")) {
					ids.add(name.slice(0, -".json".length));
				}
			}
		} catch (error) {
			zlog.warn(`Failed to enumerate termbase directory (${dir.path}):`,
				(error as Error)?.name,
				(error as Error)?.message,
				error,
			);
		}
	}
	return [...ids].sort();
}

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
			zlog.warn(`Termbase ${termbaseId} validation failed, invalid entries ignored: ${issues.slice(0, 3).join("; ")}`);
		}
		return termbase;
	} catch (error) {
		zlog.warn(`Failed to load termbase ${termbaseId}:`, error);
		return null;
	}
}

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
	zlog.debug(`termbases loaded: ${termbases.length} (${ids.join(", ") || "none"})`);
	return termbaseCache;
}

export async function reloadTermbases(): Promise<Termbase[]> {
	invalidateCache();
	return listTermbases();
}

export async function saveTermbase(termbase: Termbase): Promise<void> {
	const issues = validateTermbase(termbase);
	if (issues.length) {
		throw new Error(
			getString("termbase-error-validation", {
				args: {detail: issues.join("; ")},
			}),
		);
	}
	await migrateLegacyTermbases();
	const file = termbaseFile(termbase.termbaseId);
	if (!file) {
		throw new Error(getString("termbase-error-access-dir"));
	}
	try {
		await (Zotero.File as any).putContentsAsync(
			file,
			JSON.stringify(termbase, null, "\t"),
		);
		knownIds.add(termbase.termbaseId);
		invalidateCache();
	} catch (error) {
		zlog.warn(`Failed to save termbase ${termbase.termbaseId}:`, error);
		throw error;
	}
}

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
		zlog.warn(`Failed to delete termbase ${termbaseId}:`, error);
	}
}

export function termbaseSchemaVersion(): number {
	return TERMBASE_SCHEMA_VERSION;
}
