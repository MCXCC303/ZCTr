import type {MatchedTermSet} from "./model";

export interface GlossaryAdapter {
	readonly kind: string;
	supportsGlossary(): boolean;
	/** Only called when supportsGlossary() is true. */
	buildGlossaryPayload?(matched: MatchedTermSet): unknown;
}

const adapters: GlossaryAdapter[] = [];

export function registerGlossaryAdapter(adapter: GlossaryAdapter): void {
	if (!adapters.some((a) => a.kind === adapter.kind)) {
		adapters.push(adapter);
	}
}

export function unregisterGlossaryAdapter(adapter: GlossaryAdapter): void {
	const idx = adapters.findIndex((a) => a.kind === adapter.kind);
	if (idx !== -1) {
		adapters.splice(idx, 1);
	}
}

export function getGlossaryAdapter(kind: string): GlossaryAdapter | undefined {
	return adapters.find((a) => a.kind === kind);
}

export function listGlossaryAdapterKinds(): string[] {
	return adapters.map((a) => a.kind);
}
