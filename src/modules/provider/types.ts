import type {FluentMessageId} from "../../../typings/i10n";

export type ProviderType = "openai" | "deepseek" | "ollama";

export interface ProviderConfig {
	id: string;
	type: ProviderType;
	name: string;
	/** OpenAI-compatible base URL (openai type only). */
	apiBaseUrl?: string;
	/** API key (openai / deepseek; Ollama accepts any or none). */
	apiKey?: string;
	model?: string;
	port?: number;
}

export const PROVIDER_TYPES: ProviderType[] = ["openai", "deepseek", "ollama"];

export const PROVIDER_TYPE_LABEL_IDS: Record<ProviderType, FluentMessageId> = {
	openai: "provider-type-openai",
	deepseek: "provider-type-deepseek",
	ollama: "provider-type-ollama",
};

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_MODELS = ["deepseek-v4-pro", "deepseek-v4-flash"];
export const OLLAMA_DEFAULT_PORT = 11434;

export function generateProviderId(): string {
	return (
		Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
	);
}
