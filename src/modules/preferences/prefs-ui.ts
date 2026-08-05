/**
 * ZCTr preferences UI.
 *
 * The pane skeleton lives in addon/content/preferences.xhtml and calls
 * Zotero.ZCTr.hooks.onPrefsEvent('load', { window }) on load; this module
 * renders the provider list and binds the form.
 */

import {
  generateProviderId,
  getProviders,
  saveProviders,
  setActiveProvider,
  type ProviderConfig,
} from "../translate/translator";
import { getPref, setPref } from "../../utils/prefs";

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
    { once: true },
  );
}

function getActiveId(): string {
  return (getPref("activeProviderId") as string) || "";
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
    const name = hEl("span", provider.name, "overflow: hidden; text-overflow: ellipsis; white-space: nowrap;");
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

function loadForm(provider: ProviderConfig | null): void {
  setInputValue("zctr-input-name", provider?.name ?? "");
  setInputValue("zctr-input-baseurl", provider?.apiBaseUrl ?? "");
  setInputValue("zctr-input-apikey", provider?.apiKey ?? "");
  setInputValue("zctr-input-model", provider?.model ?? "");
  setInputValue("zctr-input-targetlang", (getPref("targetLang") as string) || "zh");
}

function validateForm(): ProviderConfig | null {
  const name = inputValue("zctr-input-name").trim();
  const apiBaseUrl = inputValue("zctr-input-baseurl").trim().replace(/\/+$/, "");
  const apiKey = inputValue("zctr-input-apikey").trim();
  const model = inputValue("zctr-input-model").trim();
  if (!name || !apiBaseUrl) {
    win?.alert("名称和 API Base URL 不能为空。");
    return null;
  }
  return { id: editingId ?? generateProviderId(), name, apiBaseUrl, apiKey, model };
}

function saveCurrent(): void {
  if (!doc) {
    return;
  }
  const provider = validateForm();
  if (!provider) {
    return;
  }
  const providers = getProviders();
  const index = providers.findIndex((p) => p.id === provider.id);
  if (index >= 0) {
    providers[index] = provider;
  } else {
    providers.push(provider);
  }
  saveProviders(providers);

  // Auto-activate the first provider if none is active yet
  if (!getActiveId() && providers.length) {
    setActiveProvider(providers[0].id);
  }

  editingId = provider.id;
  renderProviderList();
}

function setActiveCurrent(): void {
  if (!doc) {
    return;
  }
  const provider = validateForm();
  if (!provider) {
    return;
  }
  const providers = getProviders();
  const index = providers.findIndex((p) => p.id === provider.id);
  if (index >= 0) {
    providers[index] = provider;
  } else {
    providers.push(provider);
  }
  saveProviders(providers);
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

function saveTargetLang(): void {
  if (!doc) {
    return;
  }
  const lang = inputValue("zctr-input-targetlang").trim();
  if (!lang) {
    win?.alert("目标语言不能为空，请输入语言代码，如 zh。");
    return;
  }
  setPref("targetLang", lang);
}

/** Bind the global translation settings (target language, streaming toggle). */
function bindGlobalSettings(): void {
  if (!doc) {
    return;
  }
  const streamingInput = doc.getElementById(
    "zctr-input-streaming",
  ) as HTMLInputElement | null;
  if (streamingInput) {
    streamingInput.checked = !!getPref("streaming");
    streamingInput.addEventListener("change", () => {
      setPref("streaming", streamingInput.checked);
    });
  }
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
  doc
    .getElementById("zctr-btn-save-targetlang")
    ?.addEventListener("click", saveTargetLang);
}
