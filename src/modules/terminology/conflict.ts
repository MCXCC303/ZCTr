import {
	DEFAULT_MAX_MATCHED_TERMS,
	type MatchedTerm,
	type MatchedTermSet,
	type TermStatus,
} from "./model";
import type {TermOccurrence} from "./matcher";

const STATUS_RANK: Record<TermStatus, number> = {
	forbidden: 3,
	preferred: 2,
	admitted: 1,
	deprecated: 0,
};

const SCOPE_TYPE = "termbase" as const;

export function resolveConflicts(
	occurrences: TermOccurrence[],
	termbaseId: string,
	opts: {maxTerms?: number} = {},
): MatchedTermSet {
	const maxTerms = opts.maxTerms ?? DEFAULT_MAX_MATCHED_TERMS;

	// 1. Overlap resolution: greedy longest-first, ties by status, recency, termId.
	const ranked = occurrences
		.slice()
		.sort((a, b) => {
			if (a.start !== b.start) {
				return a.start - b.start;
			}
			const lenA = a.end - a.start;
			const lenB = b.end - b.start;
			if (lenA !== lenB) {
				return lenB - lenA;
			}
			const statusDiff =
				STATUS_RANK[b.sourceTerm.status] - STATUS_RANK[a.sourceTerm.status];
			if (statusDiff !== 0) {
				return statusDiff;
			}
			const recencyDiff =
				(b.concept.updatedAt ?? 0) - (a.concept.updatedAt ?? 0);
			if (recencyDiff !== 0) {
				return recencyDiff;
			}
			return a.sourceTerm.termId.localeCompare(b.sourceTerm.termId);
		});

	const winners: TermOccurrence[] = [];
	for (const occ of ranked) {
		const overlaps = winners.some(
			(w) => occ.start < w.end && w.start < occ.end,
		);
		if (!overlaps) {
			winners.push(occ);
		}
	}

	// 2. Dedupe per concept: keep the first (already best-ranked) occurrence.
	const byConcept = new Map<string, TermOccurrence>();
	for (const occ of winners) {
		if (!byConcept.has(occ.concept.conceptId)) {
			byConcept.set(occ.concept.conceptId, occ);
		}
	}

	// 3. Cap: truncation priority forbidden > preferred > admitted > deprecated.
	const capped = [...byConcept.values()]
		.sort((a, b) => {
			const statusDiff =
				STATUS_RANK[b.sourceTerm.status] - STATUS_RANK[a.sourceTerm.status];
			if (statusDiff !== 0) {
				return statusDiff;
			}
			return a.concept.conceptId.localeCompare(b.concept.conceptId);
		})
		.slice(0, maxTerms);

	const matched: MatchedTerm[] = capped.map((occ) => ({
		conceptId: occ.concept.conceptId,
		sourceText: occ.sourceTerm.text,
		targetText: occ.targetTerm?.text,
		status: occ.sourceTerm.status,
		scopeType: SCOPE_TYPE,
		scopeId: termbaseId,
		start: occ.start,
		end: occ.end,
	}));

	return {
		termbaseIds: [termbaseId],
		schemaVersion: 1,
		matched,
	};
}

export function mergeMatchedSets(
	sets: MatchedTermSet[],
	opts: {maxTerms?: number} = {},
): MatchedTermSet {
	const maxTerms = opts.maxTerms ?? DEFAULT_MAX_MATCHED_TERMS;
	const all = sets.flatMap((s) => s.matched);

	const withSpan = all.filter((m) => typeof m.start === "number" && typeof m.end === "number");
	const withoutSpan = all.filter((m) => !(typeof m.start === "number" && typeof m.end === "number"));
	const ranked = withSpan
		.slice()
		.sort((a, b) => {
			const lenA = (a.end ?? 0) - (a.start ?? 0);
			const lenB = (b.end ?? 0) - (b.start ?? 0);
			if (lenA !== lenB) {
				return lenB - lenA;
			}
			const statusDiff =
				STATUS_RANK[b.status] - STATUS_RANK[a.status];
			if (statusDiff !== 0) {
				return statusDiff;
			}
			if (a.scopeId !== b.scopeId) {
				return a.scopeId.localeCompare(b.scopeId);
			}
			return a.conceptId.localeCompare(b.conceptId);
		});
	const winners: MatchedTerm[] = [];
	for (const m of ranked) {
		const overlaps = winners.some(
			(w) =>
				(m.start ?? 0) < (w.end ?? 0) &&
				(w.start ?? 0) < (m.end ?? 0) &&
				m.conceptId !== w.conceptId,
		);
		if (!overlaps) {
			winners.push(m);
		}
	}

	const order: TermStatus[] = ["forbidden", "preferred", "admitted", "deprecated"];
	const seen = new Set<string>();
	const deduped: MatchedTerm[] = [];
	for (const status of order) {
		for (const m of [...winners, ...withoutSpan]) {
			if (m.status !== status) {
				continue;
			}
			const key = `${m.conceptId}\u0000${m.scopeId}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			deduped.push(m);
			if (deduped.length >= maxTerms) {
				break;
			}
		}
		if (deduped.length >= maxTerms) {
			break;
		}
	}
	return {
		// Only the termbases that contributed to the final set (cache fingerprint).
		termbaseIds: [...new Set(deduped.map((m) => m.scopeId))].sort(),
		schemaVersion: 1,
		matched: deduped,
	};
}
