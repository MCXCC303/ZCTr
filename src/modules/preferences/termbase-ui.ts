/**
 * Termbase manager UI (P2-M2 / T5) - runs inside the preference pane and is
 * wired from prefs-ui.ts. Renders the "术语表" section (list + entry editor)
 * and delegates ALL domain logic to the terminology layer: it never matches,
 * resolves or serializes itself (see ZCTr-modules-ARCHITECTURE.md §2).
 *
 * Responsibilities:
 * - list / create / delete termbases (store)
 * - import TSV / CSV / JSON, export JSON (io + store)
 * - search, add / update / remove entries (model shapes + store)
 */

import {listTermbases, saveTermbase, deleteTermbase} from "../terminology/store";
import {
	parseDelimited,
	parseTermbaseJson,
	termbaseFromRows,
	toJson,
} from "../terminology/io";
import {parseTbx, toTbx} from "../terminology/tbx";
import {
	TERMBASE_SCHEMA_VERSION,
	validateTermbase,
	type ConceptEntry,
	type Term,
	type Termbase,
	type TermStatus,
} from "../terminology/model";
import {getPref, PREFS, setPref} from "../../utils/prefs";
import {hEl, XHTML_NS} from "./provider-form";

let win: Window | null = null;
let doc: Document | null = null;
let termbases: Termbase[] = [];
let selectedId: string | null = null;
/** Concept being edited in the form (null = "add new entry" mode). */
let editingConceptId: string | null = null;

