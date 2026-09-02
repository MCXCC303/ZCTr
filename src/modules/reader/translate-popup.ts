/**
 * ZCTr translation popup.
 *
 * The floating popup is created inside the reader iframe document (so the
 * menu event's viewport coordinates map directly), shows the translation
 * only (no source text), is a singleton (at most one exists), and is closed
 * via its close button or the Escape key (handled by the main-window
 * keydown listener in hotkey.ts). It can be dragged by its header and
 * resized from the bottom-right handle.
 *
 * Menu entries live in view-menu.ts / annotation-menu.ts; they call
 * openTranslatePopup() with a registered ReaderEntry.
 *
 * All translation business (context assembly, cache, provider transport)
 * lives in the translation pipeline; this module is UI-only.
 */

import {startTranslation as startPipelineTranslation} from "../translation/pipeline";
import {isCollectableTermText} from "../translation/term-actions";
import type {ReaderEntry} from "../../types/reader";
import {openCollectTermDialog} from "./collect-term";
import * as zlog from "../../utils/logger";

const POPUP_ID = "zctr-translate-popup";

/**
 * The single open popup (global singleton - at most one ZCTr popup exists).
 * Null when closed.
 */
let currentPopup: HTMLElement | null = null;

/** Draft for the "+ 收录术语" flow: the current selection and the latest
 * translation text (filled as the translation arrives). */
const collectDraft: {sourceText: string; targetText: string} = {
	sourceText: "",
	targetText: "",
};

