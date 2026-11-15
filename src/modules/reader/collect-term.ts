import {getString} from "../../utils/locale";
import {getPref, PREFS} from "../../utils/prefs";
import type {ReaderEntry} from "../../types/reader";
import {
	collectTerm,
	listCollectableTermbases,
	pickDefaultCollectTermbaseId,
	type CollectResult,
	type CollectableTermbase,
} from "../translation/term-actions";

const XHTML_NS = "http://www.w3.org/1999/xhtml";

const STATUS_LABEL_IDS = {
	preferred: "collect-status-preferred",
	admitted: "collect-status-admitted",
	forbidden: "collect-status-forbidden",
	deprecated: "collect-status-deprecated",
} as const;
const STATUSES = ["preferred", "admitted", "forbidden", "deprecated"] as const;

interface ThemeColors {
	bg: string;
	text: string;
	secondary: string;
	border: string;
	dark: boolean;
}

function toHex(cssColor: string): string {
	const m = cssColor.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
	if (!m) {
		return cssColor;
	}
	const toByte = (n: string): number =>
		Math.max(0, Math.min(255, Math.round(Number(n))));
	return (
		"#" +
		[m[1], m[2], m[3]].map((n) => toByte(n).toString(16).padStart(2, "0")).join("")
	);
}

function resolveThemeColors(): ThemeColors {
	const FALLBACK_DARK = {bg: "#272c31", text: "#d0d0d0", secondary: "#9a9a9a", border: "#4a4a4a"};
	const FALLBACK_LIGHT = {bg: "#ffffff", text: "#1a1a1a", secondary: "#555555", border: "#c8c8c8"};
	const luminance = (hex: string): number => {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
	};
	const isTransparent = (c: string): boolean =>
		!c ||
		c === "transparent" ||
		/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(c.trim());
	let bg = "";
	let text = "";
	try {
		const mainWin = Zotero.getMainWindow();
		const doc = mainWin.document;
		for (const node of [doc.documentElement, doc.body]) {
			if (!node) {
				continue;
			}
			const cs = mainWin.getComputedStyle(node as Element);
			if (!cs) {
				continue;
			}
			const raw = cs.backgroundColor;
			if (!isTransparent(raw)) {
				bg = toHex(raw);
				break;
			}
		}
		const cs = mainWin.getComputedStyle(doc.documentElement as Element);
		if (cs && !isTransparent(cs.color)) {
			text = toHex(cs.color);
		}
	} catch {
		// Fall through to the scheme defaults below.
	}
	// Judge by background; when it is unknown, invert the text luminance.
	let dark: boolean;
	if (bg && bg !== "#000000") {
		dark = luminance(bg) < 0.5;
	} else if (text) {
		dark = luminance(text) > 0.5;
	} else {
		dark = false;
	}
	const fallback = dark ? FALLBACK_DARK : FALLBACK_LIGHT;
	return {
		bg: bg && bg !== "#000000" ? bg : fallback.bg,
		text: text ? text : fallback.text,
		secondary: fallback.secondary,
		border: fallback.border,
		dark,
	};
}

function buildFormCss(theme: ThemeColors): string {
	const listBg = theme.dark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)";
	return `
	:root {
		color-scheme: ${theme.dark ? "dark" : "light"};
		--zctr-bg: ${theme.bg};
		--zctr-text: ${theme.text};
		--zctr-secondary: ${theme.secondary};
		--zctr-border: ${theme.border};
	}
	html, body { margin: 0; padding: 0; font: 13px -moz-default; background: var(--zctr-bg); color: var(--zctr-text); }
	#root { padding: 10px 14px; }
	.section { margin: 8px 0 4px; font-size: 13px; }
	.row { display: flex; align-items: center; gap: 8px; margin: 10px 0; }
	.rowlabel { width: 100px; flex-shrink: 0; font-size: 13px; text-align: right; }
	.hint { font-size: 11px; color: var(--zctr-secondary); margin: 3px 0 0 14px; }
	#tbList { max-height: 138px; overflow-y: auto; border: 1px solid var(--zctr-border); border-radius: 4px; background: ${listBg}; }
	#tbList label { display: flex; align-items: center; gap: 6px; padding: 3px 8px; cursor: pointer; white-space: nowrap; }
	#tbList label span { overflow: hidden; text-overflow: ellipsis; }
	input[type="text"] { flex: 1; min-width: 0; font-size: 13px; padding: 3px 6px; box-sizing: border-box; }
	#statusGroup { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }
	#statusGroup label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
	#footer { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 14px; border-top: 1px solid var(--zctr-border); margin-top: 16px; }
	#footer button { font-size: 13px; padding: 4px 16px; background: var(--zctr-bg); color: var(--zctr-text); border: 1px solid var(--zctr-border); border-radius: 4px; }
	#footer button:hover { background: ${theme.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}; }
	`;
}

function log(...args: unknown[]): void {
	try {
		((Zotero as any).ZCTr?.data?.ztoolkit ?? (globalThis as any).ztoolkit)?.log?.(
			...args,
		);
	} catch {
		// Logging must never break the flow.
	}
}

