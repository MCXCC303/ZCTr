import type {AbstractSource, AbstractState} from "../context";
import * as zlog from "../../../utils/logger";

export interface DocumentMetadata {
	itemId: number;
	attachmentId: number;
	title?: string;
	abstract?: string;
	abstractState: AbstractState;
	abstractSource: AbstractSource;
}

const cache = new Map<number, Promise<DocumentMetadata | null>>();

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
				// Cached per attachment; item edits are not picked up until eviction.
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
