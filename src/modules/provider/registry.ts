/**
 * Provider registry - list / activation / persistence of provider configs.
 * Credentials stay in the login manager (credentials.ts) and are merged back
 * only by `getActiveProvider`.
 */

import {getPref, PREFS, setPref} from "../../utils/prefs";
import {getProviderApiKey, setProviderApiKey} from "./credentials";
import type {ProviderConfig} from "./types";
import * as zlog from "../../utils/logger";

export function getProviders(): ProviderConfig[] {
	try {
		const raw = getPref(PREFS.PROVIDERS) as string;
		const list = JSON.parse(raw || "[]");
		if (!Array.isArray(list)) {
			return [];
		}
		let migrated = false;
		const providers: ProviderConfig[] = list.map(
			(p: any): ProviderConfig => {
				const provider: ProviderConfig = {type: "openai", ...p};
				// One-time migration of plaintext apiKey (pre type-field versions)
				// into the login manager, then drop it from the stored JSON.
				if (provider.apiKey) {
					setProviderApiKey(provider.id, provider.apiKey).catch(() => {
					});
					delete provider.apiKey;
					migrated = true;
				}
				return provider;
			},
		);
		if (migrated) {
			saveProviders(providers);
		}
		return providers;
	} catch (error) {
		zlog.warn("Failed to parse providers:", error);
		return [];
	}
}

/**
 * Persist providers. apiKey is never written to the pref - call
 * `setProviderApiKey(id, key)` separately for sensitive credentials.
 */
export function saveProviders(providers: ProviderConfig[]): void {
	setPref(
		PREFS.PROVIDERS,
		JSON.stringify(providers.map(({apiKey: _apiKey, ...rest}) => rest)),
	);
}

/** The active provider with its API key merged back in. */
export function getActiveProvider(): ProviderConfig | null {
	const activeId = getPref(PREFS.ACTIVE_PROVIDER_ID) as string;
	if (!activeId) {
		return null;
	}
	const provider = getProviders().find((p) => p.id === activeId);
	if (!provider) {
		return null;
	}
	return {...provider, apiKey: getProviderApiKey(provider.id)};
}

export function setActiveProvider(id: string): void {
	setPref(PREFS.ACTIVE_PROVIDER_ID, id);
}
