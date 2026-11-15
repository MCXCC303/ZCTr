import {getPref, PREFS} from "../../utils/prefs";
import * as zlog from "../../utils/logger";

export interface TranslationRuntimeConfig {
	temperature: number;
	topP?: number;
	topK?: number;
	repetitionPenalty?: number;
	maxOutputTokens?: number;
	stream: boolean;
}

export const TEMPERATURE_MIN = 0;
export const TEMPERATURE_MAX = 2;
export const TOP_P_MIN = 0;
export const TOP_P_MAX = 1;
export const REPETITION_PENALTY_MIN = 1;

/** Product default: deterministic translation. */
export const DEFAULT_TEMPERATURE = 0;
export const DEFAULT_STREAM = true;

export interface RuntimeConfigIssue {
	field: keyof TranslationRuntimeConfig;
	message: string;
}

/**
 * Returns a list of issues; empty means usable. Invalid optional values are
 * treated as "not sent" by getRuntimeConfig() rather than transmitted.
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
			issues.push({field, message: `${String(field)} must be a finite number`});
			return;
		}
		if (value < min || (max !== undefined && value > max)) {
			issues.push({
				field,
				message: `${String(field)} must be within ${min}${max !== undefined ? `..${max}` : "+"}`,
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

/** `stream` is excluded from the cache key (transport behavior, not semantics). */
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
		// Never fail a request over a sampling parameter: log and continue.
		zlog.info("runtime config validation issues:",
			issues.map((i) => i.message).join("; "),
		);
	}
	return cfg;
}

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
