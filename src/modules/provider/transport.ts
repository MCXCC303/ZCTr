/**
 * Provider transport - OpenAI-compatible /chat/completions requests
 * (one-shot and SSE streaming) and the Ollama connectivity test.
 *
 * Pure transport: receives already-built messages and the runtime config,
 * maps them through the adapter, performs HTTP, parses SSE. It does NOT
 * know about context, terminology or profiles (see
 * ZCTr-modules-ARCHITECTURE.md §2.3).
 */

import type {ProviderConfig} from "./types";
import {buildProviderPayloadParams} from "./adapter";
import type {TranslationRuntimeConfig} from "../runtime/runtime-config";
import * as zlog from "../../utils/logger";

export interface ChatMessage {
	role: string;
	content: string;
}

export interface OllamaModelInfo {
	name: string;
	parameterSize?: string;
}

/** Resolve the request base URL for a provider. */
export function getApiBaseUrl(provider: ProviderConfig): string {
	switch (provider.type) {
		case "deepseek":
			return "https://api.deepseek.com";
		case "ollama":
			return `http://localhost:${provider.port || 11434}/v1`;
		default:
			return (provider.apiBaseUrl || "").replace(/\/+$/, "");
	}
}

function buildHeaders(provider: ProviderConfig): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	// Ollama's OpenAI-compatible endpoint accepts any key (or none)
	if (provider.apiKey && provider.type !== "ollama") {
		headers.Authorization = `Bearer ${provider.apiKey}`;
	}
	return headers;
}

/**
 * Translate via an OpenAI-compatible /chat/completions endpoint
 * (non-streaming). Returns the assistant message content.
 *
 * `stop` sequences are forwarded to the provider when given (used as a hard
 * stop at the target's closing marker - see translation/prompt.ts).
 */
function debugDumpRequest(
	provider: ProviderConfig,
	url: string,
	payload: Record<string, unknown>,
	messages: ChatMessage[],
	stop?: string[],
): void {
	// One log line per source line, prefixed by role, so the structure is
	// readable at a glance in the debug console (which field leaked, which
	// block was attached, where the target sits).
	zlog.debug("======================== provider request ========================");
	zlog.debug(`url=${url} model=${provider.model} type=${provider.type} stop=${JSON.stringify(stop ?? [])}`);
	zlog.debug(`payload=${JSON.stringify(payload)}`);
	for (const msg of messages) {
		const role = msg.role === "user" ? "U" : "S";
		zlog.debug(`---------- ${role} (${msg.role}) message ----------`);
		for (const line of String(msg.content ?? "").split("\n")) {
			zlog.debug(`${role} | ${line}`);
		}
	}
	zlog.debug("====================== end provider request ======================");
}

export async function translateText(
	provider: ProviderConfig,
	messages: ChatMessage[],
	runtimeConfig: TranslationRuntimeConfig,
	stop?: string[],
): Promise<string> {
	const url = `${getApiBaseUrl(provider)}/chat/completions`;
	const {payload, ignored} = buildProviderPayloadParams(provider.type, runtimeConfig);
	if (ignored.length) {
		zlog.warn(`Provider 不支持以下参数，已安全忽略: ${ignored.join(", ")}`);
	}
	zlog.debug(`provider request: model=${provider.model} type=${provider.type} messages=${messages.length} target_chars=${messages[messages.length - 1]?.content?.length ?? 0}`);
	debugDumpRequest(provider, url, payload, messages, stop);

	let response;
	try {
		response = await Zotero.HTTP.request("POST", url, {
			headers: buildHeaders(provider),
			body: JSON.stringify({
				model: provider.model,
				messages,
				...payload,
				...(stop?.length ? {stop} : {}),
			}),
			responseType: "json",
			timeout: 60000,
		});
	} catch (error) {
		zlog.warn("Translate request error:", error);
		throw new Error(
			(error as Error)?.message || "Network error when calling the API",
		);
	}

	if (response.status < 200 || response.status >= 300) {
		const apiError =
			response.response?.error?.message ||
			`HTTP ${response.status}`;
		zlog.warn("Translate API error:", response.status, response.response);
		throw new Error(String(apiError));
	}

	const content: string | undefined =
		response.response?.choices?.[0]?.message?.content;
	if (!content) {
		throw new Error("Empty translation response");
	}
	return content;
}

