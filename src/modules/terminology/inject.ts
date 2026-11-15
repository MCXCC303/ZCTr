import type {MatchedTermSet} from "./model";

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

export function terminologyConstraint(): string {
	return "When the source text contains the listed terms, use the listed target terms.";
}
