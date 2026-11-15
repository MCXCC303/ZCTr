export interface ContextBudget {
	totalChars: number;
	reservedForSelection: number;
	reservedForInstruction: number;
	abstractMaxChars: number;
	localContextMaxChars: number;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
	totalChars: 4000,
	reservedForSelection: 2000,
	reservedForInstruction: 200,
	abstractMaxChars: 800,
	localContextMaxChars: 1200,
};

const HAN_START = 0x4e00;
const HAN_END = 0x9fff;

export function estimateTokens(text: string): number {
	let han = 0;
	let other = 0;
	for (const ch of text) {
		const code = ch.codePointAt(0) ?? 0;
		if (code >= HAN_START && code <= HAN_END) {
			han++;
		} else {
			other++;
		}
	}
	return han + Math.ceil(other / 4);
}

export function truncateText(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}
