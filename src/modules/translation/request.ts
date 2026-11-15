import type {ProviderConfig} from "../provider/types";
import type {TranslationRuntimeConfig} from "../runtime/runtime-config";
import type {TranslationContext} from "../context/context";

export interface TranslationRequest {
	provider: ProviderConfig;
	text: string;
	targetLang: string;
	runtimeConfig: TranslationRuntimeConfig;
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
