/**
 * ZCTr logger - leveled logging (error < warn < info < debug).
 *
 * The level is set from preferences (设置 → ZCTr → 全局设置 → 日志).
 * Use the exported helpers instead of raw Zotero.debug / ztoolkit.log so the
 * debug console output can be filtered at a glance:
 *   error - process-level failures (provider down, cache IO broken)
 *   warn  - recoverable failures / suspicious states (API errors, degraded
 *           context extraction, refused terminology collection)
 *   info  - user-facing state changes (termbase created/imported, collect
 *           saved, cache persisted)
 *   debug - per-request detail (context fields, cache hit/miss, provider
 *           request incl. the full message dump)
 * The "[ZCTr] " prefix is added here.
 */

const LOG_LEVELS = ["error", "warn", "info", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export function isLogLevel(value: unknown): value is LogLevel {
	return typeof value === "string" && (LOG_LEVELS as readonly string[]).includes(value);
}

function order(level: LogLevel): number {
	return LOG_LEVELS.indexOf(level);
}

let currentLevel: LogLevel = "info";

/** Set the effective log level (accepts raw pref values; invalid -> info). */
export function setLogLevel(level: unknown): void {
	currentLevel = isLogLevel(level) ? level : "info";
}

export function getLogLevel(): LogLevel {
	return currentLevel;
}

function show(level: LogLevel): boolean {
	return order(level) <= order(currentLevel);
}

function fmt(args: unknown[]): string {
	return args
		.map((a) => {
			if (a === undefined) {
				return "undefined";
			}
			if (a instanceof Error) {
				return `${a.name}: ${a.message}`;
			}
			if (typeof a === "object") {
				try {
					return JSON.stringify(a);
				} catch {
					return String(a);
				}
			}
			return String(a);
		})
		.join(" ");
}

function output(level: LogLevel, message: string, args: unknown[]): void {
	const line = `[ZCTr] ${message}${args.length ? " " + fmt(args) : ""}`;
	if (level === "error") {
		try {
			Zotero.logError(new Error(line));
		} catch {
			Zotero.debug(`[ZCTr] ERROR ${line}`);
		}
		return;
	}
	if (level === "warn") {
		try {
			ztoolkit.log(line);
		} catch {
			Zotero.debug(line);
		}
		return;
	}
	Zotero.debug(line);
}

/** Per-request detail. */
export function debug(message: string, ...args: unknown[]): void {
	if (show("debug")) {
		output("debug", message, args);
	}
}

/** User-facing state changes. */
export function info(message: string, ...args: unknown[]): void {
	if (show("info")) {
		output("info", message, args);
	}
}

/** Recoverable failures / suspicious states. */
export function warn(message: string, ...args: unknown[]): void {
	if (show("warn")) {
		output("warn", message, args);
	}
}

/** Process-level failures. */
export function error(message: string, ...args: unknown[]): void {
	if (show("error")) {
		output("error", message, args);
	}
}
