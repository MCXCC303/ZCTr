/**
 * ContextScorer - decides whether a selection needs document-level context.
 *
 * M1 ships the simplified risk heuristic (full scorer lands in M2, see
 * ZCTr-context-M1-plan.md §4.6 / CXT-5): selections containing anaphoric or
 * deictic expressions (`it/its/they/this/the model/...`) are flagged as
 * high-risk and get abstract/title attached under the adaptive level.
 */

const RISK_RE =
	/\b(it|its|they|their|them|this|that|these|those|we|our|us|the former|the latter|the model|the method|the approach|the system|the framework|the proposed)\b/i;

/** True when the selected text likely needs document-level disambiguation. */
export function riskHeuristic(text: string): boolean {
	return RISK_RE.test(text);
}
