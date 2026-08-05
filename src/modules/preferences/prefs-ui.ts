/**
 * ZCTr preferences UI.
 *
 * The pane skeleton lives in addon/content/preferences.xhtml and calls
 * Zotero.ZCTr.hooks.onPrefsEvent('load', { window }) on load; this module
 * renders the provider list and binds the form.
 *
 * The provider form is type-driven: the first field selects the provider
 * type (openai / deepseek / ollama) and the remaining fields adapt to it:
 * - openai:   name + API Base URL + API Key + model (free text)
 * - deepseek: name + API Key + model (built-in base URL, model dropdown)
 * - ollama:   name + port + model (no API key, with connectivity test)
 */

import {
	DEEPSEEK_MODELS,
	OLLAMA_DEFAULT_PORT,
	PROVIDER_TYPES,
	PROVIDER_TYPE_LABELS,
	TARGET_LANGUAGES,
	generateProviderId,
	getProviderApiKey,
	getProviders,
	saveProviders,
	setActiveProvider,
	setProviderApiKey,
	testOllamaConnection,
	type ProviderConfig,
	type ProviderType,
} from "../translate/translator";
import {PREFS, getPref, setPref, type PrefKey} from "../../utils/prefs";

const XHTML_NS = "http://www.w3.org/1999/xhtml";

let win: Window | null = null;
let doc: Document | null = null;
/** Provider id currently being edited; null means "new provider" mode. */
let editingId: string | null = null;

export async function registerPrefsScripts(window: Window): Promise<void> {
	win = window;
	doc = window.document;
	editingId = null;

	renderProviderList();
	bindButtons();
	bindGlobalSettings();

	window.addEventListener(
		"unload",
		() => {
			if (win === window) {
				win = null;
				doc = null;
			}
		},
		{once: true},
	);
}

function getActiveId(): string {
	return (getPref(PREFS.ACTIVE_PROVIDER_ID) as string) || "";
}

function inputValue(id: string): string {
	return (doc?.getElementById(id) as HTMLInputElement | null)?.value ?? "";
}

function setInputValue(id: string, value: string): void {
	const el = doc?.getElementById(id) as HTMLInputElement | null;
	if (el) {
		el.value = value;
	}
}

function selectValue(id: string): string {
	return (doc?.getElementById(id) as HTMLSelectElement | null)?.value ?? "";
}

function setSelectValue(id: string, value: string): void {
	const el = doc?.getElementById(id) as HTMLSelectElement | null;
	if (el) {
		el.value = value;
	}
}

function setVisible(id: string, visible: boolean): void {
	const el = doc?.getElementById(id) as HTMLElement | null;
	if (el) {
		el.hidden = !visible;
	}
}

