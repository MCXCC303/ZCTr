/**
 * ZCTr runtime configuration - model generation parameters.
 *
 * Implements the Phase 0 `TranslationRuntimeConfig` request contract
 * (see ZCTr-existing-version-optimization-ARCHITECTURE.md §3-§8):
 *
 * - parameters are read from preferences ("" = not set = not sent);
 * - Provider adapters decide which fields can actually be transmitted;
 * - unsupported fields are safely ignored and logged in diagnostics;
 * - the canonical form used for cache keys records unset fields as `null`,
 *   so that "not sent" never collides with "sent with a default value".
 */

import type {ProviderType} from "./translator";
import {getPref, PREFS} from "../../utils/prefs";

export interface TranslationRuntimeConfig {
	/** Sampling temperature. Always sent (default 0 = deterministic). */
	temperature: number;
	/** Nucleus sampling (top_p). undefined = not sent. */
	topP?: number;
	/** Top-K sampling. undefined = not sent. */
	topK?: number;
	/** Repetition penalty. undefined = not sent. */
	repetitionPenalty?: number;
	/** Max output tokens. undefined = not sent (provider default). */
	maxOutputTokens?: number;
	/** Streaming (SSE) transport, from the existing streaming pref. */
	stream: boolean;
}

export const TEMPERATURE_MIN = 0;
export const TEMPERATURE_MAX = 2;
export const TOP_P_MIN = 0;
export const TOP_P_MAX = 1;
export const REPETITION_PENALTY_MIN = 1;

/** Product default (see architecture §6): deterministic academic translation. */
export const DEFAULT_TEMPERATURE = 0;
export const DEFAULT_STREAM = true;

export interface RuntimeConfigIssue {
	field: keyof TranslationRuntimeConfig;
	message: string;
}

/**
 * Validate a runtime config. Returns a list of issues; an empty list means
 * the config is usable. Invalid optional values are treated as "not sent"
 * by `getRuntimeConfig()` rather than silently transmitted.
 */
export function validateRuntimeConfig(
	cfg: Partial<TranslationRuntimeConfig>,
): RuntimeConfigIssue[] {
	const issues: RuntimeConfigIssue[] = [];
	const num = (v: unknown): v is number =>
		typeof v === "number" && Number.isFinite(v);
	const checkRange = (
		field: keyof TranslationRuntimeConfig,
		value: unknown,
		min: number,
		max: number | undefined,
		integer: boolean,
	): void => {
		if (value === undefined) {
			return;
		}
		if (!num(value) || (integer && !Number.isInteger(value))) {
			issues.push({field, message: `${String(field)} 必须是有限数字`});
			return;
		}
		if (value < min || (max !== undefined && value > max)) {
			issues.push({
				field,
				message: `${String(field)} 必须在 ${min}${max !== undefined ? `..${max}` : " 以上"} 范围内`,
			});
		}
	};

	checkRange("temperature", cfg.temperature, TEMPERATURE_MIN, TEMPERATURE_MAX, false);
	checkRange("topP", cfg.topP, TOP_P_MIN, TOP_P_MAX, false);
	checkRange("topK", cfg.topK, 0, undefined, true);
	checkRange("repetitionPenalty", cfg.repetitionPenalty, REPETITION_PENALTY_MIN, undefined, false);
	checkRange("maxOutputTokens", cfg.maxOutputTokens, 1, undefined, true);
	return issues;
}

/** Preferences store "" (or nothing) for "not sent"; numbers otherwise. */
function parseOptionalNumber(raw: unknown): number | undefined {
	if (raw === "" || raw === null || raw === undefined) {
		return undefined;
	}
	const n = typeof raw === "number" ? raw : Number(raw);
	return Number.isFinite(n) ? n : undefined;
}

/**
 * Read the current runtime config from preferences.
 *
 * `stream` is transport behavior (SSE vs one-shot) and is intentionally
 * excluded from cache identity; see `canonicalRuntimeConfig()`.
 */
export function getRuntimeConfig(): TranslationRuntimeConfig {
	const rawTemperature = getPref(PREFS.TEMPERATURE);
	const temperature =
		typeof rawTemperature === "number" && Number.isFinite(rawTemperature)
			? rawTemperature
			: DEFAULT_TEMPERATURE;
	const stream = getPref(PREFS.STREAMING) !== false;

	const cfg: TranslationRuntimeConfig = {
		temperature,
		topP: parseOptionalNumber(getPref(PREFS.TOP_P)),
		topK: parseOptionalNumber(getPref(PREFS.TOP_K)),
		repetitionPenalty: parseOptionalNumber(getPref(PREFS.REPETITION_PENALTY)),
		maxOutputTokens: parseOptionalNumber(getPref(PREFS.MAX_OUTPUT_TOKENS)),
		stream,
	};

	const issues = validateRuntimeConfig(cfg);
	if (issues.length) {
		// Illegal configuration should be prevented by the settings UI; if it
		// nevertheless reaches this point, log and continue (never fail a
		// translation request because of a sampling parameter).
		ztoolkit.log(
			"[ZCTr] runtime config validation issues:",
			issues.map((i) => i.message).join("; "),
		);
	}
	return cfg;
}

/**
 * Canonical form of the runtime config for cache identity.
 *
 * Unset optional fields are recorded as `null` (not omitted), so a request
 * that does not send `topP` never collides with one that explicitly sends
 * a topP value. `stream` is deliberately excluded: it is transport behavior
 * and must not affect the semantic cache key.
 */
export function canonicalRuntimeConfig(
	cfg: TranslationRuntimeConfig,
): Record<string, unknown> {
	return {
		temperature: cfg.temperature,
		topP: cfg.topP ?? null,
		topK: cfg.topK ?? null,
		repetitionPenalty: cfg.repetitionPenalty ?? null,
		maxOutputTokens: cfg.maxOutputTokens ?? null,
	};
}

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
 * Map a runtime config to provider-specific request fields (architecture §7).
 * Unsupported fields are safely ignored and reported for diagnostics - they
 * must never make the request fail.
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
