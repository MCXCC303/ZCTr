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
import * as zlog from "../../../utils/logger";

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
	// Decimal points (e.g. "87.28%", "0.01") must not end the sentence.
	const prev = prevNonIgnorable(chars, i - 1);
	const next = nextNonIgnorable(chars, i + 1);
	if (prev && next && /\d/.test(prev.c) && /\d/.test(next.c)) {
		return false;
	}
	// Abbreviation guard: "e.g.", "Fig." etc. must not terminate the sentence.
	return !ABBREVIATION_RE.test(abbreviationTokenAt(chars, i));
}

function prevNonIgnorable(chars: CharLike[], from: number): CharLike | undefined {
	for (let i = from; i >= 0; i--) {
		const ch = chars[i];
		if (ch && !ch.ignorable) {
			return ch;
		}
	}
	return undefined;
}

function nextNonIgnorable(chars: CharLike[], from: number): CharLike | undefined {
	for (let i = from; i < chars.length; i++) {
		const ch = chars[i];
		if (ch && !ch.ignorable) {
			return ch;
		}
	}
	return undefined;
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

/** Fold all whitespace (incl. line breaks) to single spaces, NFC, trim. */
export function normalizeWhitespace(text: string): string {
	return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Normalized page text with source char index mapping: ignorables skipped,
 * whitespace runs folded to a single space token mapped to the char that
 * FOLLOWS the run (so an exclusive end at a space lands on the next word). */
interface NormalizedPage {
	text: string;
	src: number[];
}

function normalizePage(chars: CharLike[]): NormalizedPage {
	let text = "";
	const src: number[] = [];
	let pendingSpace = false;
	for (let i = 0; i < chars.length; i++) {
		const ch = chars[i];
		if (!ch || ch.ignorable) {
			continue;
		}
		// A literal whitespace char only sets the pending flag - it must NOT
		// emit a token itself, otherwise spaceAfter+literal-space layouts
		// double every word gap ("synthesis  path").
		if (/\s/.test(ch.c)) {
			pendingSpace = true;
			continue;
		}
		// A pending whitespace run becomes ONE space token mapped to the
		// char that follows it (exclusive end at the space lands on the next
		// word).
		if (pendingSpace) {
			text += " ";
			src.push(i);
			pendingSpace = false;
		}
		text += ch.c;
		src.push(i);
		if (ch.spaceAfter || ch.lineBreakAfter || ch.paragraphBreakAfter) {
			pendingSpace = true;
		}
	}
	return {text, src};
}

/**
 * Locate the exact [start, end) char range of `text` in `chars`, preferring
 * the occurrence nearest to `from`. Coordinate-system independent: it only
 * relies on the text itself, so broken/overshooting selection offsets cannot
 * influence the result. Null when the text cannot be found.
 *
 * MATCHING STRATEGY: raw char-level state machine (no index mapping). The
 * PDF char models that Zotero emits cannot be trusted to translate a
 * whitespace-normalized index into a source index (we observed a +3 shift:
 * whitespace tokens alias onto next/previous source chars inconsistently
 * across layouts), so the needle is matched directly against the char
 * sequence with ignorables skipped and whitespace (literal chars OR
 * spaceAfter/lineBreakAfter/paragraphBreakAfter flags) folded.
 */
export function locateSelectionText(
	chars: CharLike[],
	text: string,
	from: number,
): {start: number; end: number} | null {
	const needle = normalizeWhitespace(text);
	if (!needle) {
		return null;
	}
	const atoms = needle.split(" ");
	const starts = [Math.max(0, from - 40), 0];
	for (const s of starts) {
		const hit = matchAtomsAt(chars, s, atoms);
		if (hit) {
			// Final render-level assertion: whatever the matcher found MUST
			// render to exactly the needle (defense in depth).
			if (normalizeWhitespace(renderChars(chars, hit.start, hit.end)) === needle) {
				return hit;
			}
		}
	}
	return null;
}

/**
 * Scan raw chars from `start` forward; at every word-boundary position that
 * starts the needle, attempt a full atom match. RESUMES on failure (a failed
 * phrase start must not abort the scan - that is what made the normalized
 * page text show the phrase while the match reported it missing).
 */
function matchAtomsAt(
	chars: CharLike[],
	start: number,
	atoms: string[],
): {start: number; end: number} | null {
	let i = start;
	while (i < chars.length) {
		const ch = chars[i];
		if (!ch || ch.ignorable) {
			i++;
			continue;
		}
		if (ch.c === atoms[0][0] && isWordBoundaryBefore(chars, i)) {
			const hit = matchAtomsFrom(chars, i, atoms);
			if (hit) {
				return hit;
			}
		}
		i++;
	}
	return null;
}

/**
 * One attempt: match the atoms starting EXACTLY at raw index `i0`.
 * Whitespace between atoms may be literal whitespace chars and/or the break
 * flags on the previous atom's last character. Returns the raw [start, end)
 * of the match; null when this start fails.
 */
function matchAtomsFrom(
	chars: CharLike[],
	i0: number,
	atoms: string[],
): {start: number; end: number} | null {
	let i = i0;
	let ai = 0;
	let ci = 0;
	let matchedStart = i0;
	let needSep = false;
	let sepOk = false;
	while (i < chars.length) {
		const ch = chars[i];
		if (!ch || ch.ignorable) {
			i++;
			continue;
		}
		const flagsWs = !!(ch.spaceAfter || ch.lineBreakAfter || ch.paragraphBreakAfter);
		if (/\s/.test(ch.c)) {
			if (needSep) {
				sepOk = true;
			}
			i++;
			continue;
		}
		if (needSep) {
			if (!sepOk) {
				return null;
			}
			needSep = false;
			sepOk = false;
		}
		if (ch.c !== atoms[ai][ci]) {
			return null;
		}
		ci++;
		if (ci >= atoms[ai].length) {
			if (ai === atoms.length - 1) {
				return {start: matchedStart, end: i + 1};
			}
			ai++;
			ci = 0;
			needSep = true;
			// The separator MAY be implied by this char's own break flags.
			sepOk = flagsWs;
		}
		i++;
	}
	return null;
}

/** True when the char before raw index `i` ends a word (or `i` is at 0). */
function isWordBoundaryBefore(chars: CharLike[], i: number): boolean {
	for (let k = i - 1; k >= 0; k--) {
		const ch = chars[k];
		if (!ch || ch.ignorable) {
			continue;
		}
		return !!(
			/\s/.test(ch.c) ||
			ch.spaceAfter ||
			ch.lineBreakAfter ||
			ch.paragraphBreakAfter
		);
	}
	return true;
}

/** Diagnostics callback for selection/offset inconsistencies (pure core). */
export type SelectionInconsistencyHandler = (
	kind: "relocated" | "degraded",
	detail: {rendered: string; expected: string},
) => void;

/**
 * Build the local-context FIELDS for an explicit character range (sentence /
 * paragraph prefixed at the selection, clamped at the selection end). Shared
 * by the offset-based path and the text-search fallback so both produce
 * byte-identical fields.
 */
export function computeLocalFields(
	chars: CharLike[],
	selStart: number,
	selEnd: number,
	opts: LocalContextOptions,
): ExtractedLocalContext {
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
 * Extract the local context around a selection. `range.anchorOffset/headOffset`
 * are char indices into `chars`; the selection covers [min, max) (matching the
 * reader's getRange slicing semantics). `selectedText` is the AUTHORITATIVE
 * selected text (what the popup is translating); when provided it (not
 * range.text) is the consistency baseline.
 */
export function extractLocalContext(
	chars: CharLike[],
	range: Pick<SelectionOffsetRange, "anchorOffset" | "headOffset" | "text">,
	opts: LocalContextOptions,
	selectedText?: string,
	onInconsistency?: SelectionInconsistencyHandler,
): ExtractedLocalContext {
	if (
		typeof range.anchorOffset !== "number" ||
		typeof range.headOffset !== "number"
	) {
		return {};
	}
	const len = chars.length;
	let selStart = Math.max(0, Math.min(range.anchorOffset, range.headOffset, len));
	let selEnd = Math.max(selStart, Math.min(Math.max(range.anchorOffset, range.headOffset), len));
	if (selEnd <= selStart) {
		return {};
	}

	// Self-consistency: the offsets must describe exactly the text being
	// translated. Zotero 10 beta's selection restore path can leave the
	// logical range (and its own range.text) describing MORE than the actual
	// selection (e.g. a whole sentence), which dragged post-selection
	// material into the local context - the leak the clamp prevents, and the
	// reason the cache key differed between "selected" and "highlighted"
	// workflows. The baseline is the AUTHORITATIVE popup text (never the
	// reader's own range.text, which shares the reader's mistake).
	const authority =
		selectedText && selectedText.trim()
			? selectedText.trim()
			: typeof range.text === "string"
				? range.text.trim()
				: "";
	if (authority) {
		const rendered = normalizeWhitespace(renderChars(chars, selStart, selEnd));
		const expected = normalizeWhitespace(authority);
		if (rendered !== expected) {
			const located = locateSelectionText(chars, authority, selStart);
			if (located) {
				selStart = Math.max(0, Math.min(located.start, len));
				selEnd = Math.max(selStart + 1, Math.min(located.end, len));
				onInconsistency?.("relocated", {rendered, expected});
			} else {
				onInconsistency?.("degraded", {rendered, expected});
				return {containingSentence: authority};
			}
		}
	}

	return computeLocalFields(chars, selStart, selEnd, opts);
}

/**
 * View wrapper: read the first selection page's chars and extract the local
 * context. Any failure silently degrades to an empty context (M1 policy:
 * extraction errors must never block translation). Multi-page selections use
 * the first page only (documented M1 simplification).
 *
 * `selectedText` is the AUTHORITATIVE selection text (what the popup
 * translates). When the reader's logical selection ranges are unavailable or
 * inconsistent (Zotero 10 beta clears them in the annotation flow), the
 * selection is re-located by TEXT across the page chars - making the local
 * context a pure function of (page text + selected text), so the cache key no
 * longer depends on reader selection state.
 */
export function getLocalContextFromView(
	view: ViewLike | undefined,
	ranges: SelectionOffsetRange[],
	opts: LocalContextOptions,
	selectedText?: string,
): ExtractedLocalContext {
	try {
		const pages = (view as any)?._pdfPages;
		if (!pages) {
			return {};
		}
		const range = ranges?.[0];
		const chars = range && typeof range.pageIndex === "number"
			? pages[range.pageIndex]?.chars
			: undefined;
		if (Array.isArray(chars) && chars.length) {
			if (typeof range.anchorOffset !== "number" || typeof range.headOffset !== "number") {
				// Old readers without char offsets: fall back to the selection text
				const text = (selectedText || range.text || "").trim();
				return text ? {containingSentence: text} : {};
			}
			return extractLocalContext(chars, range, opts, selectedText, (kind, detail) => {
				zlog.warn(`选区偏移与选中文本不一致（${kind}）: rendered="${detail.rendered.slice(0, 60)}" expected="${detail.expected.slice(0, 60)}"`);
			});
		}
		// No usable selection ranges (annotation flow): locate by text so the
		// context stays deterministic across reader states.
		if (selectedText && selectedText.trim()) {
			return localContextBySearch(pages, selectedText, opts);
		}
		return {};
	} catch (error) {
		zlog.warn("Failed to extract local context:", error);
		return {};
	}
}

/** Locate `selectedText` in the page grid (first page containing it wins)
 * and build the same clamped local context fields. */
function localContextBySearch(
	pages: any,
	selectedText: string,
	opts: LocalContextOptions,
): ExtractedLocalContext {
	const needle = selectedText.trim();
	if (!needle) {
		return {};
	}
	const pageIndexes = Object.keys(pages)
		.map((k) => Number(k))
		.filter((n) => Number.isInteger(n))
		.sort((a, b) => a - b);
	zlog.info(`回退定位扫描开始: pages=${pageIndexes.length} needle="${needle.slice(0, 40)}"`);
	const firstWord = needle.split(/\s+/)[0] ?? "";
	let firstWordHits = 0;
	for (const pageIndex of pageIndexes) {
		const chars = pages[pageIndex]?.chars;
		if (!Array.isArray(chars) || !chars.length) {
			continue;
		}
		const located = locateSelectionText(chars, needle, 0);
		if (located) {
			zlog.info(`选区回退定位: page=${pageIndex} range=[${located.start}, ${located.end})`);
			return computeLocalFields(chars, located.start, located.end, opts);
		}
		// Diagnostic: is the first word present but the phrase not matchable?
		const pageText = normalizePage(chars).text;
		if (firstWord && pageText.includes(normalizeWhitespace(firstWord))) {
			firstWordHits++;
			const wordIdx = pageText.indexOf(normalizeWhitespace(firstWord));
			const window = pageText.slice(Math.max(0, wordIdx - 120), wordIdx + 200);
			// Raw chars around the first word (flags included) - the only
			// reliable ground truth for why the phrase match failed.
			const wordHit = matchAtomsAt(chars, 0, [normalizeWhitespace(firstWord)]);
			const rawFrom = wordHit ? Math.max(0, wordHit.start - 16) : Math.max(0, wordIdx - 16);
			const rawLen = wordHit ? wordHit.end - rawFrom + 48 : 140;
			const rawDump = chars
				.slice(rawFrom, Math.min(chars.length, rawFrom + rawLen))
				.map((ch) =>
					ch
						? JSON.stringify({c: ch.c, ig: !!ch.ignorable, sa: !!ch.spaceAfter, lb: !!ch.lineBreakAfter, pb: !!ch.paragraphBreakAfter})
						: "null",
				)
				.join(",");
			// JSON.stringify exposes hidden chars (NBSP, soft hyphens, etc.).
			zlog.info(`回退定位-首词命中但短语未匹配: page=${pageIndex} needle=${JSON.stringify(needle)} window=${JSON.stringify(window)} raw=[${rawDump}]`);
		}
	}
	zlog.warn(`回退定位失败: pages=${pageIndexes.length} firstWordHits=${firstWordHits}`);
	return {};
}
