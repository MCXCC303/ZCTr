/**
 * ZCTr reader integration - "translate" entry in the PDF reader context menu
 * and the floating translation popup.
 *
 * Mechanism (Zotero reader internals):
 * - The reader dispatches a `customEvent` on the reader iframe window with
 *   detail { type: "createViewContextMenu", reader, append, params } whenever
 *   the user right-clicks the PDF view. Zotero.Reader.registerEventListener
 *   forwards this to plugin code as event = { reader, params, append }.
 * - `params.x/y` are viewport coordinates of the reader iframe.
 * - The current text selection lives in the pdf.js viewer iframe:
 *   reader._internalReader._lastView._iframeWindow.getSelection().
 *
 * The popup is created inside the reader iframe document (so params.x/y map
 * directly) and closes on any pointerdown outside of it. Because pointer
 * events inside the pdf.js viewer iframe never reach the reader document,
 * the outside-click listener is attached to both documents.
 */

import {
  getActiveProvider,
  translateText,
  translateTextStreaming,
} from "../translate/translator";
import { getPref } from "../../utils/prefs";

const POPUP_ID = "zctr-translate-popup";
const MAX_SOURCE_LENGTH = 8000;

type ViewLike = {
  _iframeWindow?: Window;
};

type ReaderLike = {
  _iframeWindow?: Window;
  _internalReader?: {
    _primaryView?: ViewLike;
    _lastView?: ViewLike;
  };
};

type ContextMenuEvent = {
  reader?: ReaderLike;
  params?: { x?: number; y?: number };
  append?: (options: { label: string; onCommand: () => void }) => void;
};

type ReaderEntry = {
  view: ViewLike;
  doc: Document;
  iframeWin: Window;
};

/** Registered readers, keyed by a numeric id captured in the menu closure. */
const readerRegistry = new Map<number, ReaderEntry>();
let readerIdCounter = 0;
/** Cap on stale registry entries (menus opened but never clicked). */
const REGISTRY_LIMIT = 50;

/** Currently open popup state, per reader iframe document. */
type PopupState = {
  el: HTMLElement;
  cleanup: () => void;
};
const popupStates = new Map<Document, PopupState>();

export function registerReaderTranslate(): void {
  if (!Zotero.Reader?.registerEventListener) {
    ztoolkit.log("[ZCTr] Zotero.Reader.registerEventListener unavailable");
    return;
  }
  // Guard against duplicate registration (e.g. when onStartup is re-run)
  const listeners = (Zotero.Reader as any)._registeredListeners;
  if (
    Array.isArray(listeners) &&
    listeners.some(
      (l: any) =>
        l.type === "createViewContextMenu" &&
        l.pluginID === addon.data.config.addonID,
    )
  ) {
    ztoolkit.log("[ZCTr] Reader context menu entry already registered");
    return;
  }
  Zotero.Reader.registerEventListener(
    "createViewContextMenu",
    handleViewContextMenu as never,
    addon.data.config.addonID,
  );
  ztoolkit.log("[ZCTr] Reader context menu entry registered");
}

