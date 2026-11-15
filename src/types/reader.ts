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
