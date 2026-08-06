import {createZToolkit} from "./utils/ztoolkit";
import {
	registerReaderTranslate,
	unregisterReaderTranslate,
} from "./modules/reader/translate-popup";
import {registerPrefsScripts} from "./modules/preferences/prefs-ui";

async function onStartup() {
	Zotero.debug("[ZCTr] onStartup begin");
	await Promise.all([
		Zotero.initializationPromise,
		Zotero.unlockPromise,
		Zotero.uiReadyPromise,
	]);

	// Register the preferences pane
	Zotero.PreferencePanes.register({
		pluginID: addon.data.config.addonID,
		id: "zctr-prefpane",
		src: rootURI + "content/preferences.xhtml",
		label: "ZCTr",
		image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.svg`,
	});
	Zotero.debug("[ZCTr] PreferencePanes registered");

	// Register reader context menu entries (global, not per window)
	registerReaderTranslate();

	// Initialize per-window toolkits
	await Promise.all(
		Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
	);

	addon.data.initialized = true;
}

async function onMainWindowLoad(_win: _ZoteroTypes.MainWindow): Promise<void> {
	addon.data.ztoolkit = createZToolkit();
}

async function onMainWindowUnload(_win: _ZoteroTypes.MainWindow): Promise<void> {
}

async function onShutdown(): Promise<void> {
	unregisterReaderTranslate();
	addon.data.alive = false;
	addon.data.initialized = false;
}

async function onAppShutdown(): Promise<void> {
	unregisterReaderTranslate();
	addon.data.alive = false;
}

/**
 * Preference UI events dispatcher.
 * Called from preferences.xhtml onload:
 *   onload="Zotero.ZCTr.hooks.onPrefsEvent('load', { window })"
 */
async function onPrefsEvent(
	type: string,
	data: { [key: string]: unknown },
): Promise<void> {
	Zotero.debug(`[ZCTr] onPrefsEvent: ${type}`);
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
				`ZCTr 设置初始化失败: ${(error as Error).message}`,
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