export async function registerTermbaseScripts(window: Window): Promise<void> {
	win = window;
	doc = window.document;
	selectedId = activeTermbaseId() || null;
	await refreshTermbases();
	bindEvents();
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

function get<T extends HTMLElement>(id: string): T | null {
	return (doc?.getElementById(id) as T | null) ?? null;
}

function inputValue(id: string): string {
	return (get<HTMLInputElement>(id)?.value ?? "").trim();
}

function setInputValue(id: string, value: string): void {
	const el = get<HTMLInputElement>(id);
	if (el) {
		el.value = value;
	}
}

function selectedTermbase(): Termbase | null {
	return termbases.find((tb) => tb.termbaseId === selectedId) ?? null;
}

/** Persisted active termbase id (restored after restart). */
function activeTermbaseId(): string {
	return (getPref(PREFS.ACTIVE_TERMBASE_ID) as string) || "";
}

function setActiveTermbase(id: string | null): void {
	setPref(PREFS.ACTIVE_TERMBASE_ID, id ?? "");
}

/** Primary source / target terms of a concept (preferred first, then id). */
function primaryTerm(entry: ConceptEntry, language: string): Term | undefined {
	return entry.terms
		.filter((t) => t.language === language)
		.sort((a, b) => {
			const rank = (s: TermStatus): number => (s === "preferred" ? 0 : 1);
			const d = rank(a.status) - rank(b.status);
			return d !== 0 ? d : a.termId.localeCompare(b.termId);
		})[0];
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

async function refreshTermbases(): Promise<void> {
	termbases = await listTermbases();
	if (selectedId && !termbases.some((tb) => tb.termbaseId === selectedId)) {
		selectedId = null;
	}
	const select = get<HTMLSelectElement>("zctr-termbase-select");
	if (select) {
		select.replaceChildren();
		const placeholder = doc!.createElementNS(XHTML_NS, "option") as HTMLOptionElement;
		placeholder.value = "";
		placeholder.textContent = termbases.length ? "选择术语库…" : "（无术语库）";
		select.append(placeholder);
		const activeId = activeTermbaseId();
		for (const tb of termbases) {
			const option = doc!.createElementNS(XHTML_NS, "option") as HTMLOptionElement;
			option.value = tb.termbaseId;
			option.textContent =
				tb.termbaseId === activeId
					? `${tb.name} (${tb.sourceLanguage}→${tb.targetLanguage}, ${tb.entries.length})（激活）`
					: `${tb.name} (${tb.sourceLanguage}→${tb.targetLanguage}, ${tb.entries.length})`;
			select.append(option);
		}
		select.value = selectedId ?? "";
	}
	renderMeta();
	renderEntries();
}

function renderMeta(): void {
	const meta = get("zctr-termbase-meta");
	const tb = selectedTermbase();
	meta!.textContent = tb
		? `术语库：${tb.name}\n术语翻译方向：${tb.sourceLanguage} → ${tb.targetLanguage}\n词条数：${tb.entries.length}\n创建于：${tb.updatedAt ? new Date(tb.updatedAt).toLocaleDateString() : "-"}\n最近修订于：${tb.updatedAt ? new Date(tb.updatedAt).toLocaleDateString() : "-"}\n描述：${tb.description ? tb.description : "-"}\n`
		: "术语库用于约束特定术语的译法。";
}

function renderEntries(): void {
	const container = get("zctr-termbase-entries");
	if (!container) {
		return;
	}
	container.replaceChildren();
	const tb = selectedTermbase();
	if (!tb) {
		return;
	}
	const query = inputValue("zctr-termbase-search").toLowerCase();
	const entries = tb.entries
		.filter((entry) => {
			if (!query) {
				return true;
			}
			return entry.terms.some((t) => t.text.toLowerCase().includes(query));
		})
		.sort((a, b) => a.conceptId.localeCompare(b.conceptId));

	for (const entry of entries) {
		const source = primaryTerm(entry, tb.sourceLanguage);
		const target = primaryTerm(entry, tb.targetLanguage);
		const row = doc!.createElementNS(XHTML_NS, "div") as HTMLDivElement;
		row.className = `zctr-termbase-entry${
			entry.conceptId === editingConceptId ? " is-active" : ""
		}${source?.status === "forbidden" ? " is-forbidden" : ""}`;
		const srcSpan = doc!.createElementNS(XHTML_NS, "span") as HTMLSpanElement;
		srcSpan.className = "zctr-termbase-entry-source";
		srcSpan.textContent = source?.text ?? "（缺源术语）";
		const tgtSpan = doc!.createElementNS(XHTML_NS, "span") as HTMLSpanElement;
		tgtSpan.className = "zctr-termbase-entry-target";
		tgtSpan.textContent = target?.text ?? "（缺目标术语）";
		row.append(srcSpan, tgtSpan);
		row.title = `${source?.status ?? ""} ${source?.note ?? ""}`.trim();
		row.addEventListener("click", () => {
			editingConceptId = entry.conceptId;
			loadEntryForm(tb, entry);
			renderEntries();
		});
		container.append(row);
	}
	if (!entries.length) {
		container.append(
			hEl("div", query ? "没有匹配的词条" : "（空术语库，使用下方表单新增词条）", "color: var(--zctr-text-secondary); font-size: small; padding: 4px;"),
		);
	}
}

function loadEntryForm(tb: Termbase, entry: ConceptEntry): void {
	const source = primaryTerm(entry, tb.sourceLanguage);
	const target = primaryTerm(entry, tb.targetLanguage);
	setInputValue("zctr-termbase-src", source?.text ?? "");
	setInputValue("zctr-termbase-tgt", target?.text ?? "");
	setInputValue("zctr-termbase-variants", (source?.variants ?? []).join(", "));
	setInputValue("zctr-termbase-note", source?.note ?? "");
	const statusSelect = get<HTMLSelectElement>("zctr-termbase-status");
	if (statusSelect) {
		statusSelect.value = source?.status ?? "preferred";
	}
}

function setStatusMessage(message: string): void {
	const label = get("zctr-termbase-status-msg");
	if (!label) {
		return;
	}
	label.textContent = message;
	setTimeout(() => {
		if (label.textContent === message) {
			label.textContent = "";
		}
	}, 3000);
}

// ---------------------------------------------------------------------------
// Entry CRUD
// ---------------------------------------------------------------------------

function formTermbase(): Termbase | null {
	const tb = selectedTermbase();
	if (!tb) {
		setStatusMessage("请先选择一个术语库");
		return null;
	}
	return tb;
}

/** Build a 2-term concept from the form (used for add and update). */
function formConcept(tb: Termbase, conceptId: string): ConceptEntry {
	const sourceText = inputValue("zctr-termbase-src");
	const targetText = inputValue("zctr-termbase-tgt");
	const status = (get<HTMLSelectElement>("zctr-termbase-status")?.value ??
		"preferred") as TermStatus;
	const variants = inputValue("zctr-termbase-variants")
		.split(",")
		.map((v) => v.trim())
		.filter((v) => !!v);
	const note = inputValue("zctr-termbase-note") || undefined;
	const now = Date.now();
	const makeTerm = (termId: string, language: string, text: string): Term => ({
		termId,
		language,
		text,
		status,
		...(variants.length && language === tb.sourceLanguage ? {variants} : {}),
		...(note ? {note} : {}),
	});
	return {
		conceptId,
		terms: [
			makeTerm(`${conceptId}-src`, tb.sourceLanguage, sourceText),
			makeTerm(`${conceptId}-tgt`, tb.targetLanguage, targetText),
		],
		...(note ? {notes: [note]} : {}),
		createdAt: now,
		updatedAt: now,
		schemaVersion: TERMBASE_SCHEMA_VERSION,
	};
}

function addEntry(): void {
	const tb = formTermbase();
	if (!tb) {
		return;
	}
	const sourceText = inputValue("zctr-termbase-src");
	const targetText = inputValue("zctr-termbase-tgt");
	if (!sourceText || !targetText) {
		setStatusMessage("源术语与目标术语不能为空");
		return;
	}
	const conceptId = `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
	tb.entries.push(formConcept(tb, conceptId));
	persistAndRefresh(tb, conceptId, "已新增词条");
}

function updateEntry(): void {
	const tb = formTermbase();
	if (!tb || !editingConceptId) {
		setStatusMessage("请先选择要更新的词条");
		return;
	}
	const idx = tb.entries.findIndex((e) => e.conceptId === editingConceptId);
	if (idx === -1) {
		setStatusMessage("词条不存在（可能已被删除）");
		editingConceptId = null;
		return;
	}
	const sourceText = inputValue("zctr-termbase-src");
	const targetText = inputValue("zctr-termbase-tgt");
	if (!sourceText || !targetText) {
		setStatusMessage("源术语与目标术语不能为空");
		return;
	}
	// Preserve non-primary terms (e.g. extra languages) untouched.
	const old = tb.entries[idx];
	const fresh = formConcept(tb, editingConceptId);
	const extra = old.terms.filter(
		(t) =>
			t.language !== tb.sourceLanguage && t.language !== tb.targetLanguage,
	);
	tb.entries[idx] = {...fresh, terms: [...fresh.terms, ...extra]};
	persistAndRefresh(tb, editingConceptId, "已更新词条");
}

function removeEntry(): void {
	const tb = formTermbase();
	if (!tb || !editingConceptId) {
		setStatusMessage("请先选择要删除的词条");
		return;
	}
	tb.entries = tb.entries.filter((e) => e.conceptId !== editingConceptId);
	editingConceptId = null;
	persistAndRefresh(tb, null, "已删除词条");
}

async function persistAndRefresh(
	tb: Termbase,
	selectConceptId: string | null,
	message: string,
): Promise<void> {
	tb.updatedAt = Date.now();
	try {
		await saveTermbase(tb);
	} catch (error) {
		setStatusMessage(`保存失败: ${(error as Error).message}`);
		return;
	}
	editingConceptId = selectConceptId;
	await refreshTermbases();
	setStatusMessage(message);
}

// ---------------------------------------------------------------------------
// Termbase CRUD + import/export
// ---------------------------------------------------------------------------

function slugify(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
			.replace(/^-+|-+$/g, "") || "termbase"
	);
}

async function createTermbase(): Promise<void> {
	if (!win) {
		return;
	}
	const name = promptText("新建术语库", "术语库名称（如 NLP EN-ZH）", "NLP EN-ZH");
	if (name === null) {
		return;
	}
	const languages = promptText("新建术语库", "源语言,目标语言（如 en,zh）", "en,zh");
	if (languages === null) {
		return;
	}
	const [source, target] = languages.split(",").map((s) => s.trim());
	if (!source || !target || source === target) {
		alertUser("新建术语库", "语言对格式应为“源,目标”（如 en,zh-CN）");
		return;
	}
	const now = Date.now();
	const termbase: Termbase = {
		termbaseId: `${slugify(name)}-${now.toString(36)}`,
		name,
		sourceLanguage: source,
		targetLanguage: target,
		entries: [],
		createdAt: now,
		updatedAt: now,
		schemaVersion: TERMBASE_SCHEMA_VERSION,
	};
	try {
		await saveTermbase(termbase);
	} catch (error) {
		setStatusMessage(`新建失败: ${(error as Error).message}`);
		return;
	}
	selectedId = termbase.termbaseId;
	setActiveTermbase(selectedId);
	await refreshTermbases();
	setStatusMessage("已新建术语库");
}

async function removeTermbase(): Promise<void> {
	if (!win) {
		return;
	}
	const tb = formTermbase();
	if (!tb) {
		return;
	}
	if (!confirmUser(`确定删除术语库“${tb.name}”？（文件将被移除）`)) {
		return;
	}
	await deleteTermbase(tb.termbaseId);
	if (selectedId === tb.termbaseId) {
		setActiveTermbase(null);
	}
	selectedId = null;
	editingConceptId = null;
	await refreshTermbases();
	setStatusMessage("已删除术语库");
}

/** Lazily load Zotero's own FilePicker wrapper (version-adaptive: it handles
 * the nsIFilePicker API changes between Firefox versions, e.g. show() ->
 * open(callback), and returns `file` as a path STRING). */
let FilePickerCtor: any = null;
function getFilePickerCtor(): any {
	if (!FilePickerCtor) {
		const mod = (ChromeUtils as any).importESModule(
			"chrome://zotero/content/modules/filePicker.mjs",
		);
		FilePickerCtor = mod.FilePicker;
	}
	return FilePickerCtor;
}

/** Opens the native file picker; resolves to the selected PATH STRING (or
 * null on cancel/error). */
function pickFile(title: string, save: boolean, defaultName: string): Promise<string | null> {
	return new Promise((resolve) => {
		if (!win) {
			resolve(null);
			return;
		}
		try {
			const FilePickerCtor = getFilePickerCtor();
			const fp = new FilePickerCtor();
			fp.init(win, title, save ? fp.modeSave : fp.modeOpen);
			if (save) {
				fp.defaultString = defaultName;
				fp.appendFilter("JSON 术语库", "*.json");
			} else {
				fp.appendFilter("术语库文件", "*.tsv;*.csv;*.txt;*.json;*.tbx;*.xml");
			}
			fp.show()
				.then((ret: number) => {
					const ok = save
						? ret === fp.returnOK || ret === fp.returnReplace
						: ret === fp.returnOK;
					resolve(ok ? (fp.file as string) : null);
				})
				.catch((error: unknown) => {
					ztoolkit.log("[ZCTr] File picker failed:", error);
					resolve(null);
				});
		} catch (error) {
			ztoolkit.log("[ZCTr] File picker init failed:", error);
			resolve(null);
		}
	});
}

async function importTermbase(): Promise<void> {
	const file = await pickFile("导入术语库", false, "");
	if (!file) {
		return;
	}
	try {
		// Zotero's FilePicker returns a path STRING; convert for nsIFile APIs.
		const content = await (Zotero.File as any).getContentsAsync(
			Zotero.File.pathToFile(file),
		);
		const fileName = String(file).split(/[\\/]/).pop() || "";
		const lower = fileName.toLowerCase();
		let termbase: Termbase;
		if (lower.endsWith(".json")) {
			termbase = parseTermbaseJson(content);
			const issues = validateTermbase(termbase);
			if (issues.length) {
				alertUser(
					"导入术语库",
					`JSON 校验失败：\n${issues.slice(0, 6).join("\n")}`,
				);
				return;
			}
		} else if (lower.endsWith(".tbx") || lower.endsWith(".xml")) {
			// TBX has no language-pair concept; ask for the pair once.
			const name = fileName.replace(/\.(tbx|xml)$/i, "") || "Imported";
			const pair = promptTermbasePair();
			if (pair === null) {
				return;
			}
			termbase = parseTbx(content, {
				termbaseId: `${slugify(name)}-${Date.now().toString(36)}`,
				name,
				sourceLanguage: pair.source,
				targetLanguage: pair.target,
			});
			if (!termbase.entries.length) {
				alertUser("导入术语库", "TBX 中未解析到任何 termEntry");
				return;
			}
		} else {
			// TSV / CSV / TXT with delimiter auto-detection.
			const rows = parseDelimited(content);
			if (!rows.length) {
				alertUser("导入术语库", "未解析到任何术语行（支持 TSV/CSV/TXT）");
				return;
			}
			const name = fileName.replace(/\.(tsv|csv|txt)$/i, "") || "Imported";
			const pair = promptTermbasePair();
			if (pair === null) {
				return;
			}
			termbase = termbaseFromRows(rows, {
				termbaseId: `${slugify(name)}-${Date.now().toString(36)}`,
				name,
				sourceLanguage: pair.source,
				targetLanguage: pair.target,
			});
		}
		await saveTermbase(termbase);
		selectedId = termbase.termbaseId;
		setActiveTermbase(selectedId);
		editingConceptId = null;
		await refreshTermbases();
		setStatusMessage(`已导入 ${termbase.entries.length} 个词条`);
	} catch (error) {
		setStatusMessage(`导入失败: ${(error as Error).message}`);
	}
}

async function exportTermbaseTbx(): Promise<void> {
	const tb = formTermbase();
	if (!tb) {
		return;
	}
	const file = await pickFile("导出术语库 (TBX)", true, `${tb.termbaseId}.tbx`);
	if (!file) {
		return;
	}
	try {
		await (Zotero.File as any).putContentsAsync(file, toTbx(tb));
		setStatusMessage("已导出 TBX");
	} catch (error) {
		setStatusMessage(`导出失败: ${(error as Error).message}`);
	}
}

async function exportTermbase(): Promise<void> {
	const tb = formTermbase();
	if (!tb) {
		return;
	}
	const file = await pickFile("导出术语库", true, `${tb.termbaseId}.json`);
	if (!file) {
		return;
	}
	try {
		await (Zotero.File as any).putContentsAsync(file, toJson(tb));
		setStatusMessage("已导出 JSON");
	} catch (error) {
		setStatusMessage(`导出失败: ${(error as Error).message}`);
	}
}

/** Modal text prompt; returns null on cancel OR when the prompter fails
 * (Zotero 10 beta Prompter regressions degrade to cancel, never crash). */
/** Ask for "source,target" (e.g. en,zh-CN); null on cancel/invalid. */
function promptTermbasePair(): {source: string; target: string} | null {
	const languages = promptText(
		"导入术语库",
		"源语言,目标语言（如 en,zh）",
		"en,zh",
	);
	if (languages === null) {
		return null;
	}
	const [source, target] = languages.split(",").map((s) => s.trim());
	if (!source || !target || source === target) {
		alertUser("导入术语库", "语言对格式应为“源,目标”");
		return null;
	}
	return {source, target};
}

function promptText(title: string, message: string, defaultValue: string): string | null {
	if (!win) {
		return null;
	}
	try {
		const rv = {value: defaultValue};
		const ok = Services.prompt.prompt(win as any, title, message, rv, "", {value: false});
		return ok ? rv.value.trim() : null;
	} catch (error) {
		ztoolkit.log(`[ZCTr] Prompt failed (${title}):`, error);
		return null;
	}
}

/** Non-throwing alert; failures are logged instead of breaking the flow. */
function alertUser(title: string, message: string): void {
	try {
		Services.prompt.alert(win as any, title, message);
	} catch (error) {
		ztoolkit.log(`[ZCTr] Alert failed (${title}):`, error);
	}
}

/** Non-throwing confirm; false on cancel or prompter failure. */
function confirmUser(message: string): boolean {
	if (!win) {
		return false;
	}
	try {
		return Services.prompt.confirm(win as any, "ZCTr", message);
	} catch (error) {
		ztoolkit.log("[ZCTr] Confirm failed:", error);
		return false;
	}
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function bindEvents(): void {
	get("zctr-termbase-select")?.addEventListener("change", (event) => {
		selectedId = (event.target as HTMLSelectElement).value || null;
		editingConceptId = null;
		setActiveTermbase(selectedId);
		renderMeta();
		renderEntries();
	});
	get("zctr-termbase-new")?.addEventListener("click", () => void createTermbase());
	get("zctr-termbase-delete")?.addEventListener("click", () => void removeTermbase());
	get("zctr-termbase-import")?.addEventListener("click", () => void importTermbase());
	get("zctr-termbase-export")?.addEventListener("click", () => void exportTermbase());
	get("zctr-termbase-export-tbx")?.addEventListener("click", () => void exportTermbaseTbx());
	get("zctr-termbase-search")?.addEventListener("input", () => renderEntries());
	get("zctr-termbase-add")?.addEventListener("click", addEntry);
	get("zctr-termbase-update")?.addEventListener("click", updateEntry);
	get("zctr-termbase-remove")?.addEventListener("click", removeEntry);
}
