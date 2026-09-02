/**
 * Provider glossary adapter registry (architecture §20, P2 plan T4).
 *
 * Provider-native glossary APIs (DeepL / Youdao / NiuTrans style) MAY be
 * used when a provider exposes them, but the ZCTr terminology model stays
 * provider-neutral. This module defines the neutral extension point:
 *
 * - adapters identify themselves by a NEUTRAL kind string (e.g.
 *   "openai-compat"), never by the ZCTr ProviderType - the terminology
 *   layer must not depend on the provider domain (modules architecture §2);
 * - `supportsGlossary()` gates whether the matched set can be pushed to the
 *   provider natively instead of (or in addition to) prompt injection;
 * - `buildGlossaryPayload()` produces the provider-specific payload.
 *
 * None of the currently supported providers (openai-compatible chat,
 * DeepSeek, Ollama /v1) expose native glossary parameters, so the registry
 * starts empty and the pipeline falls back to prompt injection - which is
 * exactly the documented default (P2 plan §1).
 */

import type {MatchedTermSet} from "./model";

export interface GlossaryAdapter {
	/** Neutral provider kind, e.g. "openai-compat". */
	readonly kind: string;
	/** True when this provider kind accepts a native glossary payload. */
	supportsGlossary(): boolean;
	/**
	 * Map the matched terms to the provider-specific glossary payload.
	 * Only called when supportsGlossary() is true.
	 */
	buildGlossaryPayload?(matched: MatchedTermSet): unknown;
}

const adapters: GlossaryAdapter[] = [];

/** Register a glossary adapter (idempotent per kind). */
export function registerGlossaryAdapter(adapter: GlossaryAdapter): void {
	if (!adapters.some((a) => a.kind === adapter.kind)) {
		adapters.push(adapter);
	}
}

/** Unregister a glossary adapter. */
export function unregisterGlossaryAdapter(adapter: GlossaryAdapter): void {
	const idx = adapters.findIndex((a) => a.kind === adapter.kind);
	if (idx !== -1) {
		adapters.splice(idx, 1);
	}
}

/** The adapter for a provider kind, or undefined (=> prompt injection). */
export function getGlossaryAdapter(kind: string): GlossaryAdapter | undefined {
	return adapters.find((a) => a.kind === kind);
}

/** All registered kinds (diagnostics / UI). */
export function listGlossaryAdapterKinds(): string[] {
	return adapters.map((a) => a.kind);
}
