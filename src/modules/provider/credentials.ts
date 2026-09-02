import * as zlog from "../../utils/logger";
/**
 * Provider credentials - API key storage in the Firefox login manager
 * (NSS-encrypted), keyed by provider id. Keys never enter the providers pref,
 * Profile/Termbase exports or settings persistence.
 */

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
 *
 * Firefox 137+ replaced `nsILoginManager.addLogin` with the async
 * `addLoginAsync`; Zotero 9 runs on such a build.
 */
export async function setProviderApiKey(
	providerId: string,
	apiKey: string,
): Promise<void> {
	// Remove any previous value for this provider
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

	// Build the login by setting properties directly - nsILoginInfo.init()
	// argument mapping is unreliable on Firefox 140, and LoginHelper's
	// LoginInfo class is not exported. _checkLogin requires exactly one of
	// formActionOrigin/httpRealm to be "" and the other to be null.
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

/** Read a provider's API key from the login manager. */
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
