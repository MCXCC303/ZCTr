import type {ProviderType} from "./types";
import type {TranslationRuntimeConfig} from "../runtime/runtime-config";

const WIRE_NAMES: Record<
	"topP" | "topK" | "repetitionPenalty" | "maxOutputTokens",
	string
> = {
	topP: "top_p",
	topK: "top_k",
	repetitionPenalty: "repetition_penalty",
	maxOutputTokens: "max_tokens",
};

const CAPABILITIES: Record<
	ProviderType,
	Record<"topP" | "topK" | "repetitionPenalty" | "maxOutputTokens", boolean>
> = {
	openai: {topP: true, topK: false, repetitionPenalty: false, maxOutputTokens: true},
	deepseek: {topP: true, topK: false, repetitionPenalty: false, maxOutputTokens: true},
	ollama: {topP: true, topK: false, repetitionPenalty: false, maxOutputTokens: true},
};

export interface ProviderPayloadParams {
	payload: Record<string, unknown>;
	ignored: string[];
}

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
