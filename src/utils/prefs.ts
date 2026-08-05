import {config} from "../../package.json";

const PREFS_PREFIX = config.prefsPrefix;

/** Preference keys used by the plugin. */
export const PREFS = {
	/** JSON array of provider configs (without apiKey - stored separately). */
	PROVIDERS: "providers",
	/** Id of the active provider. */
	ACTIVE_PROVIDER_ID: "activeProviderId",
	/** Target translation language code, e.g. "zh". */
	TARGET_LANG: "targetLang",
	/** Whether to use streaming (SSE) translation output. */
	STREAMING: "streaming",
	/** Whether the translation cache is persisted across sessions. */
	CACHE_PERSIST: "cachePersist",
	/** Translation cache queue length. */
	CACHE_LIMIT: "cacheLimit",
} as const;

export type PrefKey = (typeof PREFS)[keyof typeof PREFS];

/** Get a plugin preference value (global, `extensions.zotero.zctr.*`). */
export function getPref(key: PrefKey): unknown {
	return Zotero.Prefs.get(`${PREFS_PREFIX}.${key}`, true);
}

/** Set a plugin preference value. */
export function setPref(key: PrefKey, value: string | number | boolean): void {
	Zotero.Prefs.set(`${PREFS_PREFIX}.${key}`, value, true);
}