/**
 * Translate with streaming (SSE) output. `onDelta` is invoked with each
 * content chunk as it arrives. Resolves with the full translation when the
 * stream finishes.
 *
 * `stop` sequences are forwarded to the provider when given (see
 * translateText).
 */
export async function translateTextStreaming(
	provider: ProviderConfig,
	messages: ChatMessage[],
	runtimeConfig: TranslationRuntimeConfig,
	onDelta: (delta: string) => void,
	stop?: string[],
): Promise<string> {
	const url = `${getApiBaseUrl(provider)}/chat/completions`;
	const {payload, ignored} = buildProviderPayloadParams(provider.type, runtimeConfig);
	if (ignored.length) {
		zlog.warn(`Provider 不支持以下参数，已安全忽略: ${ignored.join(", ")}`);
	}
	zlog.debug(`provider request: model=${provider.model} type=${provider.type} messages=${messages.length} target_chars=${messages[messages.length - 1]?.content?.length ?? 0}`);
	// Full debugging dump (see translateText) - streaming variant.
	debugDumpRequest(provider, url, {...payload, stream: true}, messages, stop);

	let response: Response;
	try {
		response = await fetch(url, {
			method: "POST",
			headers: buildHeaders(provider),
			body: JSON.stringify({
				model: provider.model,
				messages,
				...payload,
				stream: true,
				...(stop?.length ? {stop} : {}),
			}),
		});
	} catch (error) {
		zlog.warn("Streaming request error:", error);
		throw new Error(
			(error as Error)?.message || "Network error when calling the API",
		);
	}

	if (!response.ok || !response.body) {
		let message = `HTTP ${response.status}`;
		try {
			const body = (await response.json()) as any;
			message = body?.error?.message || message;
		} catch {
			// Error body was not JSON
		}
		throw new Error(message);
	}

	const body: ReadableStream = response.body;
	const decoder = new TextDecoder("utf-8");
	let buffer = "";
	let full = "";
	let deltaCount = 0;

	for await (const chunk of body) {
		buffer += decoder.decode(chunk as Uint8Array, {stream: true});

		// Parse complete SSE lines, keep the trailing partial line in the buffer
		let newlineIndex: number;
		while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, newlineIndex).trim();
			buffer = buffer.slice(newlineIndex + 1);
			if (!line.startsWith("data:")) {
				continue;
			}
			const data = line.slice(5).trim();
			if (!data || data === "[DONE]") {
				continue;
			}
			try {
				const json = JSON.parse(data);
				const delta = json?.choices?.[0]?.delta?.content;
				if (typeof delta === "string" && delta) {
					full += delta;
					deltaCount++;
					onDelta(delta);
				}
			} catch {
				// Incomplete JSON in a chunk; ignore
			}
		}
	}
	zlog.debug(`streaming done: ${deltaCount} deltas, ${full.length} chars`);

	if (!full) {
		throw new Error("Empty translation response");
	}
	return full;
}

/**
 * Check that a local Ollama server is reachable and list its installed
 * models via `GET /api/tags`.
 */
export async function testOllamaConnection(
	port: number,
): Promise<OllamaModelInfo[]> {
	const url = `http://localhost:${port}/api/tags`;
	let response: Response;
	try {
		response = await fetch(url, {method: "GET"});
	} catch (error) {
		throw new Error(
			(error as Error)?.message || "无法连接 Ollama 服务",
		);
	}
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	const body = (await response.json()) as any;
	const models = Array.isArray(body?.models) ? body.models : [];
	return models
		.map((m: any) => ({
			name: String(m?.name || m?.model || ""),
			parameterSize: m?.details?.parameter_size,
		}))
		.filter((m: { name: string }) => m.name);
}
