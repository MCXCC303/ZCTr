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
