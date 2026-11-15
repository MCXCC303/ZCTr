export const MAX_TERM_WORDS = 8;
export const MAX_TERM_CHARS = 60;
export const MAX_CJK_TERM_CHARS = 24;

/** CJK ideographs + kana + hangul (for whitespace-free run detection). */
const CJK_RE =
	/[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u3000-\u303F]/;

export function isCollectableTermText(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed || /[\n\r]/.test(trimmed)) {
		return false;
	}
	const cjkCount = (trimmed.match(CJK_RE) ?? []).length;
	const hasSpaces = /\s/.test(trimmed);
	if (!hasSpaces && cjkCount > 0) {
		return trimmed.length <= MAX_CJK_TERM_CHARS;
	}
	const words = trimmed.split(/\s+/).length;
	if (words > MAX_TERM_WORDS) {
		return false;
	}
	return trimmed.length <= MAX_TERM_CHARS;
}

import {
	TERMBASE_SCHEMA_VERSION,
	type Termbase,
	type TermStatus,
} from "../terminology/model";
import {toMatchKey} from "../terminology/matcher";
import {languagesCompatible} from "../terminology/scope";
import {listTermbases, loadTermbase, saveTermbase} from "../terminology/store";
import {getString} from "../../utils/locale";

export type CollectStatus = TermStatus;
export const COLLECT_STATUSES: CollectStatus[] = [
	"preferred",
	"admitted",
	"forbidden",
	"deprecated",
];

export interface CollectableTermbase {
	termbaseId: string;
	name: string;
	sourceLanguage: string;
	targetLanguage: string;
	entryCount: number;
}

export interface CollectContextLanguages {
	docLanguage?: string;
	targetLanguage: string;
}

export interface CollectPayload {
	termbaseId: string;
	sourceText: string;
	targetText: string;
	status: CollectStatus;
	/** Optional note (stored on the source term + concept). */
	note?: string;
}

export type CollectResult =
	| {ok: true; conceptId: string; termbaseName: string}
	| {
			ok: false;
			reason: "not-found" | "pair-conflict" | "duplicate" | "empty" | "save-failed";
			message: string;
	  };

export async function listCollectableTermbases(): Promise<CollectableTermbase[]> {
	const termbases = await listTermbases();
	return termbases.map((tb) => ({
		termbaseId: tb.termbaseId,
		name: tb.name,
		sourceLanguage: tb.sourceLanguage,
		targetLanguage: tb.targetLanguage,
		entryCount: tb.entries?.length ?? 0,
	}));
}

export function pickDefaultCollectTermbaseId(
	termbases: CollectableTermbase[],
	opts: {activeId: string | null; targetLanguage: string},
): string | null {
	if (!termbases.length) {
		return null;
	}
	if (opts.activeId) {
		const active = termbases.find((tb) => tb.termbaseId === opts.activeId);
		if (active) {
			return active.termbaseId;
		}
	}
	const effective = termbases.find((tb) =>
		languagesCompatible(tb.targetLanguage, opts.targetLanguage),
	);
	return effective?.termbaseId ?? termbases[0].termbaseId;
}

export async function collectTerm(
	payload: CollectPayload,
	langs: CollectContextLanguages,
): Promise<CollectResult> {
	const tb = await loadTermbase(payload.termbaseId);
	if (!tb) {
		return {
			ok: false,
			reason: "not-found",
			message: getString("term-error-not-found"),
		};
	}
	const source = payload.sourceText.trim();
	const target = payload.targetText.trim();
	if (!source || !target) {
		return {ok: false, reason: "empty", message: getString("term-error-empty")};
	}

	// Language-pair conflict -> refuse (entry would never match).
	if (
		langs.docLanguage &&
		!languagesCompatible(tb.sourceLanguage, langs.docLanguage)
	) {
		return {
			ok: false,
			reason: "pair-conflict",
			message: getString("term-error-doc-language", {
				args: {
					source: tb.sourceLanguage,
					target: tb.targetLanguage,
					docLang: langs.docLanguage,
				},
			}),
		};
	}
	if (!languagesCompatible(tb.targetLanguage, langs.targetLanguage)) {
		return {
			ok: false,
			reason: "pair-conflict",
			message: getString("term-error-target-language", {
				args: {
					source: tb.sourceLanguage,
					target: tb.targetLanguage,
					targetLang: langs.targetLanguage,
				},
			}),
		};
	}

	const needle = toMatchKey(source);
	for (const entry of tb.entries ?? []) {
		for (const term of entry.terms ?? []) {
			if (
				term.language === tb.sourceLanguage &&
				toMatchKey(term.text) === needle
			) {
				return {
					ok: false,
					reason: "duplicate",
					message: getString("term-error-duplicate", {
						args: {
							term: term.text,
							name: tb.name,
							conceptId: entry.conceptId,
						},
					}),
				};
			}
		}
	}

	const conceptId = `c-${Date.now().toString(36)}${Math.random()
		.toString(36)
		.slice(2, 6)}`;
	const now = Date.now();
	const note = payload.note?.trim() || undefined;
	const entry = {
		conceptId,
		terms: [
			{
				termId: `${conceptId}-src`,
				language: tb.sourceLanguage,
				text: source,
				status: payload.status,
				...(note ? {note} : {}),
			},
			{
				termId: `${conceptId}-tgt`,
				language: tb.targetLanguage,
				text: target,
				status: payload.status,
			},
		],
		...(note ? {notes: [note]} : {}),
		createdAt: now,
		updatedAt: now,
		schemaVersion: TERMBASE_SCHEMA_VERSION,
	};
	tb.entries.push(entry);
	tb.updatedAt = now;
	try {
		await saveTermbase(tb);
	} catch (error) {
		return {
			ok: false,
			reason: "save-failed",
			message: getString("term-error-save", {
				args: {detail: (error as Error)?.message ?? String(error)},
			}),
		};
	}
	return {ok: true, conceptId, termbaseName: tb.name};
}

/** Shape guard used by the collect form (kept in the layer contract). */
export function describeTermbasePair(tb: Pick<Termbase, "sourceLanguage" | "targetLanguage">): string {
	return `${tb.sourceLanguage} → ${tb.targetLanguage}`;
}
