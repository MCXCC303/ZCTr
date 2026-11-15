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
	maxChars: number;
}

export interface ExtractedLocalContext {
	containingSentence?: string;
	previousParagraph?: string;
	currentParagraph?: string;
	nextParagraph?: string;
}

/** Hard cap on chars walked when searching boundaries. */
const MAX_SCAN = 2000;

const ABBREVIATION_RE =
	/^(e\.g\.|i\.e\.|etc\.|et al\.|figs?\.|cf\.|vs\.|al\.|approx\.|no\.|nos?\.|vols?\.|eds?\.|pp\.|p\.|eqs?\.|refs?\.|secs?\.|chaps?\.|dept\.|univ\.|inst\.)$/i;

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
	const prev = prevNonIgnorable(chars, i - 1);
	const next = nextNonIgnorable(chars, i + 1);
	if (prev && next && /\d/.test(prev.c) && /\d/.test(next.c)) {
		return false;
	}
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

export function normalizeWhitespace(text: string): string {
	return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

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
		if (/\s/.test(ch.c)) {
			pendingSpace = true;
			continue;
		}
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
			if (normalizeWhitespace(renderChars(chars, hit.start, hit.end)) === needle) {
				return hit;
			}
		}
	}
	return null;
}

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
			sepOk = flagsWs;
		}
		i++;
	}
	return null;
}

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

export type SelectionInconsistencyHandler = (
	kind: "relocated" | "degraded",
	detail: {rendered: string; expected: string},
) => void;

export function computeLocalFields(
	chars: CharLike[],
	selStart: number,
	selEnd: number,
	opts: LocalContextOptions,
): ExtractedLocalContext {
	const sentStart = findSentenceStart(chars, selStart);
	const paraStart = findParagraphStart(chars, selStart);
	const trueParaEnd = findParagraphEnd(chars, selEnd);
	const contextEnd = selEnd;

	const fields: ExtractedLocalContext = {
		containingSentence: renderChars(chars, sentStart, contextEnd),
		currentParagraph: renderChars(chars, paraStart, contextEnd),
	};
	if (fields.currentParagraph === fields.containingSentence) {
		delete fields.currentParagraph;
	}

	if (opts.includeAdjacentParagraphs) {
		const prevStart = findParagraphStart(chars, paraStart - 1);
		if (prevStart < paraStart) {
			fields.previousParagraph = renderChars(chars, prevStart, paraStart);
		}
		const nextStart = trueParaEnd;
		const nextEnd = findParagraphEnd(chars, trueParaEnd);
		if (nextEnd > nextStart) {
			fields.nextParagraph = renderChars(chars, nextStart, nextEnd);
		}
	}

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

/** `anchorOffset`/`headOffset` are char indices into `chars`; selection is [min, max). */
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
				const text = (selectedText || range.text || "").trim();
				return text ? {containingSentence: text} : {};
			}
			return extractLocalContext(chars, range, opts, selectedText, (kind, detail) => {
				zlog.warn(`Selection offsets differ from the selected text (${kind}): rendered="${detail.rendered.slice(0, 60)}" expected="${detail.expected.slice(0, 60)}"`);
			});
		}
		if (selectedText && selectedText.trim()) {
			return localContextBySearch(pages, selectedText, opts);
		}
		return {};
	} catch (error) {
		zlog.warn("Failed to extract local context:", error);
		return {};
	}
}

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
	zlog.info(`Fallback location scan started: pages=${pageIndexes.length} needle="${needle.slice(0, 40)}"`);
	const firstWord = needle.split(/\s+/)[0] ?? "";
	let firstWordHits = 0;
	for (const pageIndex of pageIndexes) {
		const chars = pages[pageIndex]?.chars;
		if (!Array.isArray(chars) || !chars.length) {
			continue;
		}
		const located = locateSelectionText(chars, needle, 0);
		if (located) {
			zlog.info(`Selection fallback located: page=${pageIndex} range=[${located.start}, ${located.end})`);
			return computeLocalFields(chars, located.start, located.end, opts);
		}
		const pageText = normalizePage(chars).text;
		if (firstWord && pageText.includes(normalizeWhitespace(firstWord))) {
			firstWordHits++;
			const wordIdx = pageText.indexOf(normalizeWhitespace(firstWord));
			const window = pageText.slice(Math.max(0, wordIdx - 120), wordIdx + 200);
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
			// JSON.stringify escapes hidden chars (NBSP, soft hyphens) so they show in logs.
			zlog.info(`Fallback location - first word matched but phrase did not: page=${pageIndex} needle=${JSON.stringify(needle)} window=${JSON.stringify(window)} raw=[${rawDump}]`);
		}
	}
	zlog.warn(`Fallback location failed: pages=${pageIndexes.length} firstWordHits=${firstWordHits}`);
	return {};
}
