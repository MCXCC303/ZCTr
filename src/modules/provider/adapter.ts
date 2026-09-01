/**
 * Provider adapter - maps a TranslationRuntimeConfig to provider-specific
 * request fields (ZCTr-existing-version-optimization-ARCHITECTURE.md §7).
 *
 * Unsupported fields are safely ignored and reported for diagnostics - they
 * must never make the request fail.
 */

import type {ProviderType} from "./types";
import type {TranslationRuntimeConfig} from "../runtime/runtime-config";

/** Wire names for the OpenAI-compatible request body. */
const WIRE_NAMES: Record<
	"topP" | "topK" | "repetitionPenalty" | "maxOutputTokens",
	string
> = {
	topP: "top_p",
	topK: "top_k",
	repetitionPenalty: "repetition_penalty",
	maxOutputTokens: "max_tokens",
};

/**
 * Per-provider sampling capabilities. Which parameters can actually be
 * transmitted:
 *
 * - openai (generic compatible): official OpenAI rejects unknown request
 *   arguments, so only the standard set is sent;
 * - deepseek: chat completions has no top_k / repetition_penalty;
 * - ollama (OpenAI-compatible /v1 layer): supports temperature / top_p /
 *   max_tokens only; top_k and repeat_penalty exist on the native
 *   `/api/chat` "options" block, not on /v1.
 *
 * When a future adapter (e.g. Ollama native API) exposes more fields, flip
 * the capability here and extend `WIRE_NAMES`.
 */
const CAPABILITIES: Record<
	ProviderType,
	Record<"topP" | "topK" | "repetitionPenalty" | "maxOutputTokens", boolean>
> = {
	openai: {topP: true, topK: false, repetitionPenalty: false, maxOutputTokens: true},
	deepseek: {topP: true, topK: false, repetitionPenalty: false, maxOutputTokens: true},
	ollama: {topP: true, topK: false, repetitionPenalty: false, maxOutputTokens: true},
};

export interface ProviderPayloadParams {
	/** Provider-specific payload fields (temperature and supported params). */
	payload: Record<string, unknown>;
	/** Configured parameters this provider does not support (ignored + logged). */
	ignored: string[];
}

/**
 * Map a runtime config to provider-specific request fields. `temperature` is
 * always sent (it has a default); optional fields are only sent when set and
 * supported.
 */
export function buildProviderPayloadParams(
	providerType: ProviderType,
	cfg: TranslationRuntimeConfig,
): ProviderPayloadParams {
	const caps = CAPABILITIES[providerType];
	const payload: Record<string, unknown> = {temperature: cfg.temperature};
	const ignored: string[] = [];

	const optionals = [
		"topP",
		"topK",
		"repetitionPenalty",
		"maxOutputTokens",
	] as const;
	for (const key of optionals) {
		const value = cfg[key];
		if (value === undefined) {
			continue;
		}
		if (caps[key]) {
			payload[WIRE_NAMES[key]] = value;
		} else {
			ignored.push(key);
		}
	}
	return {payload, ignored};
}