export function openTranslatePopup(
	entry: ReaderEntry,
	text: string,
	x: number | undefined,
	y: number | undefined,
): void {
	// Singleton: replace any existing popup
	closePopup();
	collectDraft.sourceText = text;
	collectDraft.targetText = "";
	const {doc} = entry;
	const popup = doc.createElement("div");
	popup.id = POPUP_ID;
	popup.style.cssText = [
		"position: fixed",
		`left: ${x ?? 0}px`,
		`top: ${y ?? 0}px`,
		"z-index: 2147483647",
		"pointer-events: auto",
		"width: 420px",
		"max-width: calc(100vw - 16px)",
		"max-height: min(340px, 60vh)",
		"display: flex",
		"flex-direction: column",
		"background: var(--material-sidepane, #ffffff)",
		"color: var(--fill-primary, #000000)",
		// Zotero quirk: a border shorthand whose color is a CSS variable does
		// not render; border-color must be a separate declaration (see
		// preferences.css .zctr-provider-section).
		"border: 1px solid",
		"border-color: var(--fill-quaternary, #c8c8c8)",
		"border-radius: 8px",
		"box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25)",
		"font-size: 13px",
		"line-height: 1.6",
		"overflow: hidden",
		// The reader disables text selection in parts of its UI; the
		// translation result must stay selectable/copyable
		"user-select: text",
		"-webkit-user-select: text",
	].join("; ");

	// Header: title + close button
	const header = doc.createElement("div");
	header.style.cssText = [
		"display: flex",
		"align-items: center",
		"justify-content: space-between",
		"padding: 6px 10px",
		"border-bottom: 1px solid",
		"border-bottom-color: var(--fill-quaternary, #e0e0e0)",
		"font-weight: 600",
		"flex-shrink: 0",
	].join("; ");
	const title = doc.createElement("span");
	title.textContent = "ZCTr 翻译";
	const closeBtn = doc.createElement("button");
	closeBtn.textContent = "✕";
	closeBtn.title = "关闭";
	closeBtn.setAttribute("data-zctr-close", "1");
	closeBtn.style.cssText = [
		"border: none",
		"background: none",
		"cursor: pointer",
		"font-size: 12px",
		"padding: 2px 6px",
		"color: var(--fill-primary, #000000)",
		"border-radius: 4px",
	].join("; ");
	closeBtn.addEventListener("click", (event) => {
		event.stopPropagation();
		closePopup();
	});
	// Cache-hit badge shown in the header when the translation came from the
	// local queue instead of a provider request
	const cacheBadge = doc.createElement("span");
	cacheBadge.textContent = "⚡ 缓存";
	cacheBadge.title = "本次翻译来自本地缓存";
	cacheBadge.style.cssText = [
		"font-size: 11px",
		"color: #2f7cde",
		"margin-right: 6px",
		"opacity: 0.85",
		"flex-shrink: 0",
	].join("; ");
	cacheBadge.hidden = true;
	header.append(title, cacheBadge, closeBtn);

	// Drag the popup by its header via pointer events. Pointer events over the
	// pdf.js viewer iframe never bubble to the reader document, so move/up
	// listeners are attached to both.
	header.addEventListener("pointerdown", (event: PointerEvent) => {
		const target = event.target as HTMLElement;
		if (target.closest?.("[data-zctr-close]")) {
			return;
		}
		event.preventDefault();
		// Capture the pointer so move/up events are never lost when the
		// pointer leaves the iframe (which would leave user-select disabled)
		target.setPointerCapture?.(event.pointerId);
		startDrag(entry.doc, entry.iframeWin, popup, event);
	});

	// Resize handle at the bottom-right corner
	const resizeHandle = doc.createElement("div");
	resizeHandle.setAttribute("data-zctr-resize", "1");
	resizeHandle.style.cssText = [
		"position: absolute",
		"right: 2px",
		"bottom: 2px",
		"width: 14px",
		"height: 14px",
		"cursor: se-resize",
		"border-right: 3px solid",
		"border-right-color: var(--fill-tertiary, #999999)",
		"border-bottom: 3px solid",
		"border-bottom-color: var(--fill-tertiary, #999999)",
		"border-bottom-right-radius: 3px",
		"opacity: 0.6",
	].join("; ");
	resizeHandle.addEventListener("pointerdown", (event: PointerEvent) => {
		event.preventDefault();
		event.stopPropagation();
		(event.target as HTMLElement).setPointerCapture?.(event.pointerId);
		startResize(entry.doc, entry.iframeWin, popup, event);
	});
	popup.append(resizeHandle);

	// Translation result area (the popup shows the translation only)
	const result = doc.createElement("div");
	result.style.cssText = [
		"flex: 1",
		"min-height: 40px",
		"overflow-y: auto",
		"padding: 8px 10px",
		"white-space: pre-wrap",
		"word-break: break-word",
	].join("; ");

	// The reader's focus manager preventDefaults pointerdown on anything that
	// is not a known UI element, which would block text selection in the
	// popup. Stop the event from bubbling up to the reader window.
	popup.addEventListener("pointerdown", (event) => {
		event.stopPropagation();
	});

	// Terminology preview: one matched term per line, source and target in
	// two aligned columns (hidden until the pipeline resolves the terms).
	const preview = doc.createElement("div");
	preview.style.cssText = [
		"display: none",
		"font-size: 11px",
		"color: var(--fill-secondary, #888)",
		"padding: 4px 10px",
		"border-bottom: 1px solid",
		"border-bottom-color: var(--fill-quaternary, #e0e0e0)",
		"user-select: text",
		"-webkit-user-select: text",
	].join("; ");

	// Footer: "+ 收录术语" - files the selection + translation into a
	// user-chosen termbase (see collect-term.ts). The draft is filled as the
	// translation arrives. The footer is only rendered when the selection is
	// a plausible TERM (short text); sentences/paragraphs never offer the
	// collect option (term-actions.isCollectableTermText).
	const collectable = isCollectableTermText(text);
	let footer: HTMLElement | null = null;
	if (collectable) {
		footer = doc.createElement("div");
		footer.style.cssText = [
			"display: flex",
			"justify-content: flex-end",
			"padding: 4px 8px",
			"flex-shrink: 0",
			"border-top: 1px solid",
			"border-top-color: var(--fill-quaternary, #e0e0e0)",
		].join("; ");
		const collectBtn = doc.createElement("button");
		collectBtn.textContent = "＋ 收录术语";
		collectBtn.title = "把当前选区与译文收录为术语到术语库";
		collectBtn.style.cssText = [
			"font-size: 11px",
			"padding: 2px 10px",
			"border-radius: 4px",
			"cursor: pointer",
			"border: 1px solid",
			"border-color: var(--fill-quaternary, #c8c8c8)",
			"background: none",
			"color: var(--fill-primary, #000000)",
		].join("; ");
		collectBtn.addEventListener("click", (event) => {
			event.stopPropagation();
			collectDraft.sourceText = text;
			void openCollectTermDialog(entry, {
				sourceText: collectDraft.sourceText,
				targetText: collectDraft.targetText,
			}).then((saved) => {
				if (!saved || !currentPopup?.contains(collectBtn)) {
					return;
				}
				collectBtn.textContent = "✓ 已收录";
				collectBtn.disabled = true;
				setTimeout(() => {
					collectBtn.textContent = "＋ 收录术语";
					collectBtn.disabled = false;
				}, 1600);
			});
		});
		footer.append(collectBtn);
	}

	const popupParts: HTMLElement[] = [header, preview, result];
	if (footer) {
		popupParts.push(footer);
	}
	popup.append(...popupParts);
	const mount = (doc.body || doc.documentElement) as HTMLElement;
	mount.append(popup);

	// Position the popup so it does not cover the selected text: prefer below
	// the selection, fall back to above, then to the top of the viewport.
	const viewport = doc.defaultView;
	if (viewport) {
		const rect = popup.getBoundingClientRect();
		const selectionRect = getSelectionViewportRect(entry);
		if (selectionRect) {
			const PAD = 8;
			const [sLeft, , , sBottom] = selectionRect;
			let px = Math.min(
				Math.max(sLeft, PAD),
				Math.max(PAD, viewport.innerWidth - rect.width - PAD),
			);
			let py = sBottom + PAD;
			if (py + rect.height > viewport.innerHeight - PAD) {
				py = selectionRect[1] - rect.height - PAD;
				if (py < PAD) {
					py = PAD;
				}
			}
			popup.style.left = `${px}px`;
			popup.style.top = `${py}px`;
		} else {
			// No selection rect available: keep the mouse position but stay in
			// the viewport
			if (rect.right > viewport.innerWidth) {
				popup.style.left = `${Math.max(8, viewport.innerWidth - rect.width - 8)}px`;
			}
			if (rect.bottom > viewport.innerHeight) {
				popup.style.top = `${Math.max(8, viewport.innerHeight - rect.height - 8)}px`;
			}
		}
	}

	// The popup is a singleton (opening a new translation replaces the
	// current one) and is closed via its close button or the Escape key.
	currentPopup = popup;

	startTranslation(entry, result, cacheBadge, preview, text);
}

