import {
	TERMBASE_SCHEMA_VERSION,
	type ConceptEntry,
	type Term,
	type Termbase,
	type TermStatus,
} from "./model";

const STATUSES: TermStatus[] = ["preferred", "admitted", "forbidden", "deprecated"];

function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function decodeXml(text: string): string {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&");
}

function tigXml(term: Term, isVariant: boolean): string {
	const lines = ["<tig>", `  <term>${escapeXml(term.text)}</term>`];
	lines.push(
		isVariant
			? `  <termNote type="termVariant">${escapeXml(term.text)}</termNote>`
			: `  <termNote type="termStatus">${term.status}</termNote>`,
	);
	lines.push("</tig>");
	return lines.join("\n");
}

export function toTbx(termbase: Termbase): string {
	const entries = termbase.entries
		.map((entry) => {
			const languages = new Map<string, Term[]>();
			for (const term of entry.terms) {
				const list = languages.get(term.language) ?? [];
				list.push(term);
				languages.set(term.language, list);
			}
			const langSets = [...languages.entries()]
				.map(([lang, terms]) => {
					const primary = terms[0];
					const variants = (primary.variants ?? [])
						.map((v) => tigXml({...primary, text: v}, true))
						.join("\n");
					return [
						`<langSet xml:lang="${escapeXml(lang)}">`,
						tigXml(primary, false),
						variants ? `\n${variants}` : "",
						"</langSet>",
					].join("\n");
				})
				.join("\n");
			return [
				`<termEntry id="${escapeXml(entry.conceptId)}">`,
				langSets,
				"</termEntry>",
			].join("\n");
		})
		.join("\n");

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<!DOCTYPE martif PUBLIC "ISO 12200:1999//DTD MARTIF core//EN" "TBXcore.dtd">',
		`<martif type="TBX" xml:lang="${escapeXml(termbase.sourceLanguage)}">`,
		"  <martifHeader>",
		"    <fileDesc>",
		`      <title>${escapeXml(termbase.name)}</title>`,
		"      <sourceDesc><p>ZCTr termbase export</p></sourceDesc>",
		"    </fileDesc>",
		"  </martifHeader>",
		"  <text>",
		"    <body>",
		entries,
		"    </body>",
		"  </text>",
		"</martif>",
	].join("\n");
}

interface ParsedTig {
	text: string;
	status: TermStatus;
	isVariant: boolean;
}

function parseTigs(block: string): ParsedTig[] {
	const tigs: ParsedTig[] = [];
	const tigRe = /<tig[^>]*>([\s\S]*?)<\/tig>/g;
	let match: RegExpExecArray | null;
	while ((match = tigRe.exec(block)) !== null) {
		const body = match[1];
		const termMatch = /<term[^>]*>([\s\S]*?)<\/term>/.exec(body);
		if (!termMatch) {
			continue;
		}
		const statusMatch =
			/<termNote[^>]*type="termStatus"[^>]*>([\s\S]*?)<\/termNote>/.exec(body);
		const variantMatch =
			/<termNote[^>]*type="termVariant"[^>]*>([\s\S]*?)<\/termNote>/.exec(body);
		const rawStatus = statusMatch?.[1]?.trim().toLowerCase() ?? "";
		tigs.push({
			text: decodeXml(termMatch[1].trim()),
			status: (STATUSES as string[]).includes(rawStatus)
				? (rawStatus as TermStatus)
				: "preferred",
			isVariant: !!variantMatch,
		});
	}
	return tigs;
}

/** `meta` supplies the termbase identity and language pair; TBX has no pair concept. */
export function parseTbx(
	xml: string,
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
	let fallbackConcept = 0;
	const entryRe = /<termEntry[^>]*>([\s\S]*?)<\/termEntry>/g;
	let match: RegExpExecArray | null;
	while ((match = entryRe.exec(xml)) !== null) {
		const entryBlock = match[1];
		const idMatch = /<termEntry[^>]*\bid="([^"]+)"/.exec(match[0]);
		const conceptId = idMatch?.[1] ?? `c-${String(++fallbackConcept).padStart(6, "0")}`;
		const terms: Term[] = [];
		const langSetRe = /<langSet[^>]*xml:lang="([^"]+)"[^>]*>([\s\S]*?)<\/langSet>/g;
		let langMatch: RegExpExecArray | null;
		while ((langMatch = langSetRe.exec(entryBlock)) !== null) {
			const lang = decodeXml(langMatch[1].trim());
			const primary: ParsedTig[] = [];
			const variants: string[] = [];
			for (const tig of parseTigs(langMatch[2])) {
				if (tig.isVariant) {
					variants.push(tig.text);
				} else {
					primary.push(tig);
				}
			}
			// The model requires ≥1 term in each language of the pair; primaries come first.
			for (let i = 0; i < primary.length; i++) {
				const t = primary[i];
				terms.push({
					termId: `${conceptId}-${lang}${i > 0 ? `-${i + 1}` : ""}`,
					language: lang,
					text: t.text,
					status: t.status,
					...(variants.length ? {variants} : {}),
				});
			}
		}
		if (!terms.length) {
			continue;
		}
		entries.push({
			conceptId,
			terms,
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