export function unregisterReaderTranslate(): void {
  if (!Zotero.Reader?.unregisterEventListener) {
    return;
  }
  Zotero.Reader.unregisterEventListener(
    "createViewContextMenu",
    handleViewContextMenu as never,
  );
  closePopup();
  ztoolkit.log("[ZCTr] Reader context menu entry unregistered");
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
function getSelectedText(view: ViewLike | undefined): string {
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

function handleViewContextMenu(event: ContextMenuEvent): void {
  const reader = event.reader;
  const internal = reader?._internalReader;
  const view = internal?._lastView || internal?._primaryView;
  const text = getSelectedText(view);
  if (!text) {
    return;
  }
  const doc = reader?._iframeWindow?.document;
  const iframeWin = view?._iframeWindow;
  if (!doc || !iframeWin) {
    return;
  }

  const id = ++readerIdCounter;
  readerRegistry.set(id, { view, doc, iframeWin });
  if (readerRegistry.size > REGISTRY_LIMIT) {
    readerRegistry.delete(readerRegistry.keys().next().value as number);
  }

  const { x, y } = event.params || {};
  event.append?.({
    label: "ZCTr 翻译",
    onCommand: () => {
      const entry = readerRegistry.get(id);
      readerRegistry.delete(id);
      if (entry) {
        openTranslatePopup(entry, text.slice(0, MAX_SOURCE_LENGTH), x, y);
      }
    },
  });
}

function openTranslatePopup(
  entry: ReaderEntry,
  text: string,
  x: number | undefined,
  y: number | undefined,
): void {
  closePopup(entry.doc);
  const { doc } = entry;
  const popup = doc.createElement("div");
  popup.id = POPUP_ID;
  popup.style.cssText = [
    "position: fixed",
    `left: ${x ?? 0}px`,
    `top: ${y ?? 0}px`,
    "z-index: 2147483647",
    "pointer-events: auto",
    "width: 420px",
    "max-width: calc(100vw - 16px)",
    "max-height: min(340px, 60vh)",
    "display: flex",
    "flex-direction: column",
    "background: var(--material-sidepane, #ffffff)",
    "color: var(--material-text, #000000)",
    "border: 1px solid var(--fill-quaternary, #c8c8c8)",
    "border-radius: 8px",
    "box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25)",
    "font-size: 13px",
    "line-height: 1.6",
    "overflow: hidden",
  ].join("; ");

  // Header: title + close button
  const header = doc.createElement("div");
  header.style.cssText = [
    "display: flex",
    "align-items: center",
    "justify-content: space-between",
    "padding: 6px 10px",
    "border-bottom: 1px solid var(--fill-quaternary, #e0e0e0)",
    "font-weight: 600",
    "flex-shrink: 0",
  ].join("; ");
  const title = doc.createElement("span");
  title.textContent = "ZCTr 翻译";
  const closeBtn = doc.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.title = "关闭";
  closeBtn.setAttribute("data-zctr-close", "1");
  closeBtn.style.cssText = [
    "border: none",
    "background: none",
    "cursor: pointer",
    "font-size: 12px",
    "padding: 2px 6px",
    "color: var(--material-text, #000000)",
    "border-radius: 4px",
  ].join("; ");
  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    closePopup();
  });
  header.append(title, closeBtn);

  // Drag the popup by its header via pointer events. Pointer events over the
  // pdf.js viewer iframe never bubble to the reader document, so move/up
  // listeners are attached to both.
  header.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest?.("[data-zctr-close]")) {
      return;
    }
    event.preventDefault();
    startDrag(entry.doc, entry.iframeWin, popup, event as PointerEvent);
  });

  // Resize handle at the bottom-right corner
  const resizeHandle = doc.createElement("div");
  resizeHandle.setAttribute("data-zctr-resize", "1");
  resizeHandle.style.cssText = [
    "position: absolute",
    "right: 2px",
    "bottom: 2px",
    "width: 14px",
    "height: 14px",
    "cursor: se-resize",
    "border-right: 3px solid var(--fill-tertiary, #999999)",
    "border-bottom: 3px solid var(--fill-tertiary, #999999)",
    "border-bottom-right-radius: 3px",
    "opacity: 0.6",
  ].join("; ");
  resizeHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startResize(entry.doc, entry.iframeWin, popup, event as PointerEvent);
  });
  popup.append(resizeHandle);

  // Source text (collapsible by scroll, no special UI)
  const source = doc.createElement("div");
  source.style.cssText = [
    "max-height: 120px",
    "overflow-y: auto",
    "padding: 8px 10px",
    "border-bottom: 1px solid var(--fill-quaternary, #eeeeee)",
    "white-space: pre-wrap",
    "word-break: break-word",
    "color: var(--fill-secondary, #666666)",
    "flex-shrink: 0",
  ].join("; ");
  source.textContent = text;

  // Translation result area
  const result = doc.createElement("div");
  result.style.cssText = [
    "flex: 1",
    "min-height: 40px",
    "overflow-y: auto",
    "padding: 8px 10px",
    "white-space: pre-wrap",
    "word-break: break-word",
  ].join("; ");

  popup.append(header, source, result);
  const mount = (doc.body || doc.documentElement) as HTMLElement;
  mount.append(popup);

  // Position the popup so it does not cover the selected text: prefer below
  // the selection, fall back to above, then to the top of the viewport.
  const viewport = doc.defaultView;
  if (viewport) {
    const rect = popup.getBoundingClientRect();
    const selectionRect = getSelectionViewportRect(entry);
    if (selectionRect) {
      const PAD = 8;
      const [sLeft, , , sBottom] = selectionRect;
      let px = Math.min(
        Math.max(sLeft, PAD),
        Math.max(PAD, viewport.innerWidth - rect.width - PAD),
      );
      let py = sBottom + PAD;
      if (py + rect.height > viewport.innerHeight - PAD) {
        py = selectionRect[1] - rect.height - PAD;
        if (py < PAD) {
          py = PAD;
        }
      }
      popup.style.left = `${px}px`;
      popup.style.top = `${py}px`;
    } else {
      // No selection rect available: keep the mouse position but stay in
      // the viewport
      if (rect.right > viewport.innerWidth) {
        popup.style.left = `${Math.max(8, viewport.innerWidth - rect.width - 8)}px`;
      }
      if (rect.bottom > viewport.innerHeight) {
        popup.style.top = `${Math.max(8, viewport.innerHeight - rect.height - 8)}px`;
      }
    }
  }

  // Close on any pointerdown outside the popup. Pointer events inside the
  // pdf.js viewer iframe never bubble up to the reader document, so listen on
  // both the reader document and the viewer iframe window.
  const onPointerDown = (event: Event): void => {
    const target = event.target as Node | null;
    if (target && !popup.contains(target)) {
      closePopup(doc);
    }
  };
  // Escape inside the pdf.js viewer iframe never bubbles to the reader
  // document, so listen on both.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      closePopup(doc);
    }
  };
  doc.addEventListener("pointerdown", onPointerDown, true);
  entry.iframeWin.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("keydown", onKeyDown, true);
  entry.iframeWin.addEventListener("keydown", onKeyDown, true);

  popupStates.set(doc, {
    el: popup,
    cleanup: () => {
      doc.removeEventListener("pointerdown", onPointerDown, true);
      entry.iframeWin.removeEventListener("pointerdown", onPointerDown, true);
      doc.removeEventListener("keydown", onKeyDown, true);
      entry.iframeWin.removeEventListener("keydown", onKeyDown, true);
    },
  });

  startTranslation(entry, result, text);
}