function alert(win: Window | null, title: string, message: string): void {
	try {
		Services.prompt.alert((win ?? null) as any, title, message);
	} catch {
		try {
			win?.alert(message);
		} catch {
			log("[ZCTr] Failed to pop the collect window:", title, message);
		}
	}
}

function documentLanguage(itemID: number | undefined): string | undefined {
	if (!itemID) {
		return undefined;
	}
	try {
		const item = Zotero.Items.get(itemID) as any;
		const lang =
			typeof item?.getField === "function"
				? item.getField("language")
				: item?.language;
		return typeof lang === "string" && lang.trim() ? lang.trim() : undefined;
	} catch {
		return undefined;
	}
}

export interface CollectDraft {
	sourceText: string;
	targetText?: string;
}

interface CollectFormData {
	termbaseId: string;
	sourceText: string;
	targetText: string;
	status: "preferred" | "admitted" | "forbidden" | "deprecated";
	note?: string;
}

/** Resolves true only when a term was actually saved. */
export async function openCollectTermDialog(
	entry: ReaderEntry,
	draft: CollectDraft,
): Promise<boolean> {
	const parentWin = (entry.doc.defaultView ?? Zotero.getMainWindow()) as Window;
	const docLanguage = documentLanguage(entry.itemID);
	const targetLanguage = ((getPref(PREFS.TARGET_LANG) as string) || "zh").trim();

	let termbases: CollectableTermbase[];
	try {
		termbases = await listCollectableTermbases();
	} catch (error) {
		log("[ZCTr] Failed to load local termbase: ", error);
		alert(
			parentWin,
			getString("collect-title"),
			getString("collect-error-load-termbases", {
				args: {detail: (error as Error)?.message},
			}),
		);
		return false;
	}
	if (!termbases.length) {
		alert(
			parentWin,
			getString("collect-title"),
			getString("collect-error-no-termbase"),
		);
		return false;
	}

	const activeId = ((getPref(PREFS.ACTIVE_TERMBASE_ID) as string) || null) as
		| string
		| null;
	const defaultId = pickDefaultCollectTermbaseId(termbases, {
		activeId,
		targetLanguage,
	});
	if (!defaultId) {
		return false;
	}

	return await new Promise<boolean>((resolve) => {
		let settled = false;
		const finish = (ok: boolean): void => {
			if (settled) {
				return;
			}
			settled = true;
			resolve(ok);
		};
		const save = async (data: CollectFormData): Promise<CollectResult> =>
			collectTerm(
				{...data},
				{docLanguage, targetLanguage},
			);

		// The "chrome" feature is required for the form controls to be interactive.
		const win = Services.ww.openWindow(
			Zotero.getMainWindow() as any,
			"about:blank",
			"zctr-collect-term",
			"chrome,centerscreen,resizable=yes,width=560,height=620",
			null as any,
		) as unknown as Window | null;
		if (!win) {
			alert(
				parentWin,
				getString("collect-title"),
				getString("collect-error-open-window"),
			);
			finish(false);
			return;
		}
		win.addEventListener("unload", () => finish(false));

		const build = (): void => {
			try {
				buildCollectWindow(win, {
					termbases,
					defaultId,
					docLanguage,
					targetLanguage,
					sourceText: draft.sourceText.trim(),
					targetText: (draft.targetText ?? "").trim(),
					save,
					finish,
				});
				log("[ZCTr] Opened term collect window");
			} catch (error) {
				log("[ZCTr] Failed to build term collect window:", error);
				alert(
					win,
					getString("collect-title"),
					getString("collect-error-init-window", {
						args: {detail: (error as Error)?.message},
					}),
				);
				finish(false);
			}
		};
		const doc = win.document;
		if (doc && (doc.readyState === "complete" || doc.readyState === "interactive")) {
			build();
		} else {
			win.addEventListener(
				"DOMContentLoaded",
				() => build(),
				{once: true},
			);
		}
	});
}

