/**
 * "ZCTr 翻译" entry on the reader's view context menu.
 *
 * Right-clicking the PDF view opens `createViewContextMenu`; when there is a
 * text selection the menu gets a ZCTr entry that translates the selection.
 */

import {
	consumeReaderEntry,
	MAX_SOURCE_LENGTH,
	registerReaderEntry,
	registerReaderListener,
	unregisterReaderListener,
	type ContextMenuEvent,
	type ViewLike,
} from "./common";
import {openTranslatePopup} from "./translate-popup";

/**
 * Collect the current text selection from the focused reader view.
 *
 * Prefers the native browser selection on the pdf.js text layer. The reader
 * re-renders on right-click (`_handleContextMenu` calls `_render()`), which
 * rebuilds the text layer and clears the native selection, so fall back to
 * Zotero's logical selection ranges (`_selectionRanges`), which survive the
 * re-render and carry `text` per range.
 */
function getSelectedText(view: ViewLike | undefined): string {
	const win = view?._iframeWindow;
	if (win) {
		try {
			const native = (win.getSelection()?.toString() || "").trim();
			if (native) {
				return native;
			}
		} catch (error) {
			ztoolkit.log("[ZCTr] Failed to read selection:", error);
		}
	}
	try {
		const ranges = (view as any)?._selectionRanges;
		if (Array.isArray(ranges) && ranges.length) {
			const text = ranges
				.filter((r: any) => r && !r.collapsed && typeof r.text === "string")
				.map((r: any) => r.text)
				.join("\n")
				.trim();
			if (text) {
				return text;
			}
		}
	} catch (error) {
		ztoolkit.log("[ZCTr] Failed to read logical selection:", error);
	}
	return "";
}

function handleViewContextMenu(event: ContextMenuEvent): void {
	const reader = event.reader;
	const internal = reader?._internalReader;
	const view = internal?._lastView || internal?._primaryView;
	const text = getSelectedText(view);
	if (!text) {
		return;
	}
	const doc = reader?._iframeWindow?.document;
	const iframeWin = view?._iframeWindow;
	if (!doc || !iframeWin) {
		return;
	}

	const id = registerReaderEntry({view, doc, iframeWin, itemID: reader?.itemID});

	const {x, y} = event.params || {};
	event.append?.({
		label: "ZCTr 翻译",
		onCommand: () => {
			const entry = consumeReaderEntry(id);
			if (entry) {
				openTranslatePopup(entry, text.slice(0, MAX_SOURCE_LENGTH), x, y);
			}
		},
	});
}

export function registerViewMenu(): void {
	registerReaderListener("createViewContextMenu", handleViewContextMenu);
	ztoolkit.log("[ZCTr] View context menu entry registered");
}

export function unregisterViewMenu(): void {
	unregisterReaderListener("createViewContextMenu", handleViewContextMenu);
}
