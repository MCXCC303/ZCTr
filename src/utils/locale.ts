import {config} from "../../package.json";
import type {FluentMessageId} from "../../typings/i10n";

type FluentArgs = Record<string, string | number | null>;
const FTL_RESOURCE = `${config.addonRef}-addon.ftl`;

export function initLocale(): void {
	try {
		const LocalizationCtor = (
			typeof Localization !== "undefined"
				? Localization
				: ztoolkit.getGlobal("Localization")
		) as typeof Localization;
		if (typeof LocalizationCtor !== "function") {
			Zotero.debug(
				"[ZCTr] Localization API unavailable; message ids will be shown raw",
			);
			return;
		}
		addon.data.locale = {
			current: new LocalizationCtor([FTL_RESOURCE], true),
		};
		Zotero.debug(`[ZCTr] locale initialized: ${Zotero.locale}`);
	} catch (error) {
		Zotero.debug(`[ZCTr] locale init failed: ${(error as Error)?.message}`);
	}
}

function localeID(id: FluentMessageId): string {
	return `${config.addonRef}-${id}`;
}

export function getString(
	id: FluentMessageId,
	options: { args?: FluentArgs } = {},
): string {
	const fullID = localeID(id);
	const bundle = addon.data.locale?.current;
	if (!bundle) {
		Zotero.debug(`[ZCTr] locale not initialized, cannot format: ${fullID}`);
		return fullID;
	}
	const message = bundle.formatMessagesSync([
		{id: fullID, args: options.args},
	])[0];
	if (!message) {
		Zotero.debug(`[ZCTr] missing Fluent message: ${fullID}`);
		return fullID;
	}
	return message.value ?? fullID;
}
