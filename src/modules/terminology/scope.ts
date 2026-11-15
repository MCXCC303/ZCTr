import type {Termbase, TerminologyMatchInput} from "./model";

export interface ScopeContext {
	libraryId?: number;
	collectionIds?: number[];
	profileId?: string;
}

export function languagesCompatible(a: string, b: string): boolean {
	const x = a.toLowerCase();
	const y = b.toLowerCase();
	return x === y || x.startsWith(y + "-") || y.startsWith(x + "-");
}

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
