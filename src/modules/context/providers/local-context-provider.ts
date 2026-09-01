/**
 * LocalContextProvider - sentence / paragraph extraction from the reader's
 * per-page character arrays (Zotero reader internals, see
 * ZCTr-context-M1-plan.md §2 and §6).
 *
 * `view._pdfPages[pageIndex].chars` is an array of char objects produced by
 * the modified pdf.js pipeline:
 *   { c, ignorable, spaceAfter, lineBreakAfter, paragraphBreakAfter }
 * and the selection ranges index directly into it. This module renders chars
 * back to text and finds sentence / paragraph boundaries around the
 * selection offsets. The pure core (`extractLocalContext`) is dependency-free
 * and unit-testable with synthetic char arrays.
 *
 * Rendering rules (differ from the reader's own getTextFromChars, which
 * collapses every break into a space - we keep newlines for prompt
 * readability): spaceAfter -> " ", lineBreakAfter (non-paragraph) -> "\n",
 * paragraphBreakAfter -> "\n\n".
 */

import type {ViewLike} from "../../../types/reader";
import type {SelectionOffsetRange} from "./selection-resolver";

export interface CharLike {
	c: string;
	ignorable?: boolean;
	spaceAfter?: boolean;
	lineBreakAfter?: boolean;
	paragraphBreakAfter?: boolean;
}

export interface LocalContextOptions {
	includeAdjacentParagraphs: boolean;
	/** Total character cap across all local fields (priority: sentence first). */
	maxChars: number;
}

export interface ExtractedLocalContext {
	containingSentence?: string;
	previousParagraph?: string;
	currentParagraph?: string;
	nextParagraph?: string;
}

/** Hard scan cap: never walk more chars than this when searching boundaries. */
const MAX_SCAN = 2000;

/** Common Latin abbreviations whose period must not end a sentence. */
const ABBREVIATION_RE =
	/^(e\.g\.|i\.e\.|etc\.|et al\.|figs?\.|cf\.|vs\.|al\.|approx\.|no\.|nos?\.|vols?\.|eds?\.|pp\.|p\.|eqs?\.|refs?\.|secs?\.|chaps?\.|dept\.|univ\.|inst\.)$/i;

/**
 * Dotted token around a period, e.g. "e.g." from either of its two dots.
 * Stops at spaces / break flags / non-letter chars, so "e.g." is collected
 * as a whole from the first dot too.
 */
function abbreviationTokenAt(chars: CharLike[], i: number): string {
	let token = "";
	for (let k = i; k >= 0; k--) {
		const p = chars[k];
		if (!p || p.ignorable || p.spaceAfter || p.lineBreakAfter || p.paragraphBreakAfter) {
			break;
		}
		if (!/[A-Za-z]/.test(p.c) && p.c !== ".") {
			break;
		}
		token = p.c + token;
	}
	for (let k = i + 1; k < chars.length; k++) {
		const p = chars[k];
		if (!p || p.ignorable || p.spaceAfter || p.lineBreakAfter || p.paragraphBreakAfter) {
			break;
		}
		if (!/[A-Za-z]/.test(p.c) && p.c !== ".") {
			break;
		}
		token += p.c;
	}
	return token;
}

/** Render chars[start..end) to text with the rules documented above. */
export function renderChars(chars: CharLike[], start: number, end: number): string {
	let out = "";
	for (let i = start; i < end && i < chars.length; i++) {
		const ch = chars[i];
		if (!ch || ch.ignorable) {
			continue;
		}
		out += ch.c;
		if (ch.spaceAfter && !ch.paragraphBreakAfter) {
			out += " ";
		}
		if (ch.lineBreakAfter && !ch.paragraphBreakAfter) {
			out += "\n";
		}
		if (ch.paragraphBreakAfter) {
			out += "\n\n";
		}
	}
	return out.trim();
}

function isSentenceEndChar(ch: CharLike | undefined, i: number, chars: CharLike[]): boolean {
	if (!ch || ch.ignorable) {
		return false;
	}
	const c = ch.c;
	if (c === "!" || c === "?") {
		return true;
	}
	if (c !== ".") {
		return false;
	}
	// Abbreviation guard: "e.g.", "Fig." etc. must not terminate the sentence.
	return !ABBREVIATION_RE.test(abbreviationTokenAt(chars, i));
}

/** First index >= from that ends the sentence (exclusive end = returned value). */
export function findSentenceEnd(chars: CharLike[], from: number): number {
	for (let i = from; i < chars.length && i - from < MAX_SCAN; i++) {
		if (chars[i]?.paragraphBreakAfter) {
			return i;
		}
		if (isSentenceEndChar(chars[i], i, chars)) {
			return i + 1;
		}
	}
	return Math.min(chars.length, from + MAX_SCAN);
}

/** Last sentence boundary at or before `from`; content start = returned value. */
export function findSentenceStart(chars: CharLike[], from: number): number {
	for (let i = from - 1; i >= 0 && from - i <= MAX_SCAN; i--) {
		if (chars[i]?.paragraphBreakAfter) {
			return i + 1;
		}
		if (isSentenceEndChar(chars[i], i, chars)) {
			return i + 1;
		}
	}
	return Math.max(0, from - MAX_SCAN);
}

/**
 * End of the paragraph containing `from` (exclusive). A char with
 * paragraphBreakAfter belongs to its paragraph (break follows it); a blank
 * line ends the paragraph before it.
 */
