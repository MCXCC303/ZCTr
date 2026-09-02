/**
 * "+ 收录" closed loop UI - files the current popup selection + translation
 * as a term into a user-chosen termbase.
 *
 * Flow (user-confirmed strategy):
 *   1. popup footer button -> this module;
 *   2. a NEW WINDOW that is a real CHROME window (`Services.ww.openWindow`
 *      with the "chrome" feature) whose content is INJECTED by the plugin
 *      scope. It shows: termbase radio list (default = active termbase, else
 *      the first termbase whose target language matches the translation
 *      target - the user may pick any), source term (prefilled with the
 *      selection), target term (prefilled with the translation), status,
 *      optional note;
 *   3. saving runs the layer validation (term-actions): language-pair
 *      conflicts and duplicates are REFUSED with an alert dialog and the
 *      form stays open for another choice.
 *
 * Why inject into an about:blank CHROME window instead of loading a file or
 * using the toolkit Dialog:
 *   - the toolkit Dialog opens an about:blank window WITHOUT the "chrome"
 *     flag (a content window), which Zotero 10 beta renders with INERT form
 *     controls (no dropdown popups, radios do not toggle);
 *   - navigating a chrome window directly to a jar: content URL renders a
 *     BLANK window (Zotero loads plugin panels by fetch+inject, not by
 *     top-level jar navigation).
 *   A chrome-flag about:blank window with injected controls is the same kind
 * of window Zotero uses for its own secondary windows, so it is interactive.
 *
 * Layering: this module is reader UI; every termbase read/write goes
 * through ../translation/term-actions (reader -> translation -> terminology).
 */

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

const STATUS_LABELS: Record<string, string> = {
	preferred: "Preferred",
	admitted: "Admitted",
	forbidden: "Forbidden",
	deprecated: "Deprecated",
};
const STATUSES = ["preferred", "admitted", "forbidden", "deprecated"];

/** Theme colors resolved from the main Zotero window (the same tokens the
 * settings pane/popup use: --material-background, --fill-primary, ...). */
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

/** Read the effective light/dark colors from Zotero's main window so the
 * injected window matches the USER-CHOSEN theme exactly (Zotero. The tokens
 * themselves are only defined in Zotero's own documents, so we resolve them
 * from the main window's computed style rather than relying on our window
 * having the theme CSS).
 *
 * Note on polarity: the main window's <html> background is usually
 * transparent (the theme paints <body>/inner containers), so we prefer the
 * measured BODY background luminance; when no background is measurable we
 * fall back to the TEXT luminance with the correct polarity (dark text -> a
 * LIGHT theme; light text -> a DARK theme).
 */
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
		// Prefer a measurable background: <html> then <body>.
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
	// Definitely-a-background is the strongest signal; otherwise use text.
	let dark: boolean;
	if (bg && bg !== "#000000") {
		dark = luminance(bg) < 0.5;
	} else if (text) {
		// A surface we cannot read; judge by text: dark text -> light theme.
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

/** Build the injected stylesheet, themed to the resolved colors. */
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

/** Non-throwing alert; prefers the given window as parent. */
function alert(win: Window | null, title: string, message: string): void {
	try {
		Services.prompt.alert((win ?? null) as any, title, message);
	} catch {
		try {
			win?.alert(message);
		} catch {
			log("[ZCTr] 收录弹窗失败:", title, message);
		}
	}
}

/** Document language from item metadata; undefined when unknown. */
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
	/** The selected source text to prefill. */
	sourceText: string;
	/** The translation result to prefill (optional). */
	targetText?: string;
}

/** Form data gathered by the window, handed back to the save callback. */
interface CollectFormData {
	termbaseId: string;
	sourceText: string;
	targetText: string;
	status: "preferred" | "admitted" | "forbidden" | "deprecated";
	note?: string;
}

