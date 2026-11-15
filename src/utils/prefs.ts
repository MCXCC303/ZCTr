import {config} from "../../package.json";

const PREFS_PREFIX = config.prefsPrefix;

export const PREFS = {
	/** JSON array of provider configs; apiKey is stored separately. */
	PROVIDERS: "providers",
	ACTIVE_PROVIDER_ID: "activeProviderId",
	/** Target translation language code, e.g. "zh". */
	TARGET_LANG: "targetLang",
	/** Translate hotkey combo, e.g. "ctrl+alt+t"; empty = disabled. */
	SHORTCUT: "shortcut",
	STREAMING: "streaming",
	/** Sampling temperature (number; 0 = deterministic). */
	TEMPERATURE: "temperature",
	/** top_p (number; "" = not sent, provider default). */
	TOP_P: "topP",
	/** top_k (number; "" = not sent, provider default). */
	TOP_K: "topK",
	/** repetition_penalty (number; "" = not sent, provider default). */
	REPETITION_PENALTY: "repetitionPenalty",
	/** max_output_tokens (number; "" = not sent, provider default). */
	MAX_OUTPUT_TOKENS: "maxOutputTokens",
	/** Context level: selection | local | semantic | adaptive. */
	CONTEXT_LEVEL: "contextLevel",
	CONTEXT_INCLUDE_ABSTRACT: "contextIncludeAbstract",
	CONTEXT_INCLUDE_TITLE: "contextIncludeTitle",
	CONTEXT_INCLUDE_SECTION_TITLE: "contextIncludeSectionTitle",
	CONTEXT_INCLUDE_ADJACENT_PARAGRAPHS: "contextIncludeAdjacentParagraphs",
	/** Include matched terminology (independent of the context level). */
	CONTEXT_INCLUDE_TERMINOLOGY: "contextIncludeTerminology",
	TERMINOLOGY_ENABLED: "terminologyEnabled",
	/** Log level: error | warn | info | debug. */
	LOG_LEVEL: "logLevel",
	ACTIVE_TERMBASE_ID: "activeTermbaseId",
	CACHE_PERSIST: "cachePersist",
	/** In-memory cache queue length (-1 = unlimited). */
	CACHE_LIMIT: "cacheLimit",
	/** Persisted cache queue length (-1 = unlimited). */
	CACHE_PERSIST_LIMIT: "cachePersistLimit",
} as const;

export type PrefKey = (typeof PREFS)[keyof typeof PREFS];

/** Read a plugin preference (global scope). */
export function getPref(key: PrefKey): unknown {
	return Zotero.Prefs.get(`${PREFS_PREFIX}.${key}`, true);
}

/** Write a plugin preference (global scope). */
export function setPref(key: PrefKey, value: string | number | boolean): void {
	Zotero.Prefs.set(`${PREFS_PREFIX}.${key}`, value, true);
}
