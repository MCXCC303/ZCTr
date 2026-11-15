import {createZToolkit} from "./utils/ztoolkit";
import {registerViewMenu, unregisterViewMenu,} from "./modules/reader/view-menu";
import {registerAnnotationMenu, unregisterAnnotationMenu,} from "./modules/reader/annotation-menu";
import {
	registerHotkey,
	registerWindowHotkey,
	unregisterHotkey,
	unregisterWindowHotkey,
} from "./modules/reader/hotkey";
import {closePopup} from "./modules/reader/translate-popup";
import {registerPrefsScripts} from "./modules/preferences/prefs-ui";
import {getString, initLocale} from "./utils/locale";
import * as zlog from "./utils/logger";

async function onStartup() {
	zlog.debug("onStartup begin");
	await Promise.all([
		Zotero.initializationPromise,
		Zotero.unlockPromise,
		Zotero.uiReadyPromise,
	]);

	initLocale();

	Zotero.PreferencePanes.register({
		pluginID: addon.data.config.addonID,
		id: "zctr-prefpane",
		src: rootURI + "content/preferences.xhtml",
		label: getString("addon-name"),
		image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.svg`,
		stylesheets: [rootURI + "content/preferences.css"],
	});
	zlog.debug("PreferencePanes registered");

	registerViewMenu();
	registerAnnotationMenu();
	registerHotkey();

	await Promise.all(
		Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
	);

	addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
	addon.data.ztoolkit = createZToolkit();
	registerWindowHotkey(win);
}

async function onMainWindowUnload(win: _ZoteroTypes.MainWindow): Promise<void> {
	unregisterWindowHotkey(win);
}

async function onShutdown(): Promise<void> {
	unregisterViewMenu();
	unregisterAnnotationMenu();
	unregisterHotkey();
	closePopup();
	addon.data.alive = false;
	addon.data.initialized = false;
}

async function onAppShutdown(): Promise<void> {
	unregisterViewMenu();
	unregisterAnnotationMenu();
	unregisterHotkey();
	closePopup();
	addon.data.alive = false;
}

async function onPrefsEvent(
	type: string,
	data: { [key: string]: unknown },
): Promise<void> {
	zlog.debug(`onPrefsEvent: ${type}`);
	try {
		switch (type) {
			case "load":
				await registerPrefsScripts(data.window as Window);
				break;
			default:
				return;
		}
	} catch (error) {
		Zotero.logError(error as Error);
		try {
			(data.window as Window).alert(
				getString("prefs-init-error", {
					args: {detail: (error as Error).message},
				}),
			);
		} catch {
			// Ignore alert failures
		}
	}
}

export default {
	onStartup,
	onShutdown,
	onAppShutdown,
	onMainWindowLoad,
	onMainWindowUnload,
	onPrefsEvent,
};
