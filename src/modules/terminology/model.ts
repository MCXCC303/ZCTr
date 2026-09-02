/**
 * Terminology domain - concept-oriented data model (Phase 2, see
 * ZCTr-terminology-ARCHITECTURE.md §6 and ZCTr-terminology-P2-plan.md).
 *
 * Concept-oriented model inspired by ISO 30042 / TBX: a concept holds terms
 * in multiple languages; terms carry a status (preferred / admitted /
 * forbidden / deprecated) and optional variants. A Termbase is bound to one
 * language pair ({sourceLanguage, targetLanguage}) so cross-language-pair
 * terms never leak into a request.
 *
 * This module is intentionally dependency-free (pure TS).
 */

export type TermStatus = "preferred" | "admitted" | "forbidden" | "deprecated";

export interface Term {
	termId: string;
	/** Language code, e.g. "en" or "zh-CN". */
	language: string;
	text: string;
	status: TermStatus;
	/** When true, matching is case-sensitive (default: case-insensitive). */
	caseSensitive?: boolean;
	/** Alternate surface forms that also match (e.g. "fine tuning", "fine-tuned"). */
	variants?: string[];
	partOfSpeech?: string;
	note?: string;
}

export interface ScopeRef {
	/** v1: only "termbase" is active; library/collection/profile are reserved. */
	type: "termbase" | "library" | "collection" | "profile";
	id: string;
}

export interface ConceptEntry {
	conceptId: string;
	domainIds?: string[];
	/** Localized definition/note (UI-friendly; not part of matching). */
	definition?: string;
	notes?: string[];
	terms: Term[];
	scopes?: ScopeRef[];
	createdAt: number;
	updatedAt: number;
	schemaVersion: number;
}

export interface Termbase {
	termbaseId: string;
	name: string;
	description?: string;
	sourceLanguage: string;
	targetLanguage: string;
	entries: ConceptEntry[];
	createdAt: number;
	updatedAt: number;
	schemaVersion: number;
}

/** Version of the persisted termbase schema. */
export const TERMBASE_SCHEMA_VERSION = 1;

/** Cap on matched terms injected into a single request (prompt economy). */
export const DEFAULT_MAX_MATCHED_TERMS = 12;

/**
 * Input contract consumed by the terminology layer (architecture §17).
 * `selectedText` is always included - a selection that IS a term (e.g.
 * "twistane") must still match.
 */
export interface TerminologyMatchInput {
	selectedText: string;
	localContext?: string;
	documentTitle?: string;
	abstract?: string;
	/** Target language code, e.g. "zh-CN". */
	targetLanguage: string;
}

/** A source term found in the input, with its in-concept target term. */
export interface MatchedTerm {
	conceptId: string;
	/** The source-language term text as stored. */
	sourceText: string;
	/** The target-language term text to use (undefined when the concept has no
	 * term in the requested target language). */
	targetText?: string;
	status: TermStatus;
	scopeType: ScopeRef["type"];
	scopeId: string;
	/** Match span in the (space-folded) input keys; used for cross-termbase
	 * overlap suppression. Deliberately EXCLUDED from the cache fingerprint
	 * (it is derived data, not a semantic input). */
	start?: number;
	end?: number;
}

/** Final, resolved set of terms for one request (ready for injection). */
export interface MatchedTermSet {
	termbaseIds: string[];
	schemaVersion: number;
	matched: MatchedTerm[];
}

/**
 * Deterministic canonical form of a matched set, used for cache fingerprints.
 * Sorted by concept id so identical sets always hash identically.
 */
export function canonicalMatchedTermSet(
	set: MatchedTermSet,
): Record<string, unknown> {
	const matched = set.matched
		.slice()
		.sort((a, b) => a.conceptId.localeCompare(b.conceptId))
		.map((m) => ({
			conceptId: m.conceptId,
			sourceText: m.sourceText,
			targetText: m.targetText ?? null,
			status: m.status,
			scopeType: m.scopeType,
			scopeId: m.scopeId,
		}));
	return {
		termbaseIds: set.termbaseIds.slice().sort(),
		schemaVersion: set.schemaVersion,
		matched,
	};
}

/** Validate a termbase; returns a list of human-readable issues (empty = OK). */
export function validateTermbase(tb: Termbase): string[] {
	const issues: string[] = [];
	if (!tb.termbaseId) {
		issues.push("termbaseId 不能为空");
	}
	if (!tb.sourceLanguage) {
		issues.push("sourceLanguage 不能为空");
	}
	if (!tb.targetLanguage) {
		issues.push("targetLanguage 不能为空");
	}
	if (tb.sourceLanguage === tb.targetLanguage) {
		issues.push("sourceLanguage 与 targetLanguage 不能相同");
	}
	// entries MAY be empty: a brand-new termbase starts empty and is filled
	// through the editor before it can match anything.
	if (!Array.isArray(tb.entries)) {
		issues.push("entries 必须是数组");
	}
	for (const entry of tb.entries ?? []) {
		if (!entry.conceptId) {
			issues.push("词条缺少 conceptId");
		}
		const sourceTerms = (entry.terms ?? []).filter(
			(t) => t.language === tb.sourceLanguage,
		);
		const targetTerms = (entry.terms ?? []).filter(
			(t) => t.language === tb.targetLanguage,
		);
		if (!sourceTerms.length || !targetTerms.length) {
			issues.push(
				`词条 ${entry.conceptId || "(无 id)"} 缺少 ${tb.sourceLanguage} 或 ${tb.targetLanguage} 术语`,
			);
		}
		for (const term of entry.terms ?? []) {
			if (!term.termId || !term.text) {
				issues.push(`词条 ${entry.conceptId || "(无 id)"} 存在空术语`);
			}
		}
	}
	return issues;
}
