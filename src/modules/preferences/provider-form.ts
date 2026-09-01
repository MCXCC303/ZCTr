/**
 * Provider form framework.
 *
 * Each provider type (openai / deepseek / ollama) implements a ProviderForm
 * that owns its type-specific fields (visibility, loading, validation,
 * resetting). The preferences pane orchestrates them: the shared fields
 * (name, type, API key) and the provider list stay in prefs-ui.ts, while
 * each form manages only its own fields in the XHTML fragment.
 */

import type {ProviderConfig} from "../provider/types";

export const XHTML_NS = "http://www.w3.org/1999/xhtml";

let win: Window | null = null;
let doc: Document | null = null;

/** Bind the form framework to the preferences window (per pane load). */
export function initFormEnv(window: Window): void {
	win = window;
	doc = window.document;
}

/** Detach the form framework from a closing preferences window. */
export function clearFormEnv(): void {
	win = null;
	doc = null;
}

export function getWin(): Window | null {
	return win;
}

export function getDoc(): Document | null {
	return doc;
}

export function inputValue(id: string): string {
	return (doc?.getElementById(id) as HTMLInputElement | null)?.value ?? "";
}

export function setInputValue(id: string, value: string): void {
	const el = doc?.getElementById(id) as HTMLInputElement | null;
	if (el) {
		el.value = value;
	}
}

export function selectValue(id: string): string {
	return (doc?.getElementById(id) as HTMLSelectElement | null)?.value ?? "";
}

export function setSelectValue(id: string, value: string): void {
	const el = doc?.getElementById(id) as HTMLSelectElement | null;
	if (el) {
		el.value = value;
	}
}

export function setVisible(id: string, visible: boolean): void {
	const el = doc?.getElementById(id) as HTMLElement | null;
	if (el) {
		el.hidden = !visible;
	}
}

/** Create an XHTML element inside the XUL preferences document. */
export function hEl<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	text?: string,
	style?: string,
): HTMLElementTagNameMap[K] {
	const el = doc!.createElementNS(XHTML_NS, tag) as HTMLElementTagNameMap[K];
	if (text !== undefined) {
		el.textContent = text;
	}
	if (style) {
		el.style.cssText = style;
	}
	return el;
}

/**
 * A provider type's form: owns the visibility and values of its
 * type-specific fields in the preferences pane.
 */
export interface ProviderForm {
	/** Show (or hide) this form's fields. */
	setVisible(visible: boolean): void;

	/** Fill the fields from a saved provider (null = new provider). */
	load(provider: ProviderConfig | null): void;

	/** Read the fields into a provider config; null when invalid. */
	validate(base: ProviderConfig): ProviderConfig | null;

	/** Clear the fields (when switching provider types). */
	reset(): void;

	/** Bind field events (e.g. the Ollama connectivity test button). */
	bindEvents(): void;
}
