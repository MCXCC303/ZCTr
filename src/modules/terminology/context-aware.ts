/**
 * Context-aware terminology matching - the Phase 2 entry point consumed by
 * the translation pipeline (P2 plan §5).
 *
 * Builds a TerminologyMatchInput from the frozen TranslationContext (the
 * selection is ALWAYS included) and produces the final MatchedTermSet:
 * effective termbases (by target language) -> match -> resolve -> merge.
 * Returns null when nothing matched or no termbase applies - the caller then
 * skips injection entirely (no block, no constraint, no cache material).
 *
 * MATCH SCOPE = the translation TARGET ONLY (`selectedText`). Injected term
 * constraints must cover the text being translated; terms that occur only in
 * the document summary / abstract / title (or the reference-only local
 * context) do not apply to the marked target - they would pollute the
 * request AND the cache fingerprint (the matched set changes with every
 * policy/layout variation while the actual translation target stays the
 * same).
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
	return {
		selectedText: ctx.selectedText,
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
