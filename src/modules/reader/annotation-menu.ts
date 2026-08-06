/**
 * "ZCTr 翻译" entry on the reader's annotation context menu.
 *
 * Right-clicking a highlighted/underlined annotation opens
 * `createAnnotationContextMenu`; the ZCTr entry translates the annotation's
 * highlighted text plus its comment.
 */

import {
	consumeReaderEntry,
	MAX_SOURCE_LENGTH,
	registerReaderEntry,
	registerReaderListener,
	unregisterReaderListener,
	type ContextMenuEvent,
	type ReaderLike,
} from "./common";
import {openTranslatePopup} from "./translate-popup";

/**
 * Collect the text of the annotations a context menu was opened on.
 * Each annotation contributes its highlighted text plus its comment.
 */
function getAnnotationText(
	reader: ReaderLike | undefined,
	ids: string[] | undefined,
): string {
	if (!ids?.length || !reader?.itemID) {
		return "";
	}
	const attachment = Zotero.Items.get(reader.itemID);
	if (!attachment) {
		return "";
	}
	const parts: string[] = [];
	for (const key of ids) {
		const annotation = Zotero.Items.getByLibraryAndKey(
			attachment.libraryID,
			key,
		);
		if (!annotation) {
			continue;
		}
		const text = (annotation.annotationText || "").trim();
		const comment = (annotation.annotationComment || "").trim();
		if (text && comment) {
			parts.push(`${text}\n\n(${comment})`);
		} else if (text || comment) {
			parts.push(text || comment);
		}
	}
	return parts.join("\n\n---\n\n");
}

function handleAnnotationContextMenu(event: ContextMenuEvent): void {
	const reader = event.reader;
	const text = getAnnotationText(reader, event.params?.ids);
	if (!text) {
		return;
	}
	const internal = reader?._internalReader;
	const view = internal?._lastView || internal?._primaryView;
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

export function registerAnnotationMenu(): void {
	registerReaderListener("createAnnotationContextMenu", handleAnnotationContextMenu);
	ztoolkit.log("[ZCTr] Annotation context menu entry registered");
}

export function unregisterAnnotationMenu(): void {
	unregisterReaderListener("createAnnotationContextMenu", handleAnnotationContextMenu);
}
