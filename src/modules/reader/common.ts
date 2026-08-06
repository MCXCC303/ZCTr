/**
 * Reader integration shared types and helpers.
 *
 * The view menu, annotation menu and translation popup all operate on a
 * context menu event that carries a reader reference; the menu handlers
 * register a ReaderEntry (capturing the reader's document/iframe/itemID)
 * and the popup consumes it when the menu item is clicked.
 */

export type ViewLike = {
	_iframeWindow?: Window;
};

export type ReaderLike = {
	itemID?: number;
	_iframeWindow?: Window;
	_internalReader?: {
		_primaryView?: ViewLike;
		_lastView?: ViewLike;
	};
};

export type ContextMenuEvent = {
	reader?: ReaderLike;
	params?: {x?: number; y?: number; ids?: string[]};
	append?: (options: {label: string; onCommand: () => void}) => void;
};

export type ReaderEntry = {
	view: ViewLike;
	doc: Document;
	iframeWin: Window;
	/** Attachment item id - scopes the translation cache to this article. */
	itemID?: number;
};

/** Cap on stale registry entries (menus opened but never clicked). */
const REGISTRY_LIMIT = 50;

/** Registered readers, keyed by a numeric id captured in the menu closure. */
const readerRegistry = new Map<number, ReaderEntry>();
let readerIdCounter = 0;

/** Register a reader entry and return its id for the menu closure. */
export function registerReaderEntry(entry: ReaderEntry): number {
	const id = ++readerIdCounter;
	readerRegistry.set(id, entry);
	if (readerRegistry.size > REGISTRY_LIMIT) {
		readerRegistry.delete(readerRegistry.keys().next().value as number);
	}
	return id;
}

/** Take (and remove) a registered reader entry by id. */
export function consumeReaderEntry(id: number): ReaderEntry | null {
	const entry = readerRegistry.get(id);
	readerRegistry.delete(id);
	return entry ?? null;
}

/** Longest source text sent to the provider. */
export const MAX_SOURCE_LENGTH = 8000;

/**
 * Extract the reader UI context (view, document, iframe window) from a
 * context menu event's reader reference. Null when the reader is not ready.
 */
export function getReaderContext(
	reader: ReaderLike | undefined,
): {view: ViewLike; doc: Document; iframeWin: Window} | null {
	const internal = reader?._internalReader;
	const view = internal?._lastView || internal?._primaryView;
	const doc = reader?._iframeWindow?.document;
	const iframeWin = view?._iframeWindow;
	if (!doc || !iframeWin) {
		return null;
	}
	return {view, doc, iframeWin};
}

/**
 * Collect the current text selection from the focused reader view.
 *
 * Prefers the native browser selection on the pdf.js text layer. The reader
 * re-renders on right-click (`_handleContextMenu` calls `_render()`), which
 * rebuilds the text layer and clears the native selection, so fall back to
 * Zotero's logical selection ranges (`_selectionRanges`), which survive the
 * re-render and carry `text` per range.
 */
export function getSelectedText(view: ViewLike | undefined): string {
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

/** The event names accepted by Zotero.Reader.registerEventListener. */
type ReaderEventType = Parameters<
	typeof Zotero.Reader.registerEventListener
>[0];

/**
 * Register a Zotero.Reader event listener, guarding against duplicate
 * registration (e.g. when onStartup is re-run).
 */
export function registerReaderListener(
	type: ReaderEventType,
	handler: (event: ContextMenuEvent) => void,
): void {
	if (!Zotero.Reader?.registerEventListener) {
		ztoolkit.log("[ZCTr] Zotero.Reader.registerEventListener unavailable");
		return;
	}
	const listeners = (Zotero.Reader as any)._registeredListeners ?? [];
	const has = (t: string): boolean =>
		listeners.some(
			(l: any) =>
				l.type === t && l.pluginID === addon.data.config.addonID,
		);
	if (!has(type)) {
		Zotero.Reader.registerEventListener(
			type,
			handler as never,
			addon.data.config.addonID,
		);
	}
}

/** Unregister a Zotero.Reader event listener. */
export function unregisterReaderListener(
	type: ReaderEventType,
	handler: (event: ContextMenuEvent) => void,
): void {
	Zotero.Reader?.unregisterEventListener?.(type, handler as never);
}

/**
 * Collect the text of annotations by their keys: each annotation contributes
 * its highlighted text plus its comment.
 */
export function getAnnotationText(
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
