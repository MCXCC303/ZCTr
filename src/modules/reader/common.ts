export type {
	ContextMenuEvent,
	ReaderEntry,
	ReaderLike,
	ViewLike,
} from "../../types/reader";
import * as zlog from "../../utils/logger";
import type {
	ContextMenuEvent,
	ReaderEntry,
	ReaderLike,
	ViewLike,
} from "../../types/reader";

const REGISTRY_LIMIT = 50;

const readerRegistry = new Map<number, ReaderEntry>();
let readerIdCounter = 0;

export function registerReaderEntry(entry: ReaderEntry): number {
	const id = ++readerIdCounter;
	readerRegistry.set(id, entry);
	if (readerRegistry.size > REGISTRY_LIMIT) {
		readerRegistry.delete(readerRegistry.keys().next().value as number);
	}
	return id;
}

export function consumeReaderEntry(id: number): ReaderEntry | null {
	const entry = readerRegistry.get(id);
	readerRegistry.delete(id);
	return entry ?? null;
}

/** Longest source text sent to the provider. */
export const MAX_SOURCE_LENGTH = 8000;

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
 * The reader re-renders on right-click (`_handleContextMenu` calls `_render()`),
 * which clears the native selection; `_selectionRanges` survives it.
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
			zlog.warn("Failed to read selection:", error);
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
		zlog.warn("Failed to read logical selection:", error);
	}
	return "";
}

type ReaderEventType = Parameters<
	typeof Zotero.Reader.registerEventListener
>[0];

/**
 * Register a reader event listener. Duplicate detection relies on Zotero's
 * private `_registeredListeners` list (there is no public query API).
 */
export function registerReaderListener(
	type: ReaderEventType,
	handler: (event: ContextMenuEvent) => void,
): void {
	if (!Zotero.Reader?.registerEventListener) {
		zlog.info("Zotero.Reader.registerEventListener unavailable");
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

export function unregisterReaderListener(
	type: ReaderEventType,
	handler: (event: ContextMenuEvent) => void,
): void {
	Zotero.Reader?.unregisterEventListener?.(type, handler as never);
}

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
