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

/** A character that can be part of a word (alnum incl. CJK). */
const WORD_CHAR_RE = /[A-Za-z0-9\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/;
function isWordChar(ch: string | undefined): boolean {
	return !!ch && WORD_CHAR_RE.test(ch);
}

/**
 * All occurrences (start/end, half-open) of `needle` in `hay`, restricted to
 * WORD BOUNDARIES when the needle starts/ends with a word character: "ear"
 * must not match inside "heart", and "heart" must not match inside
 * "heartbeat". A needle ending in punctuation (e.g. "heart.") keeps
 * exact-substring semantics on that side.
 */
function allIndexes(hay: string, needle: string): Array<{start: number; end: number}> {
	if (!needle || needle.length > hay.length) {
		return [];
	}
	const leftBound = WORD_CHAR_RE.test(needle[0]);
	const rightBound = WORD_CHAR_RE.test(needle[needle.length - 1]);
	const out: Array<{start: number; end: number}> = [];
	let from = 0;
	while (true) {
		const idx = hay.indexOf(needle, from);
		if (idx === -1) {
			break;
		}
		const end = idx + needle.length;
		if (
			(!leftBound || !isWordChar(hay[idx - 1])) &&
			(!rightBound || !isWordChar(hay[end]))
		) {
			out.push({start: idx, end});
		}
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
	// Hyphen<->space equivalence (single-cell == "single cell"): '-' is folded
	// to a space in the MATCH KEYS. Length-preserving, so occurrence positions
	// stay valid for overlap resolution. Word-boundary checks still run on the
	// folded string - a literal hyphen becomes a boundary, so "single" may
	// match "single cell"; cross-termbase longest-overlap suppression then
	// removes it whenever a compound match covers the same span.
	return {
		lower: toMatchKey(raw, true).replace(/-/g, " "),
		exact: toMatchKey(raw, false).replace(/-/g, " "),
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
				const needle = toMatchKey(keyText, !caseSensitive).replace(/-/g, " ");
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
