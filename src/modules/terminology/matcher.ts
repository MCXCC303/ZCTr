import {
	TERMBASE_SCHEMA_VERSION,
	type ConceptEntry,
	type Term,
	type Termbase,
	type TerminologyMatchInput,
} from "./model";

const DASH_RE = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g;

export function toMatchKey(text: string, lowercase = true): string {
	let key = text
		.normalize("NFC")
		.replace(DASH_RE, "-")
		.replace(/\s+/g, " ")
		.trim();
	return lowercase ? key.toLowerCase() : key;
}

const WORD_CHAR_RE = /[A-Za-z0-9\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/;
function isWordChar(ch: string | undefined): boolean {
	return !!ch && WORD_CHAR_RE.test(ch);
}

/**
 * All occurrences of `needle` in `hay` (half-open spans), restricted to word
 * boundaries when the needle starts/ends with a word character.
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

export interface TermOccurrence {
	concept: ConceptEntry;
	sourceTerm: Term;
	targetTerm?: Term;
	key: string;
	start: number;
	end: number;
}

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
	// '-' folds to a space (length-preserving, so span positions stay valid);
	// the folded hyphen becomes a word boundary, so "single" may match inside
	// "single cell" - longest-overlap suppression removes it.
	return {
		lower: toMatchKey(raw, true).replace(/-/g, " "),
		exact: toMatchKey(raw, false).replace(/-/g, " "),
	};
}

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

export function terminologySchemaVersion(): number {
	return TERMBASE_SCHEMA_VERSION;
}
