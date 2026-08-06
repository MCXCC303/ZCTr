/**
 * "ZCTr 翻译" entry on the reader's annotation context menu.
 *
 * Right-clicking a highlighted/underlined annotation opens
 * `createAnnotationContextMenu`; the ZCTr entry translates the annotation's
 * highlighted text plus its comment.
 */

import {
	consumeReaderEntry,
	getAnnotationText,
	getReaderContext,
	MAX_SOURCE_LENGTH,
	registerReaderEntry,
	registerReaderListener,
	unregisterReaderListener,
	type ContextMenuEvent,
} from "./common";
import {openTranslatePopup} from "./translate-popup";

function handleAnnotationContextMenu(event: ContextMenuEvent): void {
	const reader = event.reader;
	const text = getAnnotationText(reader, event.params?.ids);
	if (!text) {
		return;
	}
	const context = getReaderContext(reader);
	if (!context) {
		return;
	}

	const id = registerReaderEntry({...context, itemID: reader?.itemID});

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

export function registerAnnotationMenu(): void {
	registerReaderListener("createAnnotationContextMenu", handleAnnotationContextMenu);
	ztoolkit.log("[ZCTr] Annotation context menu entry registered");
}

export function unregisterAnnotationMenu(): void {
	unregisterReaderListener("createAnnotationContextMenu", handleAnnotationContextMenu);
}
