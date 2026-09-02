/**
 * Terminology injection - formats a resolved MatchedTermSet into the
 * [TERMINOLOGY] prompt block (P2 plan §3.3).
 *
 * Layout (stable for prefix caching and small-model obedience):
 *   [TERMINOLOGY]
 *   twistane -> 扭转烷 (preferred)
 *   ...
 *   Forbidden translations:
 *     fine-tuning -> 精调
 *
 * Returns "" when the set is empty - the caller then emits no block and no
 * constraint sentence. Pure function; the prompt module owns the final
 * message assembly.
 */

import type {MatchedTermSet} from "./model";

/** Render the [TERMINOLOGY] block; "" when nothing matched. */
export function formatTerminologyBlock(
	set: MatchedTermSet | null | undefined,
): string {
	if (!set || !set.matched.length) {
		return "";
	}
	const lines: string[] = ["[TERMINOLOGY]"];
	const normal = set.matched.filter((m) => m.status !== "forbidden");
	const forbidden = set.matched.filter((m) => m.status === "forbidden");
	for (const m of normal) {
		const target = m.targetText ? m.targetText : "（保留原文）";
		lines.push(`${m.sourceText} -> ${target} (${m.status})`);
	}
	if (forbidden.length) {
		lines.push("Forbidden translations:");
		for (const m of forbidden) {
			lines.push(`  ${m.sourceText} -> ${m.targetText ?? "（保留原文）"}`);
		}
	}
	return lines.join("\n");
}

/** Constraint sentence appended to the translation instruction when the
 * terminology block is present (adjacent to <target>, anti-leak layout). */
export function terminologyConstraint(): string {
	return "When the source text contains the listed terms, use the listed target terms.";
}