function buildCollectWindow(
	win: Window,
	data: {
		termbases: CollectableTermbase[];
		defaultId: string;
		docLanguage?: string;
		targetLanguage: string;
		sourceText: string;
		targetText: string;
		save: (form: CollectFormData) => Promise<CollectResult>;
		finish: (ok: boolean) => void;
	},
): void {
	const doc = win.document;
	doc.title = getString("collect-title");

	const style = doc.createElement("style");
	style.textContent = buildFormCss(resolveThemeColors());
	((doc.head ?? doc.documentElement) as HTMLElement).appendChild(style);

	const el = <K extends keyof HTMLElementTagNameMap>(
		tag: K,
	): HTMLElementTagNameMap[K] => doc.createElementNS(XHTML_NS, tag) as HTMLElementTagNameMap[K];

	const root = el("div");
	root.id = "root";
	const footer = el("div");
	footer.id = "footer";
	((doc.body ?? doc.documentElement) as HTMLElement).append(root, footer);

	const section = el("div");
	section.className = "section";
	section.textContent = getString("collect-section-termbases");
	root.append(section);

	const tbList = el("div");
	tbList.id = "tbList";
	for (const tb of data.termbases) {
		const row = el("label");
		const radio = el("input");
		radio.type = "radio";
		radio.name = "zctr-tb";
		radio.value = tb.termbaseId;
		const span = el("span");
		span.textContent = getString("collect-termbase-option", {
			args: {
				name: tb.name,
				source: tb.sourceLanguage,
				target: tb.targetLanguage,
				count: tb.entryCount,
			},
		});
		row.append(radio, span);
		tbList.append(row);
	}
	root.append(tbList);
	const defaultRadio = (tbList.querySelector(`input[value="${data.defaultId}"]`) ??
		tbList.querySelector("input")) as HTMLInputElement | null;
	if (defaultRadio) {
		defaultRadio.checked = true;
	}

	const pairHint = el("div");
	pairHint.className = "hint";
	const langHint = el("div");
	langHint.className = "hint";
	root.append(pairHint, langHint);

	const makeRow = (labelText: string, input: HTMLInputElement): void => {
		const row = el("div");
		row.className = "row";
		const label = el("label");
		label.className = "rowlabel";
		label.textContent = labelText;
		row.append(label, input);
		root.append(row);
	};
	const srcInput = el("input");
	srcInput.type = "text";
	srcInput.value = data.sourceText;
	srcInput.placeholder = getString("collect-field-source-placeholder");
	makeRow(getString("collect-field-source"), srcInput);
	const tgtInput = el("input");
	tgtInput.type = "text";
	tgtInput.value = data.targetText;
	tgtInput.placeholder = getString("collect-field-target-placeholder");
	makeRow(getString("collect-field-target"), tgtInput);

	const stRow = el("div");
	stRow.className = "row";
	const stLabel = el("label");
	stLabel.className = "rowlabel";
	stLabel.textContent = getString("collect-field-status");
	const stGroup = el("div");
	stGroup.id = "statusGroup";
	for (const status of STATUSES) {
		const item = el("label");
		const radio = el("input");
		radio.type = "radio";
		radio.name = "zctr-status";
		radio.value = status;
		radio.checked = status === "preferred";
		item.append(radio, getString(STATUS_LABEL_IDS[status]));
		stGroup.append(item);
	}
	stRow.append(stLabel, stGroup);
	root.append(stRow);

	const noteInput = el("input");
	noteInput.type = "text";
	noteInput.placeholder = getString("collect-field-note-placeholder");
	makeRow(getString("collect-field-note"), noteInput);

	const footerHint = el("div");
	footerHint.className = "hint";
	footerHint.textContent = getString("collect-hint-footer");
	root.append(footerHint);

	const cancelBtn = el("button");
	cancelBtn.textContent = getString("collect-button-cancel");
	const collectBtn = el("button");
	collectBtn.textContent = getString("collect-button-collect");
	footer.append(cancelBtn, collectBtn);

	const byId = new Map(data.termbases.map((tb) => [tb.termbaseId, tb]));
	const updateHints = (): void => {
		const checked = tbList.querySelector(
			'input[name="zctr-tb"]:checked',
		) as HTMLInputElement | null;
		const tb = checked ? byId.get(checked.value) : undefined;
		if (!tb) {
			return;
		}
		pairHint.textContent = getString("collect-hint-language-pair", {
			args: {source: tb.sourceLanguage, target: tb.targetLanguage},
		});
		langHint.textContent = getString("collect-hint-context", {
			args: {
				docLang: data.docLanguage ?? getString("collect-unknown"),
				target: data.targetLanguage,
			},
		});
	};
	tbList.addEventListener("change", updateHints);
	updateHints();

	const checkedTermbaseId = (): string => {
		const c = tbList.querySelector(
			'input[name="zctr-tb"]:checked',
		) as HTMLInputElement | null;
		return c?.value ?? "";
	};
	const checkedStatus = (): CollectFormData["status"] => {
		const c = stGroup.querySelector(
			'input[name="zctr-status"]:checked',
		) as HTMLInputElement | null;
		return (c?.value ?? "preferred") as CollectFormData["status"];
	};

	const onCollect = async (): Promise<void> => {
		const res = await data.save({
			termbaseId: checkedTermbaseId(),
			sourceText: srcInput.value,
			targetText: tgtInput.value,
			status: checkedStatus(),
			note: noteInput.value || undefined,
		});
		if (!res.ok) {
			log(
				`[ZCTr] Failed to collect term: reason=${res.reason} termbase=${checkedTermbaseId() || "(none)"}`,
			);
			alert(win, getString("collect-alert-rejected"), res.message);
			return;
		}
		log(`[ZCTr] Term successfully collected: ${res.termbaseName} / ${res.conceptId}`);
		data.finish(true);
		win.close();
	};
	collectBtn.addEventListener("click", () => void onCollect());
	cancelBtn.addEventListener("click", () => {
		data.finish(false);
		win.close();
	});
}
