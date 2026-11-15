const LOG_LEVELS = ["error", "warn", "info", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export function isLogLevel(value: unknown): value is LogLevel {
	return typeof value === "string" && (LOG_LEVELS as readonly string[]).includes(value);
}

function order(level: LogLevel): number {
	return LOG_LEVELS.indexOf(level);
}

let currentLevel: LogLevel = "info";

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

export function debug(message: string, ...args: unknown[]): void {
	if (show("debug")) {
		output("debug", message, args);
	}
}

export function info(message: string, ...args: unknown[]): void {
	if (show("info")) {
		output("info", message, args);
	}
}

export function warn(message: string, ...args: unknown[]): void {
	if (show("warn")) {
		output("warn", message, args);
	}
}

export function error(message: string, ...args: unknown[]): void {
	if (show("error")) {
		output("error", message, args);
	}
}
