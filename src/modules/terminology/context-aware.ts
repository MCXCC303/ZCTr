/**
 * Context-aware terminology matching - the Phase 2 entry point consumed by
 * the translation pipeline (P2 plan §5).
 *
 * Builds a TerminologyMatchInput from the frozen TranslationContext (the
 * selection is ALWAYS included) and produces the final MatchedTermSet:
 * effective termbases (by target language) -> match -> resolve -> merge.
 * Returns null when nothing matched or no termbase applies - the caller then
 * skips injection entirely (no block, no constraint, no cache material).
 */

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

/** Assemble the match input from the frozen context contract. */
export function buildMatchInput(
	ctx: TranslationContext,
	targetLanguage: string,
): TerminologyMatchInput {
	const localParts = [
		ctx.local?.previousParagraph,
		ctx.local?.currentParagraph,
		ctx.local?.nextParagraph,
		ctx.local?.containingSentence,
	].filter((s): s is string => !!s);
	return {
		selectedText: ctx.selectedText,
		localContext: localParts.length ? localParts.join("\n") : undefined,
		documentTitle: ctx.document?.title,
		abstract: ctx.document?.abstract,
		targetLanguage,
	};
}

/**
 * Match all effective termbases against the context. Deterministic, local,
 * zero network. Returns null when no termbase applies or nothing matched.
 */
export function matchForTranslation(
	termbases: Termbase[],
	ctx: TranslationContext,
	targetLanguage: string,
	opts: {maxTerms?: number} = {},
): MatchedTermSet | null {
	const effective = effectiveTermbases(termbases, {targetLanguage});
	if (!effective.length) {
		return null;
	}
	const input = buildMatchInput(ctx, targetLanguage);
	const sets = effective.map((tb) =>
		resolveConflicts(matchTermbase(tb, input), tb.termbaseId, {
			maxTerms: opts.maxTerms ?? DEFAULT_MAX_MATCHED_TERMS,
		}),
	);
	const merged = mergeMatchedSets(sets, {
		maxTerms: opts.maxTerms ?? DEFAULT_MAX_MATCHED_TERMS,
	});
	return merged.matched.length ? merged : null;
}
