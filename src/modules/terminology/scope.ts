/**
 * Scope resolution (architecture §8, P2 plan §3.4).
 *
 * The full hierarchy is Global -> Library -> Collection -> Profile. v1
 * activates only the termbase level: effective termbases are those whose
 * target language matches the request. Library/collection/profile bindings
 * are reserved for later milestones - the function signatures already take
 * a scope context so the hierarchy can be added without redesign.
 */

import type {Termbase, TerminologyMatchInput} from "./model";

export interface ScopeContext {
	/** Optional container ids for future library/collection/profile scopes. */
	libraryId?: number;
	collectionIds?: number[];
	profileId?: string;
}

/**
 * Base-language compatibility between two language codes: equal, or one is
 * a prefix of the other at a "-" boundary ("zh" ↔ "zh-CN", "en" ↔ "en-US").
 * Region variants stay distinct from each other ("zh-CN" vs "zh-TW" do NOT
 * match), while a regionless request code matches every region of the same
 * base language. Case-insensitive (user-authored codes may be "ZH-CN").
 */
export function languagesCompatible(a: string, b: string): boolean {
	const x = a.toLowerCase();
	const y = b.toLowerCase();
	return x === y || x.startsWith(y + "-") || y.startsWith(x + "-");
}

/**
 * Deterministically select the termbases effective for a request.
 * v1 rule: target language pair must match (base-language compatible,
 * see languagesCompatible); ordering is stable by id so the matched-set
 * fingerprint is reproducible.
 */
export function effectiveTermbases(
	allTermbases: Termbase[],
	input: Pick<TerminologyMatchInput, "targetLanguage">,
	_context: ScopeContext = {},
): Termbase[] {
	return allTermbases
		.filter((tb) => languagesCompatible(tb.targetLanguage, input.targetLanguage))
		.slice()
		.sort((a, b) => a.termbaseId.localeCompare(b.termbaseId));
}
