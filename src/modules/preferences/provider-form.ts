import type {ProviderConfig} from "../provider/types";

export const XHTML_NS = "http://www.w3.org/1999/xhtml";

let win: Window | null = null;
let doc: Document | null = null;

export function initFormEnv(window: Window): void {
	win = window;
	doc = window.document;
}

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

export interface ProviderForm {
	setVisible(visible: boolean): void;

	load(provider: ProviderConfig | null): void;

	validate(base: ProviderConfig): ProviderConfig | null;

	reset(): void;

	bindEvents(): void;
}
