export type ContextLevel = "selection" | "local" | "semantic" | "adaptive";
export type AbstractState = "unavailable" | "available" | "stale";
export type AbstractSource = "metadata" | "external" | "user" | "unknown";

export interface ContextDocument {
	itemId?: number;
	attachmentId?: number;
	title?: string;
	abstract?: string;
	abstractSource?: AbstractSource;
	abstractState?: AbstractState;
	sectionTitle?: string;
	pageLabel?: string;
}

export interface ContextLocal {
	containingSentence?: string;
	previousParagraph?: string;
	currentParagraph?: string;
	nextParagraph?: string;
}

export interface ContextPolicy {
	level: ContextLevel;
	includeAbstract: boolean;
	includeTitle: boolean;
	includeSectionTitle: boolean;
	includeAdjacentParagraphs: boolean;
}

export interface TranslationContext {
	selectedText: string;
	document?: ContextDocument;
	local?: ContextLocal;
	policy: ContextPolicy;
	version: number;
}

/** Version of the TranslationContext contract. Bump on structural changes. */
export const CONTEXT_VERSION = 1;

function fingerprintText(value: string): string {
	return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function canonicalContext(ctx: TranslationContext): Record<string, unknown> {
	return {
		version: ctx.version,
		policy: ctx.policy,
		document: ctx.document
			? {
					title: ctx.document.title
						? fingerprintText(ctx.document.title)
						: null,
					abstract: ctx.document.abstract
						? fingerprintText(ctx.document.abstract)
						: null,
					abstractSource: ctx.document.abstractSource ?? null,
					abstractState: ctx.document.abstractState ?? null,
					sectionTitle: ctx.document.sectionTitle
						? fingerprintText(ctx.document.sectionTitle)
						: null,
				}
			: null,
		local: ctx.local
			? {
					containingSentence: ctx.local.containingSentence
						? fingerprintText(ctx.local.containingSentence)
						: null,
					previousParagraph: ctx.local.previousParagraph
						? fingerprintText(ctx.local.previousParagraph)
						: null,
					currentParagraph: ctx.local.currentParagraph
						? fingerprintText(ctx.local.currentParagraph)
						: null,
					nextParagraph: ctx.local.nextParagraph
						? fingerprintText(ctx.local.nextParagraph)
						: null,
				}
			: null,
	};
}

export function hasAttachedContext(ctx: TranslationContext): boolean {
	return !!ctx.document || !!ctx.local;
}

export function selectionOnlyContext(selectedText: string): TranslationContext {
	return {
		selectedText,
		policy: {
			level: "selection",
			includeAbstract: false,
			includeTitle: false,
			includeSectionTitle: false,
			includeAdjacentParagraphs: false,
		},
		version: CONTEXT_VERSION,
	};
}
