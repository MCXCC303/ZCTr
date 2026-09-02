/**
 * ZCTr preferences pane - orchestration.
 *
 * The pane skeleton lives in addon/content/preferences.xhtml and calls
 * Zotero.ZCTr.hooks.onPrefsEvent('load', { window }) on load; this module
 * renders the provider list, binds the buttons and orchestrates the shared
 * form fields (name, type, API key).
 *
 * Each provider type owns its type-specific fields via a ProviderForm
 * (see forms/): openai (Base URL + model), deepseek (model dropdown),
 * ollama (port + model dropdown + connectivity test).
 */

import {
	DEEPSEEK_MODELS,
	generateProviderId,
	PROVIDER_TYPE_LABELS,
	PROVIDER_TYPES,
	type ProviderConfig,
	type ProviderType,
} from "../provider/types";
import {getProviderApiKey, setProviderApiKey} from "../provider/credentials";
import {
	getProviders,
	saveProviders,
	setActiveProvider,
} from "../provider/registry";
import {TARGET_LANGUAGES} from "../provider/languages";
import {getPref, type PrefKey, PREFS, setPref} from "../../utils/prefs";
import {
	REPETITION_PENALTY_MIN,
	TEMPERATURE_MAX,
	TEMPERATURE_MIN,
	TOP_P_MAX,
	TOP_P_MIN,
} from "../runtime/runtime-config";
import {parseShortcut, serializeShortcut} from "../../utils/shortcut";
import {setLogLevel} from "../../utils/logger";
import {providerForms} from "./forms";
import {registerTermbaseScripts} from "./termbase-ui";
import {
	clearFormEnv,
	hEl,
	initFormEnv,
	inputValue,
	setInputValue,
	setSelectValue,
	setVisible,
	XHTML_NS,
} from "./provider-form";
import * as zlog from "../../utils/logger";

let win: Window | null = null;
let doc: Document | null = null;
/** Provider id currently being edited; null means "new provider" mode. */
let editingId: string | null = null;

/**
 * Context level union, kept local to the preferences layer so it does not
 * depend on the context engine module (see ZCTr-modules-ARCHITECTURE.md §2).
 */
type ContextLevel = "selection" | "local" | "semantic" | "adaptive";

export async function registerPrefsScripts(window: Window): Promise<void> {
	win = window;
	doc = window.document;
	editingId = null;
	initFormEnv(window);

	renderProviderList();
	bindButtons();
	bindGlobalSettings();
	void registerTermbaseScripts(window).catch((error) => {
		zlog.warn("Termbase UI init failed:", error);
	});

	window.addEventListener(
		"unload",
		() => {
			if (win === window) {
				win = null;
				doc = null;
				clearFormEnv();
			}
		},
		{once: true},
	);
}

function getActiveId(): string {
	return (getPref(PREFS.ACTIVE_PROVIDER_ID) as string) || "";
}

function renderProviderList(): void {
	const container = doc?.getElementById("zctr-provider-list");
	if (!container) {
		return;
	}
	container.replaceChildren();

	const providers = getProviders();
	const activeId = getActiveId();

	if (!providers.length) {
		container.append(
			hEl(
				"div",
				"暂无供应商，点击下方“添加供应商”开始配置。",
				"padding: 8px; color: #888; font-size: 12px;",
			),
		);
		return;
	}

	for (const provider of providers) {
		const item = hEl("div", undefined, [
			"display: flex",
			"justify-content: space-between",
			"align-items: center",
			"padding: 6px 8px",
			"cursor: pointer",
			"border-radius: 4px",
			"margin-bottom: 2px",
			provider.id === activeId
				? "background: var(--fill-quaternary, #e8e8e8); font-weight: 600;"
				: "",
			editingId === provider.id ? "outline: 1px solid var(--fill-tertiary, #aaa);" : "",
		].join("; "));
		const typeLabel = PROVIDER_TYPE_LABELS[provider.type] || provider.type;
		const name = hEl(
			"span",
			`${provider.name} - ${typeLabel}`,
			"overflow: hidden; text-overflow: ellipsis; white-space: nowrap;",
		);
		const mark = hEl("span", provider.id === activeId ? "● 激活" : "");
		mark.style.cssText = "font-size: 11px; color: #2f7cde; margin-left: 6px; flex-shrink: 0;";
		item.append(name, mark);

		item.addEventListener("click", () => {
			editingId = provider.id;
			loadForm(provider);
			renderProviderList();
		});
		container.append(item);
	}
}

