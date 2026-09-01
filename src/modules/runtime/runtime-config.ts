/**
 * ZCTr runtime configuration - model generation parameters.
 *
 * Implements the Phase 0 `TranslationRuntimeConfig` request contract
 * (see ZCTr-existing-version-optimization-ARCHITECTURE.md §3-§8):
 *
 * - parameters are read from preferences ("" = not set = not sent);
 * - Provider adapters (provider/adapter.ts) decide which fields can
 *   actually be transmitted;
 * - the canonical form used for cache keys records unset fields as `null`,
 *   so that "not sent" never collides with "sent with a default value".
 */

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
