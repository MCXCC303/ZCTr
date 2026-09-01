/**
 * ContextOrchestrator - assembles the TranslationContext for one translation
 * request (ZCTr-context-ARCHITECTURE.md §8).
 *
 * Responsibilities (M1): collect available context, apply the selected
 * policy level, cap by budget and output a stable TranslationContext.
 * It does NOT touch provider requests, translation, terminology or profiles.
 *
 * Level semantics (M1, see ZCTr-context-M1-plan.md §6):
 * - selection: no context attached;
 * - local: containing sentence + current paragraph (+ adjacent paragraphs
 *   per policy) + section title (per policy);
 * - semantic: everything from local plus title + abstract (per policy);
 * - adaptive: like local; title + abstract are attached iff the risk
 *   heuristic matches the selected text (full scorer in M2).
 *
 * Any extraction failure degrades silently to a selection-only context.
 */

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

export interface ContextOptions {
	level: ContextLevel;
	includeAbstract: boolean;
	includeTitle: boolean;
	includeSectionTitle: boolean;
	includeAdjacentParagraphs: boolean;
}

const LEVELS: ContextLevel[] = ["selection", "local", "semantic", "adaptive"];
const DEFAULT_LEVEL: ContextLevel = "local";

/** Read the context policy from preferences. */
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

/**
 * Assemble the context for a translation request. Never throws: all
 * provider failures degrade to fewer/empty context fields.
 */
export async function assembleContext(
	view: ViewLike | undefined,
	itemID: number | undefined,
	selectedText: string,
	opts: ContextOptions,
): Promise<TranslationContext> {
	const policy: ContextPolicy = {
		level: opts.level,
		includeAbstract: opts.includeAbstract,
		includeTitle: opts.includeTitle,
		includeSectionTitle: opts.includeSectionTitle,
		includeAdjacentParagraphs: opts.includeAdjacentParagraphs,
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
	if (!ranges.length) {
		return ctx;
	}

	// L1 - local context (sentence / paragraph / neighbors)
	const local = getLocalContextFromView(view, ranges, {
		includeAdjacentParagraphs: opts.includeAdjacentParagraphs,
		maxChars: DEFAULT_CONTEXT_BUDGET.localContextMaxChars,
	});
	if (
		local.containingSentence ||
		local.currentParagraph ||
		local.previousParagraph ||
		local.nextParagraph
	) {
		ctx.local = local;
	}

	// L2 - document-level summary (title / abstract), only for semantic and
	// risk-matched adaptive selections.
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

	// Section title - best effort for every non-selection level.
	if (opts.includeSectionTitle && ranges[0]) {
		const sectionTitle = await getSectionTitle(view, ranges[0].pageIndex);
		if (sectionTitle) {
			ctx.document ??= {};
			ctx.document.sectionTitle = sectionTitle;
		}
	}

	return ctx;
}
