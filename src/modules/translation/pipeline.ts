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
import {listTermbases} from "../terminology/store";
import {matchForTranslation} from "../terminology/context-aware";
import type {MatchedTermSet} from "../terminology/model";
import * as zlog from "../../utils/logger";

export interface TranslationHandle {
	fromCache: boolean;
	streaming: boolean;
	terminology?: MatchedTermSet;
	/** With streaming, `onDelta` fires per chunk; resolves with the full translation text. */
	run: (onDelta?: (delta: string) => void) => Promise<string>;
}

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
	zlog.debug(`translation request: item=${entry.itemID} text_len=${text.length} target=${targetLang} provider=${provider.id} stream=${runtimeConfig.stream}`);

	let context: TranslationContext;
	try {
		context = await assembleContext(
			entry.view,
			entry.itemID,
			text,
			getContextOptionsFromPrefs(),
		);
	} catch (error) {
		zlog.warn("Context assembly failed, degrading to selection-only:", error);
		context = selectionOnlyContext(text);
	}
	if (context.document || context.local) {
		zlog.debug(`context attached: level=${context.policy.level} doc=${!!context.document} local=${!!context.local}`);
	}

	const terminologyOn =
		getPref(PREFS.TERMINOLOGY_ENABLED) !== false &&
		getPref(PREFS.CONTEXT_INCLUDE_TERMINOLOGY) !== false;
	let terminology: MatchedTermSet | null = null;
	if (!terminologyOn) {
		zlog.debug("terminology injection disabled by prefs");
	} else {
		try {
			const termbases = await listTermbases();
			// Only the active termbase is matched; unset -> all compatible termbases.
			const activeTermbaseId = ((getPref(PREFS.ACTIVE_TERMBASE_ID) as string) ||
				null) as string | null;
			terminology =
				termbases.length > 0
					? matchForTranslation(termbases, context, targetLang, {
							activeTermbaseId,
						})
					: null;
		} catch (error) {
			zlog.warn("Terminology matching failed, skipping:", error);
		}
	}
	if (terminology) {
		zlog.debug(`terminology matched: ${terminology.matched.length} terms in ${terminology.termbaseIds.join(",")}`);
	}

	const request: TranslationRequest = buildTranslationRequest(
		provider,
		text,
		targetLang,
		runtimeConfig,
		context,
	);

	const cached = await translationCache.get(
		entry.itemID,
		request.text,
		request.targetLang,
		request.provider.id,
		request.runtimeConfig,
		request.context,
		terminology,
	);
	if (cached !== null) {
		return {
			fromCache: true,
			streaming: false,
			terminology: terminology ?? undefined,
			run: async () => cached as string,
		};
	}

	const messages = buildMessages(
		request.text,
		getTargetLanguageName(request.targetLang),
		request.context,
		terminology,
	);
	const streaming = request.runtimeConfig.stream;
	// Stop at the closing target marker so generation cannot continue into the context blocks.
	const {close} = pickTargetMarkers(request.text);
	const stop = [close];

	return {
		fromCache: false,
		streaming,
		terminology: terminology ?? undefined,
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
			const full = stripTargetMarkers(raw, request.text);
			if (full) {
				void translationCache.put(
					entry.itemID,
					request.text,
					request.targetLang,
					request.provider.id,
					request.runtimeConfig,
					request.context,
					terminology,
					full,
				);
			}
			return full;
		},
	};
}
