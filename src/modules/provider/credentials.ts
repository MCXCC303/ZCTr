import * as zlog from "../../utils/logger";

// API keys live in the Firefox login manager only, never in prefs or exports.

const KEY_HOST = "https://zctr.local";
const KEY_PREFIX = "zctr:";

function keyName(providerId: string): string {
	return `${KEY_PREFIX}${providerId}`;
}

function describeError(error: unknown): string {
	const e = error as any;
	return `${e?.name || ""} ${e?.message || ""} result=${e?.result ?? ""} ${
		e?.stack ? e.stack.slice(0, 300) : ""
	}`.trim();
}

/**
 * Store (or remove, when empty) a provider's API key.
 * Firefox 137+ replaced `nsILoginManager.addLogin` with `addLoginAsync`.
 */
export async function setProviderApiKey(
	providerId: string,
	apiKey: string,
): Promise<void> {
	try {
		const existing = Services.logins.findLogins(KEY_HOST, "", "");
		for (const login of existing) {
			if (login.username === keyName(providerId)) {
				Services.logins.removeLogin(login);
			}
		}
	} catch (error) {
		zlog.warn("Failed to remove old API key:", describeError(error));
	}

	if (!apiKey) {
		return;
	}

	const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
		Ci.nsILoginInfo,
	);
	login.origin = KEY_HOST;
	login.formActionOrigin = "";
	(login as any).httpRealm = null;
	login.username = keyName(providerId);
	login.password = apiKey;
	login.usernameField = "";
	login.passwordField = "";

	try {
		await (Services.logins as any).addLoginAsync(login);
	} catch (error) {
		zlog.warn("addLoginAsync failed:",
			describeError(error),
		);
	}
}

export function getProviderApiKey(providerId: string): string {
	try {
		const logins = Services.logins.findLogins(KEY_HOST, "", "");
		for (const login of logins) {
			if (login.username === keyName(providerId)) {
				return login.password || "";
			}
		}
	} catch (error) {
		zlog.warn("Failed to read API key:", error);
	}
	return "";
}