/** Show/hide the shared fields and delegate to the type's form. */
function updateFormVisibility(type: ProviderType): void {
	for (const [formType, form] of Object.entries(providerForms) as [
		ProviderType,
		(typeof providerForms)[ProviderType],
	][]) {
		form.setVisible(formType === type);
	}
	// Shared fields
	setVisible("zctr-field-apikey", type !== "ollama");
}

function loadForm(provider: ProviderConfig | null): void {
	const type: ProviderType = provider?.type || "openai";
	setSelectValue("zctr-input-type", type);
	setInputValue("zctr-input-name", provider?.name ?? "");
	setInputValue("zctr-input-baseurl", "");
	setInputValue(
		"zctr-input-apikey",
		provider ? getProviderApiKey(provider.id) : "",
	);
	setSelectValue("zctr-input-model-select", DEEPSEEK_MODELS[0]);
	providerForms[type].load(provider);
	updateFormVisibility(type);
}

function validateForm(): ProviderConfig | null {
	if (!doc) {
		return null;
	}
	const type = (doc.getElementById("zctr-input-type") as HTMLSelectElement)
		?.value as ProviderType;
	const name = inputValue("zctr-input-name").trim();
	if (!name) {
		win?.alert("名称不能为空。");
		return null;
	}
	const base: ProviderConfig = {
		id: editingId ?? generateProviderId(),
		type,
		name,
	};
	return providerForms[type].validate(base);
}

/** Store the API key in the login manager, then persist the provider. */
async function persistProvider(provider: ProviderConfig): Promise<void> {
	await setProviderApiKey(provider.id, provider.apiKey || "");
	const providers = getProviders();
	const index = providers.findIndex((p) => p.id === provider.id);
	if (index >= 0) {
		providers[index] = provider;
	} else {
		providers.push(provider);
	}
	saveProviders(providers);
}

async function saveCurrent(): Promise<void> {
	if (!doc) {
		return;
	}
	const provider = validateForm();
	if (!provider) {
		return;
	}
	await persistProvider(provider);

	// Auto-activate the first provider if none is active yet
	const providers = getProviders();
	if (!getActiveId() && providers.length) {
		setActiveProvider(providers[0].id);
	}

	editingId = provider.id;
	renderProviderList();
}

async function setActiveCurrent(): Promise<void> {
	if (!doc) {
		return;
	}
	const provider = validateForm();
	if (!provider) {
		return;
	}
	await persistProvider(provider);
	editingId = provider.id;
	setActiveProvider(editingId);
	renderProviderList();
}

function deleteCurrent(): void {
	if (!doc || !editingId) {
		return;
	}
	const providers = getProviders();
	const next = providers.filter((p) => p.id !== editingId);
	saveProviders(next);
	if (getActiveId() === editingId) {
		setActiveProvider(next[0]?.id ?? "");
	}
	editingId = null;
	loadForm(null);
	renderProviderList();
}

