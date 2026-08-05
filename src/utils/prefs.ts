import { config } from "../../package.json";

const PREFS_PREFIX = config.prefsPrefix;

/** Get a plugin preference value (global, `extensions.zotero.zctr.*`). */
export function getPref(key: string): unknown {
  return Zotero.Prefs.get(`${PREFS_PREFIX}.${key}`, true);
}

/** Set a plugin preference value. */
export function setPref(key: string, value: string | number | boolean): void {
  Zotero.Prefs.set(`${PREFS_PREFIX}.${key}`, value, true);
}
