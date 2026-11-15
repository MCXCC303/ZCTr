import type {ViewLike} from "../../../types/reader";
import * as zlog from "../../../utils/logger";

interface OutlineNode {
	title?: string;
	items?: OutlineNode[];
	location?: {position?: {pageIndex?: number}};
	/** Legacy fallback shape: pageIndex directly on the node. */
	pageIndex?: number;
}

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
				// Outline load failed; keep what we have.
			}
			outline = v?._outline;
		}
		return findDeepestOutlineTitle(outline, pageIndex);
	} catch (error) {
		zlog.warn("Failed to resolve section title:", error);
		return undefined;
	}
}
