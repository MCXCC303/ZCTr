/**
 * SectionTitleProvider - best-effort section title from the reader's PDF
 * outline (bookmarks). Mirrors Zotero's own getOutlinePath semantics: the
 * deepest outline item whose page index is <= the current page.
 *
 * `view._outline` items look like:
 *   { title, items?: [...], location?: { position?: { pageIndex } } }
 * and may be absent until the outline is loaded - in that case we trigger
 * the reader's internal `_initNativeOutline()` once and await it. Any
 * failure degrades to no section title.
 */

import type {ViewLike} from "../../../types/reader";

interface OutlineNode {
	title?: string;
	items?: OutlineNode[];
	location?: {position?: {pageIndex?: number}};
	/** Legacy fallback shape: pageIndex directly on the node. */
	pageIndex?: number;
}

/** Pure: deepest outline node whose page <= pageIndex (title, or undefined). */
export function findDeepestOutlineTitle(
	outline: OutlineNode[] | undefined | null,
	pageIndex: number,
): string | undefined {
	if (!Array.isArray(outline)) {
		return undefined;
	}
	let bestTitle: string | undefined;
	let bestDepth = -1;
	let bestPage = -Infinity;
	const walk = (nodes: OutlineNode[], depth: number): void => {
		for (const node of nodes) {
			const title = typeof node?.title === "string" ? node.title : undefined;
			const page = node?.location?.position?.pageIndex ?? node?.pageIndex;
			if (
				title &&
				typeof page === "number" &&
				page <= pageIndex &&
				(bestTitle === undefined ||
					page > bestPage ||
					(page === bestPage && depth > bestDepth))
			) {
				bestTitle = title;
				bestDepth = depth;
				bestPage = page;
			}
			if (Array.isArray(node?.items) && node.items.length) {
				walk(node.items, depth + 1);
			}
		}
	};
	walk(outline, 0);
	return bestTitle;
}

/** View wrapper: lazily load the outline if needed, then find the title. */
export async function getSectionTitle(
	view: ViewLike | undefined,
	pageIndex: number,
): Promise<string | undefined> {
	try {
		const v = view as any;
		let outline = v?._outline;
		if (!Array.isArray(outline) && typeof v?._initNativeOutline === "function") {
			try {
				await v._initNativeOutline();
			} catch {
				// Outline loading failed; keep whatever we have
			}
			outline = v?._outline;
		}
		return findDeepestOutlineTitle(outline, pageIndex);
	} catch (error) {
		ztoolkit.log("[ZCTr] Failed to resolve section title:", error);
		return undefined;
	}
}