function startTranslation(
  entry: ReaderEntry,
  result: HTMLElement,
  text: string,
): void {
  const provider = getActiveProvider();
  if (!provider) {
    result.textContent =
      "⚠ 未配置翻译供应商，请到 Zotero 设置 → ZCTr 中添加并激活一个供应商。";
    return;
  }
  const targetLang = (getPref("targetLang") as string) || "zh";
  const streaming = getPref("streaming") !== false;
  Zotero.debug(`[ZCTr] startTranslation: streaming=${streaming} targetLang=${targetLang}`);

  const isVisible = (): boolean =>
    !!popupStates.get(entry.doc)?.el?.contains(result);

  const showError = (error: Error): void => {
    if (!isVisible()) {
      return;
    }
    result.append(
      entry.doc.createTextNode(`\n⚠ 翻译失败：${error.message}`),
    );
    const retry = entry.doc.createElement("button");
    retry.textContent = "重试";
    retry.style.cssText = [
      "margin-top: 8px",
      "padding: 3px 14px",
      "border-radius: 4px",
      "cursor: pointer",
      "border: 1px solid var(--fill-quaternary, #c8c8c8)",
      "background: var(--material-background, #f5f5f5)",
      "color: var(--material-text, #000000)",
    ].join("; ");
    retry.addEventListener("click", (event) => {
      event.stopPropagation();
      startTranslation(entry, result, text);
    });
    result.append(retry);
  };

  if (streaming) {
    result.textContent = "";
    translateTextStreaming(provider, text, targetLang, (delta) => {
      if (isVisible()) {
        result.textContent += delta;
      }
    })
      .then((full) => {
        if (isVisible() && full) {
          result.textContent = full;
        }
      })
      .catch(showError);
  } else {
    result.textContent = "翻译中…";
    translateText(provider, text, targetLang)
      .then((translation) => {
        if (isVisible()) {
          result.textContent = translation;
        }
      })
      .catch(showError);
  }
}

/**
 * Start dragging the popup by its header via pointer events. Move/up
 * listeners are attached to both the reader document and the pdf.js viewer
 * iframe window, because pointer movement over the viewer never bubbles to
 * the reader document.
 */