/** Bind the global translation settings (target language, streaming toggle). */
function bindGlobalSettings(): void {
	if (!doc) {
		return;
	}
	// Target language dropdown: populated from TARGET_LANGUAGES, saved on
	// change (no separate save button)
	const langSelect = doc.getElementById(
		"zctr-input-targetlang",
	) as HTMLSelectElement | null;
	if (langSelect) {
		for (const lang of TARGET_LANGUAGES) {
			const option = doc.createElementNS(XHTML_NS, "option") as HTMLOptionElement;
			option.value = lang.code;
			option.textContent = lang.label;
			langSelect.append(option);
		}
		const current = (getPref(PREFS.TARGET_LANG) as string) || "zh";
		langSelect.value = TARGET_LANGUAGES.some((l) => l.code === current)
			? current
			: "zh";
		langSelect.addEventListener("change", () => {
			setPref(PREFS.TARGET_LANG, langSelect.value);
		});
	}

	// Translate hotkey: click the input, then press the combo (Esc clears)
	const shortcutInput = doc.getElementById(
		"zctr-input-shortcut",
	) as HTMLInputElement | null;
	if (shortcutInput) {
		shortcutInput.value = (getPref(PREFS.SHORTCUT) as string) || "";
		shortcutInput.addEventListener("keydown", (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();
			if (event.key === "Escape") {
				shortcutInput.value = "";
				setPref(PREFS.SHORTCUT, "");
				return;
			}
			const combo = serializeShortcut(event);
			if (combo) {
				// A modifier key is required: a modifier-less combo would fire
				// while typing in editable fields (comments, find box)
				const shortcut = parseShortcut(combo);
				if (
					shortcut &&
					!(shortcut.ctrl || shortcut.alt || shortcut.shift || shortcut.meta)
				) {
					win?.alert("快捷键需要包含至少一个修饰键（Ctrl / Alt / Shift / ⌘）。");
					return;
				}
				shortcutInput.value = combo;
				setPref(PREFS.SHORTCUT, combo);
			}
		});
	}

	const streamingInput = doc.getElementById(
		"zctr-input-streaming",
	) as HTMLInputElement | null;
	if (streamingInput) {
		streamingInput.checked = !!getPref(PREFS.STREAMING);
		streamingInput.addEventListener("change", () => {
			setPref(PREFS.STREAMING, streamingInput.checked);
		});
	}

	// Persisted cache toggle
	const cachePersistInput = doc.getElementById(
		"zctr-input-cache-persist",
	) as HTMLInputElement | null;
	if (cachePersistInput) {
		cachePersistInput.checked = !!getPref(PREFS.CACHE_PERSIST);
		cachePersistInput.addEventListener("change", () => {
			setPref(PREFS.CACHE_PERSIST, cachePersistInput.checked);
		});
	}

	// Cache queue lengths (-1 means unlimited). Memory and persisted queues
	// have independent limits.
	const bindCacheLimit = (inputId: string, prefKey: PrefKey, fallback: number): void => {
		const input = doc?.getElementById(inputId) as HTMLInputElement | null;
		if (!input) {
			return;
		}
		const current = (getPref(prefKey) as number) || fallback;
		input.value = String(current);
		input.addEventListener("change", () => {
			const v = parseInt(input.value, 10);
			if (v === -1 || (Number.isFinite(v) && v > 0)) {
				setPref(prefKey, v);
			} else {
				input.value = String(current);
			}
		});
	};
	bindCacheLimit("zctr-input-cache-limit", PREFS.CACHE_LIMIT, 50);
	bindCacheLimit("zctr-input-cache-persist-limit", PREFS.CACHE_PERSIST_LIMIT, 100);

	bindGenerationParams();
	bindContextSettings();
	bindLogSettings();
}

/**
 * Bind the "上下文" (translation context) settings: level dropdown and the
 * four injection toggles. Saved immediately on change.
 */
