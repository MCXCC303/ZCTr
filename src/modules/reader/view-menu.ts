/**
 * "ZCTr 翻译" entry on the reader's view context menu.
 *
 * Right-clicking the PDF view opens `createViewContextMenu`; when there is a
 * text selection the menu gets a ZCTr entry that translates the selection.
 */

import {
	consumeReaderEntry,
	getReaderContext,
	getSelectedText,
	MAX_SOURCE_LENGTH,
	registerReaderEntry,
	registerReaderListener,
	unregisterReaderListener,
	type ContextMenuEvent,
} from "./common";
import {openTranslatePopup} from "./translate-popup";
import * as zlog from "../../utils/logger";

function handleViewContextMenu(event: ContextMenuEvent): void {
	const context = getReaderContext(event.reader);
	if (!context) {
		return;
	}
	const text = getSelectedText(context.view);
	if (!text) {
		return;
	}

	const id = registerReaderEntry({
		...context,
		itemID: event.reader?.itemID,
	});

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
	zlog.info("View context menu entry registered");
}

export function unregisterViewMenu(): void {
	unregisterReaderListener("createViewContextMenu", handleViewContextMenu);
}
