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
	/** Translate hotkey combo, e.g. "ctrl+alt+t"; empty = disabled. */
	SHORTCUT: "shortcut",
	/** Whether to use streaming (SSE) translation output. */
	STREAMING: "streaming",
	/** Sampling temperature (number; 0 = deterministic). */
	TEMPERATURE: "temperature",
	/** Nucleus sampling top_p (number, "" = not sent / provider default). */
	TOP_P: "topP",
	/** Top-K sampling (number, "" = not sent / provider default). */
	TOP_K: "topK",
	/** Repetition penalty (number, "" = not sent / provider default). */
	REPETITION_PENALTY: "repetitionPenalty",
	/** Max output tokens (number, "" = not sent / provider default). */
	MAX_OUTPUT_TOKENS: "maxOutputTokens",
	/** Context level: selection | local | semantic | adaptive. */
	CONTEXT_LEVEL: "contextLevel",
	/** Include Abstract in the document-level context. */
	CONTEXT_INCLUDE_ABSTRACT: "contextIncludeAbstract",
	/** Include item Title in the document-level context. */
	CONTEXT_INCLUDE_TITLE: "contextIncludeTitle",
	/** Include the PDF outline section title when available. */
	CONTEXT_INCLUDE_SECTION_TITLE: "contextIncludeSectionTitle",
	/** Include previous/next paragraphs around the selection. */
	CONTEXT_INCLUDE_ADJACENT_PARAGRAPHS: "contextIncludeAdjacentParagraphs",
	/** Whether the translation cache is persisted across sessions. */
	CACHE_PERSIST: "cachePersist",
	/** In-memory translation cache queue length. */
	CACHE_LIMIT: "cacheLimit",
	/** Persisted translation cache queue length. */
	CACHE_PERSIST_LIMIT: "cachePersistLimit",
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
