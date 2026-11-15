import type {ViewLike} from "../../../types/reader";
import * as zlog from "../../../utils/logger";

export interface SelectionOffsetRange {
	pageIndex: number;
	/** Char offset into _pdfPages[pageIndex].chars (may be absent on old readers). */
	anchorOffset?: number;
	headOffset?: number;
	text: string;
}

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
		zlog.warn("Failed to read selection ranges:", error);
		return [];
	}
}
