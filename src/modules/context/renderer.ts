/**
 * ContextRenderer - formats an attached TranslationContext into the
 * [DOCUMENT] / [LOCAL CONTEXT] prompt blocks (ZCTr-context-ARCHITECTURE.md
 * §13). Returns "" when nothing is attached - the caller then falls back to
 * the plain selection-only user message.
 */

import type {TranslationContext} from "./context";

export function formatContextBlocks(ctx: TranslationContext): string {
	const blocks: string[] = [];
	const doc = ctx.document;
	if (doc) {
		const lines: string[] = ["[DOCUMENT]"];
		if (doc.title) {
			lines.push(`Title: ${doc.title}`);
		}
		if (doc.sectionTitle) {
			lines.push(`Section: ${doc.sectionTitle}`);
		}
		if (doc.abstract) {
			lines.push(`Abstract: ${doc.abstract}`);
		}
		blocks.push(lines.join("\n"));
	}
	const local = ctx.local;
	if (local) {
		const lines: string[] = ["[LOCAL CONTEXT]"];
		if (local.previousParagraph) {
			lines.push(`Previous paragraph:\n${local.previousParagraph}`);
		}
		if (local.currentParagraph) {
			lines.push(`Current paragraph:\n${local.currentParagraph}`);
		}
		if (local.nextParagraph) {
			lines.push(`Next paragraph:\n${local.nextParagraph}`);
		}
		if (local.containingSentence) {
			lines.push(`Containing sentence:\n${local.containingSentence}`);
		}
		blocks.push(lines.join("\n\n"));
	}
	return blocks.join("\n\n");
}
