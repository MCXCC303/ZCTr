/**
 * Term-collect actions - the write side of the "+ 收录" closed loop
 * (popup selection/translation -> termbase). Lives behind the translation
 * layer so the reader UI never touches the terminology store directly
 * (ZCTr-modules-ARCHITECTURE.md: reader -> translation -> terminology).
 *
 * Refusal policy (user-confirmed strategy, v1):
 * - language-pair conflict: the chosen termbase pair must be compatible
 *   with the document language (source side) and the translation target
 *   language (target side). A mismatched pair would make the entry dead
 *   data (the matcher only looks at terms in the termbase's own languages),
 *   so the add is REFUSED with an explanatory alert;
 * - duplicate source term (normalized, in the termbase's source language):
 *   REFUSED - edits belong to the termbase manager.
 *
 * Selection pre-filter (isCollectableTermText): a term is short by nature -
 * term-extraction statistics put ~90% of terms at 1-4 words and essentially
 * all glossary entries below 8 words; CJK terms (no word boundaries) run
 * 2-6 characters with long technical terms rarely exceeding ~15. Selections
 * beyond those ranges are sentences, not terms, and the "+ 收录" option is
 * withheld entirely (the popup footer does not render).
 */

/**
 * Length pre-filter for a term candidate. True only for text that can
 * plausibly BE a term; sentences/paragraphs are rejected so the collect
 * option never appears for them.
 *
 * Rejection rules (tunable):
 * - contains a line break (terms never span lines);
 * - > MAX_TERM_WORDS whitespace-separated words (space-delimited languages);
 * - > MAX_TERM_CHARS characters (long phrases);
 * - a whitespace-free CJK run > MAX_CJK_TERM_CHARS characters (Chinese/
 *   Japanese sentences have no spaces, so the char count is the only bound).
 */
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
		// CJK run without word boundaries: judge by character count only.
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

export type CollectStatus = TermStatus;
export const COLLECT_STATUSES: CollectStatus[] = [
	"preferred",
	"admitted",
	"forbidden",
	"deprecated",
];

/** Neutral termbase descriptor for the collect form (no model types leak
 * into the reader UI). */
export interface CollectableTermbase {
	termbaseId: string;
	name: string;
	sourceLanguage: string;
	targetLanguage: string;
	entryCount: number;
}

/** Language facts of the request the term came from. */
export interface CollectContextLanguages {
	/** Document language from item metadata; undefined when unknown. */
	docLanguage?: string;
	/** Translation target language code (always known from prefs). */
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

/** All termbases the collect form can offer (manager order). */
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

/**
 * Default termbase for the collect form (minimal-bridging policy):
 * the active termbase (termbase manager selection) when it exists, else the
 * first termbase whose target language is compatible with the translation
 * target, else the first one. The user can always pick another one.
 */
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

/**
 * Validate and persist one collected term. Never throws: every failure is
 * returned as a structured refusal with a user-ready message.
 */
export async function collectTerm(
	payload: CollectPayload,
	langs: CollectContextLanguages,
): Promise<CollectResult> {
	const tb = await loadTermbase(payload.termbaseId);
	if (!tb) {
		return {
			ok: false,
			reason: "not-found",
			message: "术语库不存在或无法读取，请重新打开收录窗口。",
		};
	}
	const source = payload.sourceText.trim();
	const target = payload.targetText.trim();
	if (!source || !target) {
		return {ok: false, reason: "empty", message: "源术语与目标术语不能为空。"};
	}

	// Language-pair conflict -> refuse (entry would never match).
	if (
		langs.docLanguage &&
		!languagesCompatible(tb.sourceLanguage, langs.docLanguage)
	) {
		return {
			ok: false,
			reason: "pair-conflict",
			message: `术语库语言对为 ${tb.sourceLanguage} → ${tb.targetLanguage}，与当前文档语言（${langs.docLanguage}）冲突：该词条的源术语永远不会被匹配到。请选择语言对匹配的术语库。`,
		};
	}
	if (!languagesCompatible(tb.targetLanguage, langs.targetLanguage)) {
		return {
			ok: false,
			reason: "pair-conflict",
			message: `术语库语言对为 ${tb.sourceLanguage} → ${tb.targetLanguage}，与当前翻译目标语言（${langs.targetLanguage}）不匹配。请选择语言对匹配的术语库。`,
		};
	}

	// Duplicate source term (normalized) -> refuse; edits belong to the
	// termbase manager (variants / status changes would pollute matching).
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
					message: `源术语「${term.text}」已存在于术语库「${tb.name}」（词条 ${entry.conceptId}）。`,
				};
			}
		}
	}

	// Same entry shape as the termbase manager's editor (see termbase-ui.ts
	// formConcept): one concept, two terms tagged with the termbase's own
	// language codes.
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
			message: `保存失败：${(error as Error)?.message ?? String(error)}`,
		};
	}
	return {ok: true, conceptId, termbaseName: tb.name};
}

/** Shape guard used by the collect form (kept in the layer contract). */
export function describeTermbasePair(tb: Pick<Termbase, "sourceLanguage" | "targetLanguage">): string {
	return `${tb.sourceLanguage} → ${tb.targetLanguage}`;
}