function bindContextSettings(): void {
	if (!doc) {
		return;
	}
	const levelSelect = doc.getElementById(
		"zctr-input-context-level",
	) as HTMLSelectElement | null;
	if (levelSelect) {
		levelSelect.value = (getPref(PREFS.CONTEXT_LEVEL) as string) || "local";
		levelSelect.addEventListener("change", () => {
			setPref(PREFS.CONTEXT_LEVEL, levelSelect.value);
			updateContextLevelView();
		});
	}

	const bindCheckbox = (inputId: string, prefKey: PrefKey): void => {
		const input = doc?.getElementById(inputId) as HTMLInputElement | null;
		if (!input) {
			return;
		}
		input.checked = !!getPref(prefKey);
		input.addEventListener("change", () => {
			setPref(prefKey, input.checked);
		});
	};
	bindCheckbox("zctr-input-context-abstract", PREFS.CONTEXT_INCLUDE_ABSTRACT);
	bindCheckbox("zctr-input-context-title", PREFS.CONTEXT_INCLUDE_TITLE);
	bindCheckbox(
		"zctr-input-context-section-title",
		PREFS.CONTEXT_INCLUDE_SECTION_TITLE,
	);
	bindCheckbox(
		"zctr-input-context-adjacent",
		PREFS.CONTEXT_INCLUDE_ADJACENT_PARAGRAPHS,
	);
	// "包含术语" - independent of the context level (never greyed out):
	// terminology is not a context layer, it is a separate injection input.
	bindCheckbox(
		"zctr-input-context-terminology",
		PREFS.CONTEXT_INCLUDE_TERMINOLOGY,
	);
	// Master switch for termbase matching/injection (术语表 section).
	bindCheckbox("zctr-input-termbase-enabled", PREFS.TERMINOLOGY_ENABLED);

	updateContextLevelView();
}

/** Bind the log-level select (applies immediately; no restart needed). */
function bindLogSettings(): void {
	if (!doc) {
		return;
	}
	const levelSelect = doc.getElementById(
		"zctr-input-log-level",
	) as HTMLSelectElement | null;
	if (!levelSelect) {
		return;
	}
	const current = (getPref(PREFS.LOG_LEVEL) as string) || "info";
	levelSelect.value = ["error", "warn", "info", "debug"].includes(current)
		? current
		: "info";
	setLogLevel(levelSelect.value);
	levelSelect.addEventListener("change", () => {
		setPref(PREFS.LOG_LEVEL, levelSelect.value);
		setLogLevel(levelSelect.value);
	});
}

/** Context level -> which "包含…" toggles are effective. */
const CONTEXT_LEVEL_TOGGLES: Array<{
	inputId: string;
	prefKey: PrefKey;
	levels: ContextLevel[];
}> = [
	{
		inputId: "zctr-input-context-abstract",
		prefKey: PREFS.CONTEXT_INCLUDE_ABSTRACT,
		levels: ["semantic", "adaptive"],
	},
	{
		inputId: "zctr-input-context-title",
		prefKey: PREFS.CONTEXT_INCLUDE_TITLE,
		levels: ["semantic", "adaptive"],
	},
	{
		inputId: "zctr-input-context-section-title",
		prefKey: PREFS.CONTEXT_INCLUDE_SECTION_TITLE,
		levels: ["local", "semantic", "adaptive"],
	},
	{
		inputId: "zctr-input-context-adjacent",
		prefKey: PREFS.CONTEXT_INCLUDE_ADJACENT_PARAGRAPHS,
		levels: ["local", "semantic", "adaptive"],
	},
];

const CONTEXT_LEVEL_HINTS: Record<ContextLevel, string> = {
	selection: "仅选段，不附加任何上下文",
	local: "含句 + 当前段 + 小节标题 (+ 相邻段)",
	semantic: "含句 + 当前段 + 小节标题 + 条目标题 + 摘要",
	adaptive: "含句 + 当前段 + 小节标题 (+ 条目标题 + 摘要)",
};

/**
 * Grey out the "包含…" toggles that do not apply to the currently selected
 * context level, and update the per-level hint. This prevents the confusion
 * of a checked-but-ineffective setting (e.g. "包含 Abstract" at Local level).
 */
function updateContextLevelView(): void {
	if (!doc) {
		return;
	}
	const level = ((getPref(PREFS.CONTEXT_LEVEL) as string) || "local") as ContextLevel;
	const hint = doc.getElementById("zctr-context-level-hint") as HTMLElement | null;
	if (hint) {
		hint.textContent = CONTEXT_LEVEL_HINTS[level] ?? "";
	}
	for (const toggle of CONTEXT_LEVEL_TOGGLES) {
		const input = doc.getElementById(toggle.inputId) as HTMLInputElement | null;
		if (!input) {
			continue;
		}
		const enabled = toggle.levels.includes(level);
		input.disabled = !enabled;
		const row = input.parentElement as HTMLElement | null;
		if (row) {
			row.style.opacity = enabled ? "" : "0.45";
		}
	}
}