/**
 * Render the matched terminology in the popup preview: one term per line,
 * source and target in two aligned table columns (e.g.
 *   twistane        扭转烷
 *   bank            银行
 * ). Hidden when nothing matched.
 */
function renderTerminologyPreview(
	entry: ReaderEntry,
	preview: HTMLElement,
	terms: {sourceText: string; targetText?: string}[] | undefined,
): void {
	if (!terms?.length) {
		preview.style.display = "none";
		return;
	}
	preview.replaceChildren();

	const table = entry.doc.createElement("table");
	table.style.cssText = "border-collapse: collapse; margin-top: 2px;";
	const tbody = entry.doc.createElement("tbody");
	for (const term of terms) {
		const tr = entry.doc.createElement("tr");
		const tdSrc = entry.doc.createElement("td");
		tdSrc.textContent = term.sourceText;
		tdSrc.style.cssText = "padding: 0 12px 0 0; vertical-align: top;";
		const tdTgt = entry.doc.createElement("td");
		tdTgt.textContent = term.targetText ?? "（保留原文）";
		tdTgt.style.cssText = "padding: 0; vertical-align: top;";
		tr.append(tdSrc, tdTgt);
		tbody.append(tr);
	}
	table.append(tbody);
	preview.append(table);
	preview.style.display = "";
}

async function startTranslation(
	entry: ReaderEntry,
	result: HTMLElement,
	cacheBadge: HTMLElement,
	preview: HTMLElement,
	text: string,
): Promise<void> {
	// Delegate the whole request (context, cache, transport) to the pipeline.
	const handle = await startPipelineTranslation(entry, text);
	if (!handle) {
		result.textContent =
			"⚠ 未配置翻译供应商，请前往 ZCTr设置 中添加并激活一个供应商。";
		return;
	}

	renderTerminologyPreview(entry, preview, handle.terminology?.matched);

	const isVisible = (): boolean => !!currentPopup?.contains(result);

	// Local cache hit: show the previous translation instantly
	if (handle.fromCache) {
		const cached = await handle.run();
		zlog.debug(`cache hit: ${cached.length} chars`);
		cacheBadge.hidden = false;
		result.textContent = cached;
		collectDraft.targetText = cached;
		return;
	}
	cacheBadge.hidden = true;

	const showError = (error: Error): void => {
		if (!isVisible()) {
			return;
		}
		result.append(
			entry.doc.createTextNode(`\n⚠ 翻译失败：${error.message}`),
		);
		const retry = entry.doc.createElement("button");
		retry.textContent = "重试";
		retry.style.cssText = [
			"margin-top: 8px",
			"padding: 3px 14px",
			"border-radius: 4px",
			"cursor: pointer",
			"border: 1px solid",
			"border-color: var(--fill-quaternary, #c8c8c8)",
			"background: var(--material-background, #f5f5f5)",
			"color: var(--fill-primary, #000000)",
		].join("; ");
		retry.addEventListener("click", (event) => {
			event.stopPropagation();
			startTranslation(entry, result, cacheBadge, preview, text);
		});
		result.append(retry);
	};

	if (handle.streaming) {
		result.textContent = "";
		handle
			.run((delta) => {
				if (isVisible()) {
					result.textContent += delta;
					collectDraft.targetText = result.textContent ?? "";
				}
			})
			.then((full) => {
				if (isVisible() && full) {
					result.textContent = full;
					collectDraft.targetText = full;
				}
			})
			.catch(showError);
	} else {
		result.textContent = "翻译中…";
		handle
			.run()
			.then((translation) => {
				if (isVisible()) {
					result.textContent = translation;
					collectDraft.targetText = translation;
				}
			})
			.catch(showError);
	}
}