/**
 * Open the collect window. Resolves true when a term was saved (window
 * closed by the user after a successful collect).
 */
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
		log("[ZCTr] 收录：加载术语库失败", error);
		alert(parentWin, "收录术语", `加载术语库失败：${(error as Error)?.message}`);
		return false;
	}
	if (!termbases.length) {
		alert(
			parentWin,
			"收录术语",
			"尚未创建任何术语库。请先新建或导入术语库。",
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

		// A CHROME window (the "chrome" feature is what makes its form
		// controls interactive in Zotero 10). Content is injected below.
		const win = Services.ww.openWindow(
			Zotero.getMainWindow() as any,
			"about:blank",
			"zctr-collect-term",
			"chrome,centerscreen,resizable=yes,width=560,height=620",
			null as any,
		) as unknown as Window | null;
		if (!win) {
			alert(parentWin, "收录术语", "无法打开收录窗口。");
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
				log("[ZCTr] 收录窗口已打开");
			} catch (error) {
				log("[ZCTr] 收录窗口构建失败:", error);
				alert(win, "收录术语", `窗口初始化失败：${(error as Error)?.message}`);
				finish(false);
			}
		};
		// about:blank may already be ready; otherwise wait for the load event.
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

/**
 * Inject the collect form into the given about:blank chrome window. All logic
 * stays in the plugin scope; the window is just the visual host.
 */
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
	doc.title = "收录术语";

	const style = doc.createElement("style");
	style.textContent = buildFormCss(resolveThemeColors());
	((doc.head ?? doc.documentElement) as HTMLElement).appendChild(style);

	const el = <K extends keyof HTMLElementTagNameMap>(
		tag: K,
	): HTMLElementTagNameMap[K] => doc.createElementNS(XHTML_NS, tag) as HTMLElementTagNameMap[K];

	// Root + footer
	const root = el("div");
	root.id = "root";
	const footer = el("div");
	footer.id = "footer";
	((doc.body ?? doc.documentElement) as HTMLElement).append(root, footer);

	// Section: termbase radio list
	const section = el("div");
	section.className = "section";
	section.textContent = "术语库";
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
		span.textContent = `${tb.name}（${tb.sourceLanguage} → ${tb.targetLanguage} · ${tb.entryCount} 词条）`;
		row.append(radio, span);
		tbList.append(row);
	}
	root.append(tbList);
	const defaultRadio = (tbList.querySelector(`input[value="${data.defaultId}"]`) ??
		tbList.querySelector("input")) as HTMLInputElement | null;
	if (defaultRadio) {
		defaultRadio.checked = true;
	}

	// Language hints
	const pairHint = el("div");
	pairHint.className = "hint";
	const langHint = el("div");
	langHint.className = "hint";
	root.append(pairHint, langHint);

	// Source / target / note fields
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
	srcInput.placeholder = "源语言术语（默认取选中文本，可编辑）";
	makeRow("源术语", srcInput);
	const tgtInput = el("input");
	tgtInput.type = "text";
	tgtInput.value = data.targetText;
	tgtInput.placeholder = "目标语言译文（默认取翻译结果，可编辑）";
	makeRow("目标术语", tgtInput);

	// Status radio group
	const stRow = el("div");
	stRow.className = "row";
	const stLabel = el("label");
	stLabel.className = "rowlabel";
	stLabel.textContent = "状态";
	const stGroup = el("div");
	stGroup.id = "statusGroup";
	for (const status of STATUSES) {
		const item = el("label");
		const radio = el("input");
		radio.type = "radio";
		radio.name = "zctr-status";
		radio.value = status;
		radio.checked = status === "preferred";
		item.append(radio, STATUS_LABELS[status]);
		stGroup.append(item);
	}
	stRow.append(stLabel, stGroup);
	root.append(stRow);

	const noteInput = el("input");
	noteInput.type = "text";
	noteInput.placeholder = "可选：如 用微调，不用精调";
	makeRow("备注", noteInput);

	// Footer hint
	const footerHint = el("div");
	footerHint.className = "hint";
	footerHint.textContent =
		"注：重复或语言对冲突的收录会被拒绝。";
	root.append(footerHint);

	// Buttons
	const cancelBtn = el("button");
	cancelBtn.textContent = "取消";
	const collectBtn = el("button");
	collectBtn.textContent = "收录";
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
		pairHint.textContent = `语言对：${tb.sourceLanguage} → ${tb.targetLanguage}`;
		langHint.textContent = `当前语境：文档语言 ${data.docLanguage ?? "未知"} · 翻译目标 ${data.targetLanguage}`;
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
			alert(win, "无法收录", res.message);
			return;
		}
		log(`[ZCTr] 术语已收录: ${res.termbaseName} / ${res.conceptId}`);
		data.finish(true);
		win.close();
	};
	collectBtn.addEventListener("click", () => void onCollect());
	cancelBtn.addEventListener("click", () => {
		data.finish(false);
		win.close();
	});
}
