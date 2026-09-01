/**
 * SelectionResolver - defensive access to the reader's logical selection
 * ranges (Zotero reader internals, see ZCTr-context-M1-plan.md §2).
 *
 * `view._selectionRanges` is an array with one entry per selected page:
 *   { anchorOffset, headOffset, text, position: { pageIndex, rects }, collapsed }
 * where anchorOffset/headOffset index into `view._pdfPages[pageIndex].chars`.
 * The ranges survive the right-click re-render that clears the native
 * selection (see common.ts getSelectedText).
 */

import type {ViewLike} from "../../../types/reader";

export interface SelectionOffsetRange {
	pageIndex: number;
	/** Char offset into _pdfPages[pageIndex].chars (may be absent on old readers). */
	anchorOffset?: number;
	headOffset?: number;
	/** Selected text of this page's range (always present). */
	text: string;
}

/**
 * Read the logical selection ranges of a reader view. Returns [] on any
 * failure or when there is no usable (non-collapsed) selection.
 */
export function getSelectionRanges(view: ViewLike | undefined): SelectionOffsetRange[] {
	try {
		const ranges = (view as any)?._selectionRanges;
		if (!Array.isArray(ranges)) {
			return [];
		}
		const out: SelectionOffsetRange[] = [];
		for (const r of ranges) {
			if (!r || r.collapsed) {
				continue;
			}
			const pageIndex = r?.position?.pageIndex;
			if (typeof pageIndex !== "number" || !Number.isInteger(pageIndex)) {
				continue;
			}
			out.push({
				pageIndex,
				anchorOffset:
					typeof r.anchorOffset === "number" ? r.anchorOffset : undefined,
				headOffset:
					typeof r.headOffset === "number" ? r.headOffset : undefined,
				text: typeof r.text === "string" ? r.text : "",
			});
		}
		return out;
	} catch (error) {
		ztoolkit.log("[ZCTr] Failed to read selection ranges:", error);
		return [];
	}
}
