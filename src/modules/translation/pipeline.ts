/**
 * Translation pipeline - orchestrates one translation request
 * (ZCTr-modules-ARCHITECTURE.md §4): context assembly -> cache lookup ->
 * prompt building -> provider transport -> cache store.
 *
 * Phase 2/3 mount points (see the module spec):
 * - terminology injection sits between context assembly and prompt building;
 * - profile resolution sits at the pipeline entry (provider / runtime /
 *   context policy / terminology policy).
 *
 * The reader UI only consumes the returned handle; it never touches the
 * provider, cache or context internals.
 */

import {getPref, PREFS} from "../../utils/prefs";
import type {ReaderEntry} from "../../types/reader";
import {getActiveProvider} from "../provider/registry";
import {getTargetLanguageName} from "../provider/languages";
import {translateText, translateTextStreaming} from "../provider/transport";
import {getRuntimeConfig} from "../runtime/runtime-config";
import {
	assembleContext,
	getContextOptionsFromPrefs,
} from "../context/orchestrator";
import {
	selectionOnlyContext,
	type TranslationContext,
} from "../context/context";
import {buildMessages, pickTargetMarkers, stripTargetMarkers} from "./prompt";
import {translationCache} from "./cache";
import {buildTranslationRequest, type TranslationRequest} from "./request";

export interface TranslationHandle {
	/** True when the result came from the local cache (no provider request). */
	fromCache: boolean;
	/** Whether the transport streams deltas (drives the popup UX). */
	streaming: boolean;
	/**
	 * Start/continue the translation. With streaming, `onDelta` is called
	 * for each chunk; always resolves with the full translation text.
	 */
	run: (onDelta?: (delta: string) => void) => Promise<string>;
}

/**
 * Start a translation for the reader entry. Returns null when no provider
 * is configured (the caller shows a setup hint). Never throws: context
 * failures degrade silently to a selection-only request.
 */
export async function startTranslation(
	entry: ReaderEntry,
	text: string,
): Promise<TranslationHandle | null> {
	const provider = getActiveProvider();
	if (!provider) {
		return null;
	}
	const targetLang = (getPref(PREFS.TARGET_LANG) as string) || "zh";
	const runtimeConfig = getRuntimeConfig();

	let context: TranslationContext;
	try {
		context = await assembleContext(
			entry.view,
			entry.itemID,
			text,
			getContextOptionsFromPrefs(),
		);
	} catch (error) {
		ztoolkit.log("[ZCTr] Context assembly failed, degrading to selection-only:", error);
		context = selectionOnlyContext(text);
	}
	if (context.document || context.local) {
		Zotero.debug(
			`[ZCTr] context attached: level=${context.policy.level} doc=${!!context.document} local=${!!context.local}`,
		);
	}

	const request: TranslationRequest = buildTranslationRequest(
		provider,
		text,
		targetLang,
		runtimeConfig,
		context,
	);

	// Local cache hit: serve instantly without a provider request
	const cached = await translationCache.get(
		entry.itemID,
		request.text,
		request.targetLang,
		request.provider.id,
		request.runtimeConfig,
		request.context,
	);
	if (cached !== null) {
		return {
			fromCache: true,
			streaming: false,
			run: async () => cached as string,
		};
	}

	// Build messages once per request (Phase 2 hooks in here).
	const messages = buildMessages(
		request.text,
		getTargetLanguageName(request.targetLang),
		request.context,
	);
	const streaming = request.runtimeConfig.stream;
	// Hard stop at the closing target marker: generation ends the moment the
	// model emits it, so it cannot continue into the context blocks.
	const {close} = pickTargetMarkers(request.text);
	const stop = [close];

	return {
		fromCache: false,
		streaming,
		run: async (onDelta) => {
			const raw = streaming
				? await translateTextStreaming(
						request.provider,
						messages,
						request.runtimeConfig,
						(delta) => onDelta?.(delta),
						stop,
					)
				: await translateText(
						request.provider,
						messages,
						request.runtimeConfig,
						stop,
					);
			// Some models echo the target markers around the output; strip
			// them before display and caching (see prompt.ts).
			const full = stripTargetMarkers(raw, request.text);
			if (full) {
				void translationCache.put(
					entry.itemID,
					request.text,
					request.targetLang,
					request.provider.id,
					request.runtimeConfig,
					request.context,
					full,
				);
			}
			return full;
		},
	};
}
