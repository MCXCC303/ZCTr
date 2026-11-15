const RISK_RE =
	/\b(it|its|they|their|them|this|that|these|those|we|our|us|the former|the latter|the model|the method|the approach|the system|the framework|the proposed)\b/i;

export function riskHeuristic(text: string): boolean {
	return RISK_RE.test(text);
}
