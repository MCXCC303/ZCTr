/**
 * DocumentMetadataProvider - Zotero item metadata for the document-level
 * semantic context (L2): title and abstract from the attachment's parent
 * item, cached per attachment for the session.
 *
 * Abstract states (M1): "available" (non-empty abstractNote) / "unavailable";
 * "stale" has no reliable source in the Zotero Item API and is reserved for
 * M2 (see ZCTr-context-M1-plan.md §4.1). abstractSource is "metadata" for any
 * abstractNote content (the item field is itself metadata).
 */

import type {AbstractSource, AbstractState} from "../context";
import * as zlog from "../../../utils/logger";

export interface DocumentMetadata {
	/** Parent (e.g. journal article) item id. */
	itemId: number;
	/** Attachment (PDF) item id. */
	attachmentId: number;
	title?: string;
	abstract?: string;
	abstractState: AbstractState;
	abstractSource: AbstractSource;
}

const cache = new Map<number, Promise<DocumentMetadata | null>>();

/**
 * Resolve document metadata for an attachment item id. Null when the item is
 * missing, has no parent, or nothing usable was found. Failures (thrown by
 * the Zotero API) resolve to null so callers never see exceptions.
 */
export function getDocumentMetadata(itemID?: number): Promise<DocumentMetadata | null> {
	if (!itemID || !Number.isInteger(itemID)) {
		return Promise.resolve(null);
	}
	let pending = cache.get(itemID);
	if (!pending) {
		pending = resolveMetadata(itemID)
			.catch((error) => {
				zlog.warn("Failed to load document metadata:", error);
				return null;
			})
			.finally(() => {
				// Drop completed entries so edits are picked up on the next
				// translation without unbounded growth.
				if (cache.size > 256) {
					cache.delete(cache.keys().next().value as number);
				}
			});
		cache.set(itemID, pending);
	}
	return pending;
}

async function resolveMetadata(itemID: number): Promise<DocumentMetadata | null> {
	const attachment = Zotero.Items.get(itemID);
	if (!attachment) {
		return null;
	}
	const parent = attachment.parentItemID
		? Zotero.Items.get(attachment.parentItemID)
		: null;
	if (!parent) {
		return null;
	}
	const title = String(parent.getField("title") ?? "").trim();
	const abstract = String(parent.getField("abstractNote") ?? "").trim();
	const meta: DocumentMetadata = {
		itemId: parent.id,
		attachmentId: itemID,
		abstractState: abstract ? "available" : "unavailable",
		abstractSource: abstract ? "metadata" : "unknown",
	};
	if (title) {
		meta.title = title;
	}
	if (abstract) {
		meta.abstract = abstract;
	}
	return meta;
}
