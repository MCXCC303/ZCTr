/**
 * ZCTr translator - provider management and OpenAI-compatible chat completions.
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
 * Security: apiKey is NOT stored in the providers pref. It is kept in the
 * Firefox login manager (Services.logins, NSS-encrypted) keyed by provider id,
 * and merged back into the provider config when a request is made.
 */

import { PREFS, getPref, setPref } from "../../utils/prefs";

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

// ---------------------------------------------------------------------------
// API key storage (Firefox login manager, NSS-encrypted)
// ---------------------------------------------------------------------------

const KEY_HOST = "https://zctr.local";
const KEY_PREFIX = "zctr:";

function keyName(providerId: string): string {
  return `${KEY_PREFIX}${providerId}`;
}

/**
 * Store (or remove, when empty) a provider's API key.
 *
 * Firefox 137+ replaced `nsILoginManager.addLogin` with the async
 * `addLoginAsync`; Zotero 9 runs on such a build.
 */
export async function setProviderApiKey(
  providerId: string,
  apiKey: string,
): Promise<void> {
  try {
    const existing = Services.logins.findLogins(KEY_HOST, "", "");
    for (const login of existing) {
      if (login.username === keyName(providerId)) {
        Services.logins.removeLogin(login);
      }
    }
    if (apiKey) {
      // LoginInfo (LoginHelper) sets httpRealm/formActionOrigin to null
      // explicitly, avoiding nsILoginInfo.init() argument-mapping quirks on
      // Firefox 140 that otherwise trip LoginManager's _checkLogin.
      const { LoginInfo } = ChromeUtils.importESModule(
        "resource://gre/modules/LoginHelper.sys.mjs",
      );
      const login = new LoginInfo(
        KEY_HOST,
        null,
        null,
        keyName(providerId),
        apiKey,
        null,
        null,
      );
      await (Services.logins as any).addLoginAsync(login);
    }
  } catch (error) {
    ztoolkit.log("[ZCTr] Failed to store API key:", error);
  }
}

/** Read a provider's API key from the login manager. */
export function getProviderApiKey(providerId: string): string {
  try {
    const logins = Services.logins.findLogins(KEY_HOST, "", "");
    for (const login of logins) {
      if (login.username === keyName(providerId)) {
        return login.password || "";
      }
    }
  } catch (error) {
    ztoolkit.log("[ZCTr] Failed to read API key:", error);
  }
  return "";
}

// ---------------------------------------------------------------------------
// Provider management
// ---------------------------------------------------------------------------

/** Resolve the request base URL for a provider. */
export function getApiBaseUrl(provider: ProviderConfig): string {
  switch (provider.type) {
    case "deepseek":
      return DEEPSEEK_BASE_URL;
    case "ollama":
      return `http://localhost:${provider.port || OLLAMA_DEFAULT_PORT}/v1`;
    default:
      return (provider.apiBaseUrl || "").replace(/\/+$/, "");
  }
}

export function getProviders(): ProviderConfig[] {
  try {
    const raw = getPref(PREFS.PROVIDERS) as string;
    const list = JSON.parse(raw || "[]");
    if (!Array.isArray(list)) {
      return [];
    }
    let migrated = false;
    const providers: ProviderConfig[] = list.map(
      (p: any): ProviderConfig => {
        const provider: ProviderConfig = { type: "openai", ...p };
        // One-time migration of plaintext apiKey (pre type-field versions)
        // into the login manager, then drop it from the stored JSON.
        if (provider.apiKey) {
          setProviderApiKey(provider.id, provider.apiKey).catch(() => {});
          delete provider.apiKey;
          migrated = true;
        }
        return provider;
      },
    );
    if (migrated) {
      saveProviders(providers);
    }
    return providers;
  } catch (error) {
    ztoolkit.log("[ZCTr] Failed to parse providers:", error);
    return [];
  }
}

/**
 * Persist providers. apiKey is never written to the pref - call
 * `setProviderApiKey(id, key)` separately for sensitive credentials.
 */
export function saveProviders(providers: ProviderConfig[]): void {
  setPref(
    PREFS.PROVIDERS,
    JSON.stringify(providers.map(({ apiKey: _apiKey, ...rest }) => rest)),
  );
}

/** The active provider with its API key merged back in. */
export function getActiveProvider(): ProviderConfig | null {
  const activeId = getPref(PREFS.ACTIVE_PROVIDER_ID) as string;
  if (!activeId) {
    return null;
  }
  const provider = getProviders().find((p) => p.id === activeId);
  if (!provider) {
    return null;
  }
  return { ...provider, apiKey: getProviderApiKey(provider.id) };
}

export function setActiveProvider(id: string): void {
  setPref(PREFS.ACTIVE_PROVIDER_ID, id);
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
 * Translate `text` to `targetLang` via an OpenAI-compatible /chat/completions
 * endpoint (non-streaming). Returns the assistant message content.
 */
export async function translateText(
  provider: ProviderConfig,
  text: string,
  targetLang: string,
): Promise<string> {
  const url = `${getApiBaseUrl(provider)}/chat/completions`;

  let response;
  try {
    response = await Zotero.HTTP.request("POST", url, {
      headers: buildHeaders(provider),
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
  const url = `${getApiBaseUrl(provider)}/chat/completions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(provider),
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

export interface OllamaModelInfo {
  name: string;
  parameterSize?: string;
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
    response = await fetch(url, { method: "GET" });
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
