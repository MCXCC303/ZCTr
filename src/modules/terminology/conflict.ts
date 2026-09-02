/**
 * Conflict resolver - turns raw term occurrences into the final matched set
 * (architecture §17, P2 plan §3.2 Step 5).
 *
 * Resolution order:
 *   1. exact language pair        (already enforced by matchTermbase)
 *   2. narrowest scope            (v1: termbase scope only)
 *   3. longest match              (longer phrase shadows contained ones)
 *   4. preferred status
 *   5. explicit user override     (v1: none - reserved)
 *   6. latest updated entry
 *   7. deterministic fallback     (termId / conceptId ordering)
 *
 * After overlap resolution the set is deduplicated per concept and capped at
 * DEFAULT_MAX_MATCHED_TERMS (truncation priority: forbidden > preferred >
 * admitted > deprecated).
 */

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

/** v1: every occurrence is scoped to its own termbase. */
const SCOPE_TYPE = "termbase" as const;

/**
 * Resolve overlaps (longest match wins; ties by status, recency, then a
 * deterministic term id), dedupe per concept, and cap the result.
 */
export function resolveConflicts(
	occurrences: TermOccurrence[],
	termbaseId: string,
	opts: {maxTerms?: number} = {},
): MatchedTermSet {
	const maxTerms = opts.maxTerms ?? DEFAULT_MAX_MATCHED_TERMS;

	// 1. Overlap resolution: sort by (start asc, length desc, status desc,
	//    recency desc, termId asc) and greedily keep non-overlapping winners.
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
	}));

	return {
		termbaseIds: [termbaseId],
		schemaVersion: 1,
		matched,
	};
}

/** Merge sets from multiple termbases, re-capping at maxTerms. */
export function mergeMatchedSets(
	sets: MatchedTermSet[],
	opts: {maxTerms?: number} = {},
): MatchedTermSet {
	const maxTerms = opts.maxTerms ?? DEFAULT_MAX_MATCHED_TERMS;
	const order: TermStatus[] = ["forbidden", "preferred", "admitted", "deprecated"];
	const all = sets.flatMap((s) => s.matched);
	const seen = new Set<string>();
	const deduped: MatchedTerm[] = [];
	for (const status of order) {
		for (const m of all) {
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
		termbaseIds: [...new Set(sets.flatMap((s) => s.termbaseIds))].sort(),
		schemaVersion: 1,
		matched: deduped,
	};
}
