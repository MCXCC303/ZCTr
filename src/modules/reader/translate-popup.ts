import {startTranslation as startPipelineTranslation} from "../translation/pipeline";
import {isCollectableTermText} from "../translation/term-actions";
import type {ReaderEntry} from "../../types/reader";
import {openCollectTermDialog} from "./collect-term";
import {getString} from "../../utils/locale";
import * as zlog from "../../utils/logger";

const POPUP_ID = "zctr-translate-popup";

let currentPopup: HTMLElement | null = null;
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
		"border: 1px solid",
		"border-color: var(--fill-quaternary, #c8c8c8)",
		"border-radius: 8px",
		"box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25)",
		"font-size: 13px",
		"line-height: 1.6",
		"overflow: hidden",
		"user-select: text",
		"-webkit-user-select: text",
	].join("; ");

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
	title.textContent = getString("popup-title");
	const closeBtn = doc.createElement("button");
	closeBtn.textContent = "✕";
	closeBtn.title = getString("popup-close");
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
	const cacheBadge = doc.createElement("span");
	cacheBadge.textContent = getString("popup-cache-badge");
	cacheBadge.title = getString("popup-cache-title");
	cacheBadge.style.cssText = [
		"font-size: 11px",
		"color: #2f7cde",
		"margin-right: 6px",
		"opacity: 0.85",
		"flex-shrink: 0",
	].join("; ");
	cacheBadge.hidden = true;
	header.append(title, cacheBadge, closeBtn);

	header.addEventListener("pointerdown", (event: PointerEvent) => {
		const target = event.target as HTMLElement;
		if (target.closest?.("[data-zctr-close]")) {
			return;
		}
		event.preventDefault();
		target.setPointerCapture?.(event.pointerId);
		startDrag(entry.doc, entry.iframeWin, popup, event);
	});

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

	const result = doc.createElement("div");
	result.style.cssText = [
		"flex: 1",
		"min-height: 40px",
		"overflow-y: auto",
		"padding: 8px 10px",
		"white-space: pre-wrap",
		"word-break: break-word",
	].join("; ");

	popup.addEventListener("pointerdown", (event) => {
		// The reader's focus manager preventDefaults pointerdown on unknown
		// elements, so keep it from reaching the popup.
		event.stopPropagation();
	});

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
		collectBtn.textContent = getString("popup-collect");
		collectBtn.title = getString("popup-collect-title");
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
				collectBtn.textContent = getString("popup-collected");
				collectBtn.disabled = true;
				setTimeout(() => {
					collectBtn.textContent = getString("popup-collect");
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
			if (rect.right > viewport.innerWidth) {
				popup.style.left = `${Math.max(8, viewport.innerWidth - rect.width - 8)}px`;
			}
			if (rect.bottom > viewport.innerHeight) {
				popup.style.top = `${Math.max(8, viewport.innerHeight - rect.height - 8)}px`;
			}
		}
	}

	currentPopup = popup;
	startTranslation(entry, result, cacheBadge, preview, text);
}

/** One term per line, source and target in two columns. */
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
		tdTgt.textContent = term.targetText ?? getString("popup-keep-original");
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
	const handle = await startPipelineTranslation(entry, text);
	if (!handle) {
		result.textContent = getString("popup-no-provider");
		return;
	}

	renderTerminologyPreview(entry, preview, handle.terminology?.matched);

	const isVisible = (): boolean => !!currentPopup?.contains(result);

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
			entry.doc.createTextNode(
				"\n" + getString("popup-error", {args: {detail: error.message}}),
			),
		);
		const retry = entry.doc.createElement("button");
		retry.textContent = getString("popup-retry");
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
		result.textContent = getString("popup-translating");
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
		// Keep a 40px sliver visible so the popup can be dragged back.
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

export function closePopup(): void {
	if (!currentPopup) {
		return;
	}
	currentPopup.remove();
	currentPopup = null;
}