/** Create an XHTML element inside the XUL preferences document. */
function hEl<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	text?: string,
	style?: string,
): HTMLElementTagNameMap[K] {
	const el = doc!.createElementNS(XHTML_NS, tag) as HTMLElementTagNameMap[K];
	if (text !== undefined) {
		el.textContent = text;
	}
	if (style) {
		el.style.cssText = style;
	}
	return el;
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

/** Show/hide form fields according to the provider type. */
function updateFormVisibility(type: ProviderType): void {
	setVisible("zctr-field-baseurl", type === "openai");
	setVisible("zctr-field-model-select", type === "deepseek");
	setVisible("zctr-field-model", type !== "deepseek");
	setVisible("zctr-field-port", type === "ollama");
	setVisible("zctr-field-apikey", type !== "ollama");
}

function loadForm(provider: ProviderConfig | null): void {
	const type: ProviderType = provider?.type || "openai";
	setSelectValue("zctr-input-type", type);
	setInputValue("zctr-input-name", provider?.name ?? "");
	setInputValue("zctr-input-baseurl", provider?.apiBaseUrl ?? "");
	// API keys live in the login manager, not in the provider JSON
	setInputValue("zctr-input-apikey", provider ? getProviderApiKey(provider.id) : "");
	setInputValue(
		"zctr-input-model",
		provider?.type === "deepseek" ? "" : (provider?.model ?? ""),
	);
	setSelectValue(
		"zctr-input-model-select",
		provider?.model || DEEPSEEK_MODELS[0],
	);
	setInputValue(
		"zctr-input-port",
		String(provider?.port || OLLAMA_DEFAULT_PORT),
	);
	const status = doc?.getElementById("zctr-ollama-status") as HTMLElement | null;
	if (status) {
		status.textContent = "";
	}
	updateFormVisibility(type);
}

function validateForm(): ProviderConfig | null {
	if (!doc) {
		return null;
	}
	const type = selectValue("zctr-input-type") as ProviderType;
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
	switch (type) {
		case "openai": {
			const apiBaseUrl = inputValue("zctr-input-baseurl").trim().replace(/\/+$/, "");
			const model = inputValue("zctr-input-model").trim();
			if (!apiBaseUrl) {
				win?.alert("API Base URL 不能为空。");
				return null;
			}
			if (!model) {
				win?.alert("模型不能为空。");
				return null;
			}
			return {
				...base,
				apiBaseUrl,
				apiKey: inputValue("zctr-input-apikey").trim(),
				model,
			};
		}
		case "deepseek": {
			const model = selectValue("zctr-input-model-select");
			return {
				...base,
				apiKey: inputValue("zctr-input-apikey").trim(),
				model: model || DEEPSEEK_MODELS[0],
			};
		}
		case "ollama": {
			const model = inputValue("zctr-input-model").trim();
			if (!model) {
				win?.alert("模型不能为空。");
				return null;
			}
			const port = parseInt(inputValue("zctr-input-port") || "", 10);
			return {
				...base,
				port: Number.isFinite(port) ? port : OLLAMA_DEFAULT_PORT,
				model,
			};
		}
	}
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

async function testOllama(): Promise<void> {
	const status = doc?.getElementById("zctr-ollama-status") as HTMLElement | null;
	if (!status) {
		return;
	}
	const port = parseInt(inputValue("zctr-input-port") || "", 10);
	const portValue = Number.isFinite(port) ? port : OLLAMA_DEFAULT_PORT;
	status.textContent = "检测中…";
	status.style.color = "#888";
	try {
		const models = await testOllamaConnection(portValue);
		if (models.length) {
			const names = models
				.slice(0, 5)
				.map((m) => (m.parameterSize ? `${m.name} (${m.parameterSize})` : m.name))
				.join(", ");
			status.textContent = `✓ 连接成功，检测到 ${models.length} 个模型：${names}${models.length > 5 ? "…" : ""}`;
		} else {
			status.textContent = "✓ 连接成功（未检测到已安装的模型）";
		}
		status.style.color = "#2f7cde";
	} catch (error) {
		status.textContent = `✗ 连接失败：${(error as Error).message}`;
		status.style.color = "#c0392b";
	}
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
	doc.getElementById("zctr-btn-test-ollama")?.addEventListener("click", testOllama);

	// Type switch: adapt the form fields
	const typeSelect = doc.getElementById("zctr-input-type") as HTMLSelectElement | null;
	if (typeSelect) {
		typeSelect.addEventListener("change", () => {
			updateFormVisibility(typeSelect.value as ProviderType);
			// Clear type-specific fields when switching
			setInputValue("zctr-input-baseurl", "");
			setInputValue("zctr-input-apikey", "");
			setInputValue("zctr-input-model", "");
			setSelectValue("zctr-input-model-select", DEEPSEEK_MODELS[0]);
			setInputValue("zctr-input-port", String(OLLAMA_DEFAULT_PORT));
			const status = doc?.getElementById("zctr-ollama-status") as HTMLElement | null;
			if (status) {
				status.textContent = "";
			}
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