/**
 * Start dragging the popup by its header via pointer events. Move/up
 * listeners are attached to both the reader document and the pdf.js viewer
 * iframe window, because pointer movement over the viewer never bubbles to
 * the reader document.
 */
function startDrag(
	doc: Document,
	iframeWin: Window,
	popup: HTMLElement,
	event: PointerEvent,
): void {
	const startX = event.clientX;
	const startY = event.clientY;
	const startLeft = parseFloat(popup.style.left) || 0;
	const startTop = parseFloat(popup.style.top) || 0;
	const viewport = doc.defaultView;

	const onMove = (e: PointerEvent): void => {
		if (!viewport) {
			return;
		}
		// Keep at least a sliver of the popup visible so it can be dragged back
		const left = startLeft + e.clientX - startX;
		const top = startTop + e.clientY - startY;
		popup.style.left = `${Math.max(-popup.offsetWidth + 40, Math.min(left, viewport.innerWidth - 40))}px`;
		popup.style.top = `${Math.max(0, Math.min(top, viewport.innerHeight - 40))}px`;
	};
	const onUp = (): void => {
		doc.removeEventListener("pointermove", onMove, true);
		iframeWin.removeEventListener("pointermove", onMove, true);
		doc.removeEventListener("pointerup", onUp, true);
		iframeWin.removeEventListener("pointerup", onUp, true);
		(doc.body as HTMLElement).style.userSelect = "";
	};
	(doc.body as HTMLElement).style.userSelect = "none";
	doc.addEventListener("pointermove", onMove, true);
	iframeWin.addEventListener("pointermove", onMove, true);
	doc.addEventListener("pointerup", onUp, true);
	iframeWin.addEventListener("pointerup", onUp, true);
}

/**
 * Start resizing the popup from its bottom-right handle. Same cross-iframe
 * listener strategy as dragging.
 */
function startResize(
	doc: Document,
	iframeWin: Window,
	popup: HTMLElement,
	event: PointerEvent,
): void {
	const startX = event.clientX;
	const startY = event.clientY;
	const startW = popup.offsetWidth;
	const startH = popup.offsetHeight;
	const MIN_WIDTH = 220;
	const MIN_HEIGHT = 120;

	const onMove = (e: PointerEvent): void => {
		popup.style.width = `${Math.max(MIN_WIDTH, startW + e.clientX - startX)}px`;
		popup.style.height = `${Math.max(MIN_HEIGHT, startH + e.clientY - startY)}px`;
		// User-sized: drop the auto limits
		popup.style.maxWidth = "none";
		popup.style.maxHeight = "none";
	};
	const onUp = (): void => {
		doc.removeEventListener("pointermove", onMove, true);
		iframeWin.removeEventListener("pointermove", onMove, true);
		doc.removeEventListener("pointerup", onUp, true);
		iframeWin.removeEventListener("pointerup", onUp, true);
		(doc.body as HTMLElement).style.userSelect = "";
	};
	(doc.body as HTMLElement).style.userSelect = "none";
	doc.addEventListener("pointermove", onMove, true);
	iframeWin.addEventListener("pointermove", onMove, true);
	doc.addEventListener("pointerup", onUp, true);
	iframeWin.addEventListener("pointerup", onUp, true);
}

/**
 * Viewport rect [left, top, right, bottom] of the current selection, using
 * Zotero's logical selection (which survives the right-click re-render that
 * clears the native selection). Null when there is no usable selection.
 */
function getSelectionViewportRect(
	entry: ReaderEntry,
): [number, number, number, number] | null {
	try {
		const view = entry.view as any;
		const ranges = view?._selectionRanges;
		if (Array.isArray(ranges) && ranges.length && !ranges[0]?.collapsed) {
			const rect = view.getClientRectForPopup?.(ranges[0].position);
			if (Array.isArray(rect) && rect.length >= 4) {
				return [rect[0], rect[1], rect[2], rect[3]];
			}
		}
	} catch (error) {
		zlog.warn("Failed to get selection rect:", error);
	}
	return null;
}

/** Close the open popup, if any. */
export function closePopup(): void {
	if (!currentPopup) {
		return;
	}
	currentPopup.remove();
	currentPopup = null;
}
