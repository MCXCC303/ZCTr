import {
	getAnnotationText,
	getReaderContext,
	getSelectedText,
	MAX_SOURCE_LENGTH,
	type ReaderLike,
} from "./common";
import {closePopup, openTranslatePopup} from "./translate-popup";
import {getPref, PREFS} from "../../utils/prefs";
import {matchesShortcut, parseShortcut} from "../../utils/shortcut";
import * as zlog from "../../utils/logger";

const hotkeyWindows = new Set<Window>();

function isEditableTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el || typeof el.closest !== "function") {
		return false;
	}
	return !!el.closest("input, textarea, select, [contenteditable='true']");
}

function hasModifier(combo: string): boolean {
	const shortcut = parseShortcut(combo);
	return !!shortcut && (shortcut.ctrl || shortcut.alt || shortcut.shift || shortcut.meta);
}

function findReaderForEvent(event: KeyboardEvent): ReaderLike | null {
	const targetWin = (event.target as Element | null)?.ownerDocument?.defaultView;
	if (!targetWin) {
		return null;
	}
	for (const reader of (Zotero.Reader as any)._readers ?? []) {
		const outerWin = reader._iframeWindow;
		if (!outerWin) {
			continue;
		}
		if (targetWin === outerWin) {
			return reader;
		}
		// Walk up the window chain to the reader's outer iframe window
		let win: Window | null = targetWin;
		while (win && win.parent && win.parent !== win) {
			if (win.parent === outerWin) {
				return reader;
			}
			win = win.parent;
		}
	}
	return null;
}

function handleWindowKeyDown(event: KeyboardEvent): void {
	try {
		// Close the popup without preventDefault: the reader's own Escape
		// handling (find bar, fullscreen) must still run.
		if (event.key === "Escape") {
			closePopup();
			return;
		}
		const combo = (getPref(PREFS.SHORTCUT) as string) || "";
		if (!combo || !matchesShortcut(event, combo)) {
			return;
		}
		// Only modifier combos may fire in editable fields (comments, find box).
		if (isEditableTarget(event.target) && !hasModifier(combo)) {
			return;
		}
		const reader = findReaderForEvent(event);
		if (!reader) {
			return;
		}
		const context = getReaderContext(reader);
		if (!context) {
			return;
		}
		// Creating a highlight clears the selection ranges, so fall back to
		// the selected annotation's text.
		let text = getSelectedText(context.view);
		if (!text) {
			const view = context.view as any;
			const ids = view?._selectedAnnotationIDs;
			text = Array.isArray(ids) && ids.length
				? getAnnotationText(reader, ids)
				: "";
		}
		if (!text) {
			return;
		}
		zlog.debug(`hotkey: translating selection (${text.length} chars)`);

		// Consume the shortcut so the reader's own key handling does not react.
		event.preventDefault();
		event.stopPropagation();

		openTranslatePopup(
			{...context, itemID: reader?.itemID},
			text.slice(0, MAX_SOURCE_LENGTH),
			undefined,
			undefined,
		);
	} catch (error) {
		zlog.debug(`hotkey handler error: ${error}`);
	}
}

/**
 * The reader's focus manager hijacks Ctrl+C when an annotation is selected;
 * stopping propagation at the main document (earlier in the capture path)
 * keeps the normal copy of the popup text.
 */
function handleWindowCopy(event: ClipboardEvent): void {
	const target = event.target as Element | null;
	if (
		target &&
		typeof target.closest === "function" &&
		target.closest("#zctr-translate-popup")
	) {
		event.stopPropagation();
	}
}

export function registerWindowHotkey(win: Window): void {
	if (hotkeyWindows.has(win)) {
		return;
	}
	hotkeyWindows.add(win);
	// Capture phase on the main window: key events from nested iframes
	// (PDF view, sidebar) bubble up to it.
	win.document.addEventListener("keydown", handleWindowKeyDown, true);
	win.document.addEventListener("copy", handleWindowCopy, true);
}

export function unregisterWindowHotkey(win: Window): void {
	if (!hotkeyWindows.has(win)) {
		return;
	}
	hotkeyWindows.delete(win);
	win.document.removeEventListener("keydown", handleWindowKeyDown, true);
	win.document.removeEventListener("copy", handleWindowCopy, true);
}

export function registerHotkey(): void {
	for (const win of Zotero.getMainWindows()) {
		registerWindowHotkey(win);
	}
	zlog.info("Translate hotkey registered");
}

export function unregisterHotkey(): void {
	for (const win of [...hotkeyWindows]) {
		unregisterWindowHotkey(win);
	}
}
