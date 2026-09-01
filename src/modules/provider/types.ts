/**
 * Provider domain - configuration model and constants (Phase 0 contract,
 * see ZCTr-existing-version-optimization-ARCHITECTURE.md).
 *
 * Providers are stored in the `providers` pref as a JSON array:
 *   [{ id, type, name, apiBaseUrl?, model?, port? }]
 * The active provider id is stored in `activeProviderId`.
 *
 * Provider types:
 * - openai:   generic OpenAI-compatible endpoint (apiBaseUrl + apiKey + model)
 * - deepseek: DeepSeek platform (built-in base URL, apiKey + model)
 * - ollama:   local Ollama server (port + model, OpenAI-compatible /v1 endpoint)
 *
 * Security: apiKey is NOT stored in the providers pref (see credentials.ts).
 */

export type ProviderType = "openai" | "deepseek" | "ollama";

export interface ProviderConfig {
	id: string;
	type: ProviderType;
	name: string;
	/** OpenAI-compatible endpoint base URL (openai type). */
	apiBaseUrl?: string;
	/** API key (openai / deepseek; Ollama accepts any or none). */
	apiKey?: string;
	/** Model name. */
	model?: string;
	/** Ollama local port (default 11434). */
	port?: number;
}

export const PROVIDER_TYPES: ProviderType[] = ["openai", "deepseek", "ollama"];

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
	openai: "OpenAI 兼容",
	deepseek: "DeepSeek",
	ollama: "Ollama",
};

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_MODELS = ["deepseek-v4-pro", "deepseek-v4-flash"];
export const OLLAMA_DEFAULT_PORT = 11434;

export function generateProviderId(): string {
	return (
		Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
	);
}