export function findParagraphEnd(chars: CharLike[], from: number): number {
	for (let i = from; i < chars.length && i - from < MAX_SCAN; i++) {
		if (chars[i].paragraphBreakAfter) {
			return i + 1;
		}
		if (chars[i].lineBreakAfter && chars[i - 1]?.lineBreakAfter) {
			return i;
		}
	}
	return Math.min(chars.length, from + MAX_SCAN);
}

/** Start of the paragraph containing `from`. */
export function findParagraphStart(chars: CharLike[], from: number): number {
	for (let i = from - 1; i >= 0 && from - i <= MAX_SCAN; i--) {
		if (chars[i].paragraphBreakAfter) {
			return i + 1;
		}
		if (chars[i].lineBreakAfter && chars[i - 1]?.lineBreakAfter) {
			return i + 1;
		}
	}
	return Math.max(0, from - MAX_SCAN);
}

/**
 * Extract the local context around a selection. `range.anchorOffset/headOffset`
 * are char indices into `chars`; the selection covers [min, max) (matching the
 * reader's getRange slicing semantics).
 */
export function extractLocalContext(
	chars: CharLike[],
	range: Pick<SelectionOffsetRange, "anchorOffset" | "headOffset">,
	opts: LocalContextOptions,
): ExtractedLocalContext {
	if (
		typeof range.anchorOffset !== "number" ||
		typeof range.headOffset !== "number"
	) {
		return {};
	}
	const len = chars.length;
	const selStart = Math.max(0, Math.min(range.anchorOffset, range.headOffset, len));
	const selEnd = Math.max(selStart, Math.min(Math.max(range.anchorOffset, range.headOffset), len));
	if (selEnd <= selStart) {
		return {};
	}

	const sentStart = findSentenceStart(chars, selStart);
	const paraStart = findParagraphStart(chars, selStart);
	const trueParaEnd = findParagraphEnd(chars, selEnd);
	// Anti-leak (v3.2): NOTHING after the selection end enters the local
	// context. Fragment selections (no trailing punctuation) would otherwise
	// drag the rest of the containing sentence - and via the paragraph,
	// further sentences - into the prompt: the exact material models leak
	// into their translation output. The containing sentence / current
	// paragraph therefore both end at the selection end.
	const contextEnd = selEnd;

	const fields: ExtractedLocalContext = {
		containingSentence: renderChars(chars, sentStart, contextEnd),
		currentParagraph: renderChars(chars, paraStart, contextEnd),
	};
	// Dedupe: when the selection sits in the paragraph's first sentence the
	// two fields are identical; keep the finer-grained label only.
	if (fields.currentParagraph === fields.containingSentence) {
		delete fields.currentParagraph;
	}

	if (opts.includeAdjacentParagraphs) {
		const prevStart = findParagraphStart(chars, paraStart - 1);
		if (prevStart < paraStart) {
			fields.previousParagraph = renderChars(chars, prevStart, paraStart);
		}
		// The next paragraph starts at the TRUE paragraph end - otherwise a
		// selection-clamped context end would turn the rest of the current
		// paragraph into "next paragraph" and reintroduce the leak material.
		// Note: the next paragraph is text AFTER the selection, so enabling
		// adjacent paragraphs remains an explicit opt-in leak risk.
		const nextStart = trueParaEnd;
		const nextEnd = findParagraphEnd(chars, trueParaEnd);
		if (nextEnd > nextStart) {
			fields.nextParagraph = renderChars(chars, nextStart, nextEnd);
		}
	}

	// Budget: sentence first, then current paragraph, then neighbors
	// (architecture §10 priority: Selected > Instruction > Local > Abstract).
	// Fields beyond the budget are dropped, not truncated.
	let remaining = opts.maxChars;
	for (const key of ["containingSentence", "currentParagraph", "previousParagraph", "nextParagraph"] as const) {
		const value = fields[key];
		if (!value) {
			continue;
		}
		if (remaining <= 0) {
			delete fields[key];
			continue;
		}
		if (value.length > remaining) {
			fields[key] = `${value.slice(0, remaining)}…`;
			remaining = 0;
		} else {
			remaining -= value.length;
		}
	}
	return fields;
}

/**
 * View wrapper: read the first selection page's chars and extract the local
 * context. Any failure silently degrades to an empty context (M1 policy:
 * extraction errors must never block translation). Multi-page selections use
 * the first page only (documented M1 simplification).
 */
export function getLocalContextFromView(
	view: ViewLike | undefined,
	ranges: SelectionOffsetRange[],
	opts: LocalContextOptions,
): ExtractedLocalContext {
	try {
		const pages = (view as any)?._pdfPages;
		if (!pages) {
			return {};
		}
		const range = ranges?.[0];
		if (!range || typeof range.pageIndex !== "number") {
			return {};
		}
		const chars = pages[range.pageIndex]?.chars;
		if (!Array.isArray(chars) || !chars.length) {
			return {};
		}
		if (typeof range.anchorOffset !== "number" || typeof range.headOffset !== "number") {
			// Old readers without char offsets: fall back to the selection text
			return {containingSentence: range.text};
		}
		return extractLocalContext(chars, range, opts);
	} catch (error) {
		ztoolkit.log("[ZCTr] Failed to extract local context:", error);
		return {};
	}
}
