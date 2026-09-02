/**
 * ZCTr context core - types and pure helpers for the TranslationContext
 * request contract (see ZCTr-context-ARCHITECTURE.md §7 / ZCTr-context-M1-plan.md).
 *
 * This module is intentionally dependency-free (pure TS) so every function
 * can be unit-tested in isolation.
 */

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

/**
 * Fingerprint-only text normalization: NFC + fold every whitespace run
 * (incl. line breaks) to a single space + trim. The rendered local context
 * keeps newlines for prompt readability, while the reader's own selection
 * text folds breaks into spaces - the two must NOT split the cache key for
 * the same semantic context. Content differences are preserved: two strings
 * differing by actual text still produce different fingerprints.
 */
function fingerprintText(value: string): string {
	return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Canonical context form for cache fingerprints. Deliberately excludes
 * `selectedText` (already part of the cache key material) and only includes
 * fields that were actually attached to the request. All text fields are
 * whitespace-normalized (see fingerprintText) before hashing.
 */
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

/** True when the context carries any content beyond the bare selection. */
export function hasAttachedContext(ctx: TranslationContext): boolean {
	return !!ctx.document || !!ctx.local;
}


/** A context with no attached content (selection-only fallback). */
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
