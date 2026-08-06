/**
 * ZCTr translate hotkey.
 *
 * Pressing the configured shortcut (pref `shortcut`, e.g. "ctrl+alt+t";
 * empty disables it) while a PDF reader is focused translates the current
 * text selection immediately - no context menu needed.
 *
 * The keydown listener lives on the Zotero main window (document capture
 * phase), not on the reader iframe: key events from any nested iframe
 * bubble through the main window, so this works regardless of where the
 * focus is inside the reader (PDF view, sidebar, toolbar). The reader
 * whose window chain contains the event target is located via
 * `Zotero.Reader._readers`, and the popup is positioned at the selection.
 */

import {
	getAnnotationText,
	getReaderContext,
	getSelectedText,
	MAX_SOURCE_LENGTH,
	type ReaderLike,
} from "./common";
import {openTranslatePopup} from "./translate-popup";
import {getPref, PREFS} from "../../utils/prefs";
import {matchesShortcut, parseShortcut} from "../../utils/shortcut";

/** Main windows that already have a keydown listener attached. */
const hotkeyWindows = new Set<Window>();

/** Whether the keydown target is an editable field. */
function isEditableTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el || typeof el.closest !== "function") {
		return false;
	}
	return !!el.closest("input, textarea, select, [contenteditable='true']");
}

/**
 * Whether the combo includes at least one modifier key. Modifier combos are
 * never plain text input, so triggering inside an editable field (e.g. an
 * annotation comment box) is intentional; modifier-less combos would fire
 * while typing and are only allowed outside editable fields.
 */
function hasModifier(combo: string): boolean {
	const shortcut = parseShortcut(combo);
	return !!shortcut && (shortcut.ctrl || shortcut.alt || shortcut.shift || shortcut.meta);
}

/**
 * Find the reader whose iframe window chain contains the event target
 * (the focused element). The target may live in the outer reader iframe or
 * in a nested iframe (e.g. the pdf.js viewer).
 */
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
		const combo = (getPref(PREFS.SHORTCUT) as string) || "";
		if (!combo || !matchesShortcut(event, combo)) {
			return;
		}
		// In editable fields (annotation comments, find box, etc.) only allow
		// modifier combos: they are intentional shortcuts, never text input
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
		// Prefer the live text selection; fall back to the currently selected
		// annotation (creating a highlight clears the selection ranges, so the
		// annotation text is what remains translatable)
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
		Zotero.debug(`[ZCTr] hotkey: translating selection (${text.length} chars)`);

		// Consume the shortcut so the reader's own key handling (e.g. find
		// popup shortcuts) does not also react
		event.preventDefault();
		event.stopPropagation();

		openTranslatePopup(
			{...context, itemID: reader?.itemID},
			text.slice(0, MAX_SOURCE_LENGTH),
			undefined,
			undefined,
		);
	} catch (error) {
		Zotero.debug(`[ZCTr] hotkey handler error: ${error}`);
	}
}

/**
 * Protect copying text from the ZCTr popup: the reader's focus manager
 * listens for `copy` on its window (capture) and, when an annotation is
 * selected, hijacks Ctrl+C to copy the annotation instead. Stopping the
 * event at the main-window document (which is earlier in the capture path)
 * lets the normal copy of the selected translation proceed.
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

/** Attach the hotkey listener to a main window (idempotent). */
export function registerWindowHotkey(win: Window): void {
	if (hotkeyWindows.has(win)) {
		return;
	}
	hotkeyWindows.add(win);
	win.document.addEventListener("keydown", handleWindowKeyDown, true);
	win.document.addEventListener("copy", handleWindowCopy, true);
}

/** Detach the hotkey listener from a main window (idempotent). */
export function unregisterWindowHotkey(win: Window): void {
	if (!hotkeyWindows.has(win)) {
		return;
	}
	hotkeyWindows.delete(win);
	win.document.removeEventListener("keydown", handleWindowKeyDown, true);
	win.document.removeEventListener("copy", handleWindowCopy, true);
}

/** Attach the hotkey listener to all currently open main windows. */
export function registerHotkey(): void {
	for (const win of Zotero.getMainWindows()) {
		registerWindowHotkey(win);
	}
	ztoolkit.log("[ZCTr] Translate hotkey registered");
}

export function unregisterHotkey(): void {
	for (const win of [...hotkeyWindows]) {
		unregisterWindowHotkey(win);
	}
}
