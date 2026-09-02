/**
 * Termbase import / export (architecture §11, P2 plan §3.1).
 *
 * Minimum formats: TSV, CSV, JSON. One TSV/CSV row = one concept with a
 * source term and a target term. Optional extra columns: status, note
 * (TSV/CSV are intentionally lossy - variants/definitions/scopes survive
 * only in the JSON format; the mapping is documented, not TBX).
 *
 * All functions are pure and unit-testable.
 */

import {
	TERMBASE_SCHEMA_VERSION,
	type ConceptEntry,
	type Term,
	type Termbase,
	type TermStatus,
} from "./model";

export interface ParsedRow {
	source: string;
	target: string;
	status?: TermStatus;
	note?: string;
}

const STATUSES: TermStatus[] = ["preferred", "admitted", "forbidden", "deprecated"];

function parseStatus(raw: string | undefined): TermStatus | undefined {
	if (!raw) {
		return undefined;
	}
	const s = raw.trim().toLowerCase() as TermStatus;
	return STATUSES.includes(s) ? s : undefined;
}

// ---------------------------------------------------------------------------
// TSV
// ---------------------------------------------------------------------------

/** Parse tab-separated rows: source \t target [\t status [\t note]]. */
export function parseTsv(text: string): ParsedRow[] {
	const rows: ParsedRow[] = [];
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		const cols = trimmed.split("\t");
		const source = (cols[0] ?? "").trim();
		const target = (cols[1] ?? "").trim();
		if (!source || !target) {
			continue;
		}
		rows.push({
			source,
			target,
			status: parseStatus(cols[2]),
			note: cols[3]?.trim() || undefined,
		});
	}
	return rows;
}

/** Serialize a termbase to TSV (one row per source/target term pair). */
export function toTsv(termbase: Termbase): string {
	const lines: string[] = [];
	for (const entry of termbase.entries) {
		const sources = entry.terms.filter((t) => t.language === termbase.sourceLanguage);
		const targets = entry.terms.filter((t) => t.language === termbase.targetLanguage);
		for (const source of sources) {
			for (const target of targets) {
				lines.push(
					[source.text, target.text, source.status, entry.notes?.[0] ?? ""]
						.join("\t")
						.replace(/\t+$/, ""),
				);
			}
		}
	}
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Minimal CSV parser: quoted fields with escaped double quotes, comma sep. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ",") {
			row.push(field.trim());
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") {
				i++;
			}
			row.push(field.trim());
			if (row.some((f) => f !== "")) {
				rows.push(row);
			}
			row = [];
			field = "";
		} else {
			field += c;
		}
	}
	row.push(field.trim());
	if (row.some((f) => f !== "")) {
		rows.push(row);
	}
	return rows;
}

/** Parse CSV rows in the same 2-4 column shape as TSV. */
export function parseCsvRows(text: string): ParsedRow[] {
	const rows: ParsedRow[] = [];
	for (const cols of parseCsv(text)) {
		const source = (cols[0] ?? "").trim();
		const target = (cols[1] ?? "").trim();
		if (!source || !target) {
			continue;
		}
		rows.push({
			source,
			target,
			status: parseStatus(cols[2]),
			note: cols[3]?.trim() || undefined,
		});
	}
	return rows;
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

/** Parse a termbase JSON document (unknown fields ignored, forward-compat). */
export function parseTermbaseJson(text: string): Termbase {
	const raw = JSON.parse(text) as Partial<Termbase>;
	return {
		termbaseId: String(raw.termbaseId ?? ""),
		name: String(raw.name ?? ""),
		description:
			typeof raw.description === "string" ? raw.description : undefined,
		sourceLanguage: String(raw.sourceLanguage ?? ""),
		targetLanguage: String(raw.targetLanguage ?? ""),
		entries: Array.isArray(raw.entries) ? raw.entries : [],
		createdAt: Number(raw.createdAt ?? Date.now()),
		updatedAt: Number(raw.updatedAt ?? Date.now()),
		schemaVersion: Number(raw.schemaVersion ?? TERMBASE_SCHEMA_VERSION),
	};
}

export function toJson(termbase: Termbase, pretty = true): string {
	return JSON.stringify(termbase, null, pretty ? "\t" : undefined);
}

// ---------------------------------------------------------------------------
// Row -> termbase
// ---------------------------------------------------------------------------

/**
 * Delimiter auto-detection for plain-text termbase files: tabs win when the
 * text parses as TSV, otherwise fall back to CSV. Used for .txt imports and
 * as a safety net for mislabeled .tsv/.csv files.
 */
export function parseDelimited(text: string): ParsedRow[] {
	const tsv = parseTsv(text);
	if (tsv.length) {
		return tsv;
	}
	return parseCsvRows(text);
}

let rowConceptCounter = 0;

/** Zero-padded concept ids so lexicographic order == creation order. */
function nextConceptId(): string {
	return `c-${String(++rowConceptCounter).padStart(6, "0")}`;
}

/**
 * Build a termbase from parsed rows: each row becomes one concept with a
 * source term and a target term. Rows with the same (source, target) pair
 * are deduplicated; identical source text with different targets becomes
 * separate concepts (each is a distinct concept to the model).
 */
export function termbaseFromRows(
	rows: ParsedRow[],
	meta: {
		termbaseId: string;
		name: string;
		description?: string;
		sourceLanguage: string;
		targetLanguage: string;
	},
): Termbase {
	const now = Date.now();
	const entries: ConceptEntry[] = [];
	const seen = new Set<string>();

	for (const row of rows) {
		const key = `${row.source}\u0000${row.target}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		const conceptId = nextConceptId();
		const status = row.status ?? "preferred";
		const makeTerm = (id: string, language: string, text: string): Term => ({
			termId: id,
			language,
			text,
			status,
			...(row.note ? {note: row.note} : {}),
		});
		entries.push({
			conceptId,
			terms: [
				makeTerm(`t-${conceptId}-src`, meta.sourceLanguage, row.source),
				makeTerm(`t-${conceptId}-tgt`, meta.targetLanguage, row.target),
			],
			...(row.note ? {notes: [row.note]} : {}),
			createdAt: now,
			updatedAt: now,
			schemaVersion: TERMBASE_SCHEMA_VERSION,
		});
	}

	return {
		termbaseId: meta.termbaseId,
		name: meta.name,
		...(meta.description ? {description: meta.description} : {}),
		sourceLanguage: meta.sourceLanguage,
		targetLanguage: meta.targetLanguage,
		entries,
		createdAt: now,
		updatedAt: now,
		schemaVersion: TERMBASE_SCHEMA_VERSION,
	};
}
