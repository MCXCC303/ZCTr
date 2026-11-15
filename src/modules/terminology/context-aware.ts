import type {TranslationContext} from "../context/context";
import {
	DEFAULT_MAX_MATCHED_TERMS,
	type MatchedTermSet,
	type Termbase,
	type TerminologyMatchInput,
} from "./model";
import {matchTermbase} from "./matcher";
import {mergeMatchedSets, resolveConflicts} from "./conflict";
import {effectiveTermbases} from "./scope";

export function buildMatchInput(
	ctx: TranslationContext,
	targetLanguage: string,
): TerminologyMatchInput {
	return {
		selectedText: ctx.selectedText,
		targetLanguage,
	};
}

export function matchForTranslation(
	termbases: Termbase[],
	ctx: TranslationContext,
	targetLanguage: string,
	opts: {maxTerms?: number; activeTermbaseId?: string | null} = {},
): MatchedTermSet | null {
	const effective = effectiveTermbases(termbases, {targetLanguage});
	const pool = opts.activeTermbaseId
		? effective.filter((tb) => tb.termbaseId === opts.activeTermbaseId)
		: effective;
	if (!pool.length) {
		return null;
	}
	const input = buildMatchInput(ctx, targetLanguage);
	const sets = pool.map((tb) =>
		resolveConflicts(matchTermbase(tb, input), tb.termbaseId, {
			maxTerms: opts.maxTerms ?? DEFAULT_MAX_MATCHED_TERMS,
		}),
	);
	const merged = mergeMatchedSets(sets, {
		maxTerms: opts.maxTerms ?? DEFAULT_MAX_MATCHED_TERMS,
	});
	return merged.matched.length ? merged : null;
}
