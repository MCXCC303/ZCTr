/**
 * Term matcher - deterministic, local-only matching of source terms against
 * the translation input (architecture §12; P2 plan §3.2).
 *
 * Pipeline: Unicode/dash/whitespace normalization -> exact phrase match
 * (case-insensitive by default, term.caseSensitive opt-in) -> variant
 * expansion. Every occurrence is recorded WITH its position so the conflict
 * resolver can apply the longest-match rule correctly (two terms may appear
 * independently in different parts of the text).
 *
 * No fuzzy matching, no morphology, no network - false positives are worse
 * than missed terms in academic translation.
 */

import {
	TERMBASE_SCHEMA_VERSION,
	type ConceptEntry,
	type Term,
	type Termbase,
	type TerminologyMatchInput,
} from "./model";

/** Unicode dashes unified to ASCII hyphen for matching. */
const DASH_RE = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g;

/**
 * Normalize text into a canonical match key: NFC, dash unification,
 * whitespace folding, optional case folding.
 */
export function toMatchKey(text: string, lowercase = true): string {
	let key = text
		.normalize("NFC")
		.replace(DASH_RE, "-")
		.replace(/\s+/g, " ")
		.trim();
	return lowercase ? key.toLowerCase() : key;
}

/** All occurrences (start/end, half-open) of `needle` in `hay`. */
function allIndexes(hay: string, needle: string): Array<{start: number; end: number}> {
	if (!needle || needle.length > hay.length) {
		return [];
	}
	const out: Array<{start: number; end: number}> = [];
	let from = 0;
	while (true) {
		const idx = hay.indexOf(needle, from);
		if (idx === -1) {
			break;
		}
		out.push({start: idx, end: idx + needle.length});
		from = idx + 1;
	}
	return out;
}

/** A source term found in the input, with its position and in-concept target. */
export interface TermOccurrence {
	concept: ConceptEntry;
	sourceTerm: Term;
	/** Preferred target term of the concept, when present. */
	targetTerm?: Term;
	/** The normalized key that matched (term text or a variant). */
	key: string;
	start: number;
	end: number;
}

/** Build the case-folded / exact normalized inputs once per request. */
export function buildInputKeys(input: TerminologyMatchInput): {
	lower: string;
	exact: string;
} {
	const raw = [
		input.selectedText,
		input.localContext,
		input.documentTitle,
		input.abstract,
	]
		.filter((s): s is string => !!s)
		.join("\n");
	return {
		lower: toMatchKey(raw, true),
		exact: toMatchKey(raw, false),
	};
}

/**
 * Match one termbase against the input. Returns every occurrence of every
 * source-language term (and its variants). Unresolved overlaps are handled
 * by the conflict resolver.
 */
export function matchTermbase(
	termbase: Termbase,
	input: TerminologyMatchInput,
): TermOccurrence[] {
	const {lower, exact} = buildInputKeys(input);
	const occurrences: TermOccurrence[] = [];

	for (const concept of termbase.entries ?? []) {
		const sources = (concept.terms ?? []).filter(
			(t) => t.language === termbase.sourceLanguage,
		);
		const targets = (concept.terms ?? []).filter(
			(t) => t.language === termbase.targetLanguage,
		);
		if (!sources.length || !targets.length) {
			continue;
		}
		// Deterministic preferred target (preferred first, then first by id).
		const targetTerm =
			targets.find((t) => t.status === "preferred") ??
			targets.slice().sort((a, b) => a.termId.localeCompare(b.termId))[0];

		for (const source of sources) {
			const keys = [source.text, ...(source.variants ?? [])];
			for (const keyText of keys) {
				const caseSensitive = !!source.caseSensitive;
				const needle = toMatchKey(keyText, !caseSensitive);
				const hay = caseSensitive ? exact : lower;
				for (const {start, end} of allIndexes(hay, needle)) {
					occurrences.push({
						concept,
						sourceTerm: source,
						targetTerm,
						key: toMatchKey(keyText, true),
						start,
						end,
					});
				}
			}
		}
	}
	return occurrences;
}

/** Stable signature of the matcher contract (cache + diagnostics). */
export function terminologySchemaVersion(): number {
	return TERMBASE_SCHEMA_VERSION;
}
