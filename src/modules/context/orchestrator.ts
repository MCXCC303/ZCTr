import {getPref, PREFS} from "../../utils/prefs";
import type {ViewLike} from "../../types/reader";
import {
	CONTEXT_VERSION,
	type ContextLevel,
	type ContextPolicy,
	type TranslationContext,
} from "./context";
import {DEFAULT_CONTEXT_BUDGET, truncateText} from "./budget";
import {riskHeuristic} from "./scorer";
import {getSelectionRanges} from "./providers/selection-resolver";
import {getLocalContextFromView} from "./providers/local-context-provider";
import {getDocumentMetadata} from "./providers/metadata-provider";
import {getSectionTitle} from "./providers/section-title-provider";
import * as zlog from "../../utils/logger";

export interface ContextOptions {
	level: ContextLevel;
	includeAbstract: boolean;
	includeTitle: boolean;
	includeSectionTitle: boolean;
	includeAdjacentParagraphs: boolean;
}

const LEVELS: ContextLevel[] = ["selection", "local", "semantic", "adaptive"];
const DEFAULT_LEVEL: ContextLevel = "local";

export function getContextOptionsFromPrefs(): ContextOptions {
	const raw = getPref(PREFS.CONTEXT_LEVEL) as string;
	const level: ContextLevel = (LEVELS as string[]).includes(raw)
		? (raw as ContextLevel)
		: DEFAULT_LEVEL;
	return {
		level,
		includeAbstract: getPref(PREFS.CONTEXT_INCLUDE_ABSTRACT) !== false,
		includeTitle: getPref(PREFS.CONTEXT_INCLUDE_TITLE) !== false,
		includeSectionTitle:
			getPref(PREFS.CONTEXT_INCLUDE_SECTION_TITLE) !== false,
		includeAdjacentParagraphs: !!getPref(
			PREFS.CONTEXT_INCLUDE_ADJACENT_PARAGRAPHS,
		),
	};
}

export async function assembleContext(
	view: ViewLike | undefined,
	itemID: number | undefined,
	selectedText: string,
	opts: ContextOptions,
): Promise<TranslationContext> {
	const reachDocSummary = (lvl: ContextLevel): boolean =>
		lvl === "semantic" || lvl === "adaptive";
	const policy: ContextPolicy = {
		level: opts.level,
		includeAbstract: reachDocSummary(opts.level) ? opts.includeAbstract : false,
		includeTitle: reachDocSummary(opts.level) ? opts.includeTitle : false,
		includeSectionTitle:
			opts.level !== "selection" ? opts.includeSectionTitle : false,
		includeAdjacentParagraphs:
			opts.level !== "selection" ? opts.includeAdjacentParagraphs : false,
	};
	const ctx: TranslationContext = {
		selectedText,
		policy,
		version: CONTEXT_VERSION,
	};
	if (opts.level === "selection") {
		return ctx;
	}

	const ranges = getSelectionRanges(view);
	// NOTE: ranges may be empty (Zotero 10 beta clears the reader's logical
	// selection in the highlight/annotation flow); getLocalContextFromView
	// then locates the selected text in the page chars, so the assembled
	// context stays deterministic across reader states (same cache key).

	const local = getLocalContextFromView(
		view,
		ranges,
		{
			includeAdjacentParagraphs: opts.includeAdjacentParagraphs,
			maxChars: DEFAULT_CONTEXT_BUDGET.localContextMaxChars,
		},
		selectedText,
	);
	if (
		local.containingSentence ||
		local.currentParagraph ||
		local.previousParagraph ||
		local.nextParagraph
	) {
		ctx.local = local;
		zlog.debug(`local context: sentence=${local.containingSentence?.length ?? 0} para=${local.currentParagraph?.length ?? 0} prev=${local.previousParagraph?.length ?? 0} next=${local.nextParagraph?.length ?? 0}`);
	} else if (!ranges.length) {
		zlog.debug("no ranges and text not located in pages -> selection-only context");
	}

	const useDocSummary =
		opts.level === "semantic" ||
		(opts.level === "adaptive" && riskHeuristic(selectedText));
	if (useDocSummary) {
		const meta = await getDocumentMetadata(itemID);
		if (meta) {
			const doc: NonNullable<TranslationContext["document"]> = {
				itemId: meta.itemId,
				attachmentId: meta.attachmentId,
			};
			if (opts.includeTitle && meta.title) {
				doc.title = meta.title;
			}
			if (opts.includeAbstract && meta.abstract) {
				doc.abstract = truncateText(
					meta.abstract,
					DEFAULT_CONTEXT_BUDGET.abstractMaxChars,
				);
				doc.abstractState = meta.abstractState;
				doc.abstractSource = meta.abstractSource;
			}
			if (doc.title || doc.abstract) {
				ctx.document = doc;
			}
		}
	}

	if (opts.includeSectionTitle && ranges[0]) {
		const sectionTitle = await getSectionTitle(view, ranges[0].pageIndex);
		if (sectionTitle) {
			ctx.document ??= {};
			ctx.document.sectionTitle = sectionTitle;
		}
	}

	return ctx;
}
