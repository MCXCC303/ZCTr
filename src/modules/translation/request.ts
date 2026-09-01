/**
 * TranslationRequest - the request contract of the translation pipeline
 * (ZCTr-existing-version-optimization-ARCHITECTURE.md §3, README 数据流).
 *
 * Bundles everything a translation needs after context assembly. Phase 2
 * (terminology) decorates it before messages are built; Phase 3 (profiles)
 * resolves its provider/runtime/policy parts at the pipeline entry.
 */

import type {ProviderConfig} from "../provider/types";
import type {TranslationRuntimeConfig} from "../runtime/runtime-config";
import type {TranslationContext} from "../context/context";

export interface TranslationRequest {
	/** Active provider (with API key merged in). */
	provider: ProviderConfig;
	/** Source text (the selection). */
	text: string;
	/** Target language ISO code, e.g. "zh". */
	targetLang: string;
	/** Effective sampling parameters. */
	runtimeConfig: TranslationRuntimeConfig;
	/** Assembled context (may be selection-only). */
	context: TranslationContext;
}

export function buildTranslationRequest(
	provider: ProviderConfig,
	text: string,
	targetLang: string,
	runtimeConfig: TranslationRuntimeConfig,
	context: TranslationContext,
): TranslationRequest {
	return {provider, text, targetLang, runtimeConfig, context};
}
