/**
 * ZCTr translator - provider management and OpenAI-compatible chat completions.
 *
 * Providers are stored in the `providers` pref as a JSON array:
 *   [{ id, name, apiBaseUrl, apiKey, model }]
 * The active provider id is stored in `activeProviderId`.
 */

import { getPref, setPref } from "../../utils/prefs";

export interface ProviderConfig {
  id: string;
  name: string;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
}

export function generateProviderId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

export function getProviders(): ProviderConfig[] {
  try {
    const raw = getPref("providers") as string;
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list : [];
  } catch (error) {
    ztoolkit.log("[ZCTr] Failed to parse providers:", error);
    return [];
  }
}

export function saveProviders(providers: ProviderConfig[]): void {
  setPref("providers", JSON.stringify(providers));
}

export function getActiveProvider(): ProviderConfig | null {
  const activeId = getPref("activeProviderId") as string;
  if (!activeId) {
    return null;
  }
  return getProviders().find((p) => p.id === activeId) || null;
}

export function setActiveProvider(id: string): void {
  setPref("activeProviderId", id);
}

function buildMessages(text: string, targetLang: string) {
  return [
    {
      role: "system",
      content:
        `You are a professional translator. Translate the following text into ` +
        `the target language (language code: ${targetLang}). ` +
        `Preserve the original meaning, terminology, and formatting. ` +
        `Output only the translation, without any explanation, notes, or code fences.`,
    },
    { role: "user", content: text },
  ];
}

/**
 * Translate `text` to `targetLang` via an OpenAI-compatible /chat/completions
 * endpoint (non-streaming). Returns the assistant message content.
 */
export async function translateText(
  provider: ProviderConfig,
  text: string,
  targetLang: string,
): Promise<string> {
  const baseUrl = provider.apiBaseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  let response;
  try {
    response = await Zotero.HTTP.request("POST", url, {
      headers,
      body: JSON.stringify({
        model: provider.model,
        messages: buildMessages(text, targetLang),
        temperature: 0.3,
      }),
      responseType: "json",
      timeout: 60000,
    });
  } catch (error) {
    ztoolkit.log("[ZCTr] Translate request error:", error);
    throw new Error(
      (error as Error)?.message || "Network error when calling the API",
    );
  }

  if (response.status < 200 || response.status >= 300) {
    const apiError =
      response.response?.error?.message ||
      `HTTP ${response.status}`;
    ztoolkit.log("[ZCTr] Translate API error:", response.status, response.response);
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
 * Translate `text` to `targetLang` with streaming (SSE) output from an
 * OpenAI-compatible endpoint. `onDelta` is invoked with each content chunk as
 * it arrives. Resolves with the full translation when the stream finishes.
 */
export async function translateTextStreaming(
  provider: ProviderConfig,
  text: string,
  targetLang: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const baseUrl = provider.apiBaseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: provider.model,
        messages: buildMessages(text, targetLang),
        temperature: 0.3,
        stream: true,
      }),
    });
  } catch (error) {
    ztoolkit.log("[ZCTr] Streaming request error:", error);
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
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });

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
  Zotero.debug(
    `[ZCTr] streaming done: ${deltaCount} deltas, ${full.length} chars`,
  );

  if (!full) {
    throw new Error("Empty translation response");
  }
  return full;
}
