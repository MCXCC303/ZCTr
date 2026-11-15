// Combo format: lowercase ctrl/alt/shift/meta modifiers, then the key, e.g. "ctrl+alt+t".

export interface Shortcut {
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	meta: boolean;
	key: string;
}

const MODIFIER_ALIASES: Record<string, "ctrl" | "alt" | "shift" | "meta"> = {
	ctrl: "ctrl",
	control: "ctrl",
	alt: "alt",
	shift: "shift",
	meta: "meta",
	cmd: "meta",
	command: "meta",
	win: "meta",
	windows: "meta",
};

export function parseShortcut(combo: string): Shortcut | null {
	const parts = combo
		.toLowerCase()
		.split("+")
		.map((p) => p.trim());
	const shortcut: Shortcut = {ctrl: false, alt: false, shift: false, meta: false, key: ""};
	for (const part of parts) {
		const mod = MODIFIER_ALIASES[part];
		if (mod) {
			shortcut[mod] = true;
		} else if (part) {
			shortcut.key = part;
		}
	}
	return shortcut.key ? shortcut : null;
}

export function matchesShortcut(event: KeyboardEvent, combo: string): boolean {
	const shortcut = parseShortcut(combo);
	if (!shortcut) {
		return false;
	}
	if (
		event.ctrlKey !== shortcut.ctrl ||
		event.altKey !== shortcut.alt ||
		event.shiftKey !== shortcut.shift ||
		event.metaKey !== shortcut.meta
	) {
		return false;
	}
	return event.key.toLowerCase() === shortcut.key;
}

/** Serialize a keydown event into a combo string; "" for a bare modifier key. */
export function serializeShortcut(event: KeyboardEvent): string {
	const key = event.key.toLowerCase();
	if (["control", "alt", "shift", "meta"].includes(key)) {
		return "";
	}
	const parts: string[] = [];
	if (event.ctrlKey) {
		parts.push("ctrl");
	}
	if (event.altKey) {
		parts.push("alt");
	}
	if (event.shiftKey) {
		parts.push("shift");
	}
	if (event.metaKey) {
		parts.push("meta");
	}
	parts.push(key);
	return parts.join("+");
}