/**
 * Bind the "生成参数" (runtime inference parameters) inputs. Empty optional
 * fields mean "not sent - provider default"; invalid values are rejected and
 * the input reverts to the current stored value.
 */
function bindGenerationParams(): void {
	if (!doc) {
		return;
	}
	const bindNumber = (
		inputId: string,
		prefKey: PrefKey,
		opts: {min: number; max?: number; integer?: boolean; allowEmpty: boolean},
	): void => {
		const input = doc?.getElementById(inputId) as HTMLInputElement | null;
		if (!input) {
			return;
		}
		const stored = getPref(prefKey);
		input.value =
			typeof stored === "number" && Number.isFinite(stored)
				? String(stored)
				: "";
		const revert = (): void => {
			const v = getPref(prefKey);
			input.value =
				typeof v === "number" && Number.isFinite(v) ? String(v) : "";
		};
		input.addEventListener("change", () => {
			const raw = input.value.trim();
			if (raw === "" && opts.allowEmpty) {
				setPref(prefKey, "");
				return;
			}
			const n = Number(raw);
			const valid =
				Number.isFinite(n) &&
				(opts.integer ? Number.isInteger(n) : true) &&
				n >= opts.min &&
				(opts.max === undefined || n <= opts.max);
			if (valid) {
				setPref(prefKey, n);
			} else {
				revert();
			}
		});
	};

	bindNumber("zctr-input-temperature", PREFS.TEMPERATURE, {
		min: TEMPERATURE_MIN,
		max: TEMPERATURE_MAX,
		allowEmpty: false,
	});
	bindNumber("zctr-input-top-p", PREFS.TOP_P, {
		min: TOP_P_MIN,
		max: TOP_P_MAX,
		allowEmpty: true,
	});
	bindNumber("zctr-input-top-k", PREFS.TOP_K, {
		min: 0,
		integer: true,
		allowEmpty: true,
	});
	bindNumber("zctr-input-rep-penalty", PREFS.REPETITION_PENALTY, {
		min: REPETITION_PENALTY_MIN,
		allowEmpty: true,
	});
	bindNumber("zctr-input-max-output-tokens", PREFS.MAX_OUTPUT_TOKENS, {
		min: 1,
		integer: true,
		allowEmpty: true,
	});
}

function bindButtons(): void {
	if (!doc) {
		return;
	}
	doc.getElementById("zctr-btn-add")?.addEventListener("click", () => {
		editingId = null;
		loadForm(null);
		renderProviderList();
	});
	doc.getElementById("zctr-btn-save")?.addEventListener("click", saveCurrent);
	doc.getElementById("zctr-btn-active")?.addEventListener("click", setActiveCurrent);
	doc.getElementById("zctr-btn-delete")?.addEventListener("click", deleteCurrent);

	// Delegate per-type field events (e.g. the Ollama connectivity test)
	for (const form of Object.values(providerForms)) {
		form.bindEvents();
	}

	// Type switch: adapt the form fields
	const typeSelect = doc.getElementById("zctr-input-type") as HTMLSelectElement | null;
	if (typeSelect) {
		typeSelect.addEventListener("change", () => {
			const type = typeSelect.value as ProviderType;
			// Reset every type's fields, then show the selected type's form.
			// The shared name and API key fields are kept so switching types
			// does not lose what the user already typed.
			for (const form of Object.values(providerForms)) {
				form.reset();
			}
			updateFormVisibility(type);
		});
	}

	// Keep the type list in sync with PROVIDER_TYPES
	if (typeSelect) {
		const options = [...(typeSelect.options as unknown as HTMLOptionElement[])];
		for (const type of PROVIDER_TYPES) {
			if (!options.some((o) => o.value === type)) {
				const option = doc.createElementNS(XHTML_NS, "option") as HTMLOptionElement;
				option.value = type;
				option.textContent = PROVIDER_TYPE_LABELS[type];
				typeSelect.append(option);
			}
		}
	}
}
