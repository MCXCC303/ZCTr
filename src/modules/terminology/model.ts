import {getString} from "../../utils/locale";

export type TermStatus = "preferred" | "admitted" | "forbidden" | "deprecated";

export interface Term {
	termId: string;
	language: string;
	text: string;
	status: TermStatus;
	caseSensitive?: boolean;
	/** Alternate surface forms that also match. */
	variants?: string[];
	partOfSpeech?: string;
	note?: string;
}

export interface ScopeRef {
	type: "termbase" | "library" | "collection" | "profile";
	id: string;
}

export interface ConceptEntry {
	conceptId: string;
	domainIds?: string[];
	/** Display-only; never matched. */
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

export const TERMBASE_SCHEMA_VERSION = 1;
export const DEFAULT_MAX_MATCHED_TERMS = 12;

export interface TerminologyMatchInput {
	selectedText: string;
	localContext?: string;
	documentTitle?: string;
	abstract?: string;
	targetLanguage: string;
}

export interface MatchedTerm {
	conceptId: string;
	sourceText: string;
	targetText?: string;
	status: TermStatus;
	scopeType: ScopeRef["type"];
	scopeId: string;
	start?: number;
	end?: number;
}

export interface MatchedTermSet {
	termbaseIds: string[];
	schemaVersion: number;
	matched: MatchedTerm[];
}

/**
 * Canonical form of a matched set for cache fingerprints; sorted by concept id
 * so identical sets always hash identically.
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

/** Returns the list of issues; an empty list means the termbase is valid. */
export function validateTermbase(tb: Termbase): string[] {
	const issues: string[] = [];
	if (!tb.termbaseId) {
		issues.push(getString("termbase-error-id"));
	}
	if (!tb.sourceLanguage) {
		issues.push(getString("termbase-error-source-language"));
	}
	if (!tb.targetLanguage) {
		issues.push(getString("termbase-error-target-language"));
	}
	if (tb.sourceLanguage === tb.targetLanguage) {
		issues.push(getString("termbase-error-same-language"));
	}
	// entries MAY be empty: a new termbase starts empty.
	if (!Array.isArray(tb.entries)) {
		issues.push(getString("termbase-error-entries"));
	}
	for (const entry of tb.entries ?? []) {
		if (!entry.conceptId) {
			issues.push(getString("termbase-error-concept-id"));
		}
		const sourceTerms = (entry.terms ?? []).filter(
			(t) => t.language === tb.sourceLanguage,
		);
		const targetTerms = (entry.terms ?? []).filter(
			(t) => t.language === tb.targetLanguage,
		);
		if (!sourceTerms.length || !targetTerms.length) {
			issues.push(
				getString("termbase-error-missing-pair", {
					args: {
						id: entry.conceptId || getString("termbase-error-no-id"),
						source: tb.sourceLanguage,
						target: tb.targetLanguage,
					},
				}),
			);
		}
		for (const term of entry.terms ?? []) {
			if (!term.termId || !term.text) {
				issues.push(
					getString("termbase-error-empty-term", {
						args: {
							id: entry.conceptId || getString("termbase-error-no-id"),
						},
					}),
				);
			}
		}
	}
	return issues;
}