function startDrag(
  doc: Document,
  iframeWin: Window,
  popup: HTMLElement,
  event: PointerEvent,
): void {
  const startX = event.clientX;
  const startY = event.clientY;
  const startLeft = parseFloat(popup.style.left) || 0;
  const startTop = parseFloat(popup.style.top) || 0;
  const viewport = doc.defaultView;

  const onMove = (e: PointerEvent): void => {
    if (!viewport) {
      return;
    }
    // Keep at least a sliver of the popup visible so it can be dragged back
    const left = startLeft + e.clientX - startX;
    const top = startTop + e.clientY - startY;
    popup.style.left = `${Math.max(-popup.offsetWidth + 40, Math.min(left, viewport.innerWidth - 40))}px`;
    popup.style.top = `${Math.max(0, Math.min(top, viewport.innerHeight - 40))}px`;
  };
  const onUp = (): void => {
    doc.removeEventListener("pointermove", onMove, true);
    iframeWin.removeEventListener("pointermove", onMove, true);
    doc.removeEventListener("pointerup", onUp, true);
    iframeWin.removeEventListener("pointerup", onUp, true);
    (doc.body as HTMLElement).style.userSelect = "";
  };
  (doc.body as HTMLElement).style.userSelect = "none";
  doc.addEventListener("pointermove", onMove, true);
  iframeWin.addEventListener("pointermove", onMove, true);
  doc.addEventListener("pointerup", onUp, true);
  iframeWin.addEventListener("pointerup", onUp, true);
}

/**
 * Start resizing the popup from its bottom-right handle. Same cross-iframe
 * listener strategy as dragging.
 */
function startResize(
  doc: Document,
  iframeWin: Window,
  popup: HTMLElement,
  event: PointerEvent,
): void {
  const startX = event.clientX;
  const startY = event.clientY;
  const startW = popup.offsetWidth;
  const startH = popup.offsetHeight;
  const MIN_WIDTH = 220;
  const MIN_HEIGHT = 120;

  const onMove = (e: PointerEvent): void => {
    popup.style.width = `${Math.max(MIN_WIDTH, startW + e.clientX - startX)}px`;
    popup.style.height = `${Math.max(MIN_HEIGHT, startH + e.clientY - startY)}px`;
    // User-sized: drop the auto limits
    popup.style.maxWidth = "none";
    popup.style.maxHeight = "none";
  };
  const onUp = (): void => {
    doc.removeEventListener("pointermove", onMove, true);
    iframeWin.removeEventListener("pointermove", onMove, true);
    doc.removeEventListener("pointerup", onUp, true);
    iframeWin.removeEventListener("pointerup", onUp, true);
    (doc.body as HTMLElement).style.userSelect = "";
  };
  (doc.body as HTMLElement).style.userSelect = "none";
  doc.addEventListener("pointermove", onMove, true);
  iframeWin.addEventListener("pointermove", onMove, true);
  doc.addEventListener("pointerup", onUp, true);
  iframeWin.addEventListener("pointerup", onUp, true);
}

/**
 * Viewport rect [left, top, right, bottom] of the current selection, using
 * Zotero's logical selection (which survives the right-click re-render that
 * clears the native selection). Null when there is no usable selection.
 */
function getSelectionViewportRect(
  entry: ReaderEntry,
): [number, number, number, number] | null {
  try {
    const view = entry.view as any;
    const ranges = view?._selectionRanges;
    if (Array.isArray(ranges) && ranges.length && !ranges[0]?.collapsed) {
      const rect = view.getClientRectForPopup?.(ranges[0].position);
      if (Array.isArray(rect) && rect.length >= 4) {
        return [rect[0], rect[1], rect[2], rect[3]];
      }
    }
  } catch (error) {
    ztoolkit.log("[ZCTr] Failed to get selection rect:", error);
  }
  return null;
}

function closePopup(doc?: Document): void {
  if (doc) {
    const state = popupStates.get(doc);
    if (!state) {
      return;
    }
    state.cleanup();
    state.el.remove();
    popupStates.delete(doc);
    return;
  }
  for (const state of popupStates.values()) {
    state.cleanup();
    state.el.remove();
  }
  popupStates.clear();
}
