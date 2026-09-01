/**
 * Neutral structural types for the Zotero Reader integration.
 *
 * These are the only reader-facing types domain modules may depend on
 * (see ZCTr-modules-ARCHITECTURE.md §2): they describe the *view surface*
 * the context engine needs (selection ranges, document, iframe window)
 * without coupling to the reader DOM implementation.
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
