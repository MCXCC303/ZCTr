import {reloadTermbases, saveTermbase, deleteTermbase} from "../terminology/store";
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
import {getString} from "../../utils/locale";
import {hEl, XHTML_NS} from "./provider-form";
import * as zlog from "../../utils/logger";

let win: Window | null = null;
let doc: Document | null = null;
let termbases: Termbase[] = [];
let selectedId: string | null = null;
/** Concept being edited in the form (null = "add new entry" mode). */
let editingConceptId: string | null = null;

const ENTRY_RENDER_LIMIT = 200;

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

function activeTermbaseId(): string {
	return (getPref(PREFS.ACTIVE_TERMBASE_ID) as string) || "";
}

function setActiveTermbase(id: string | null): void {
	setPref(PREFS.ACTIVE_TERMBASE_ID, id ?? "");
}

function primaryTerm(entry: ConceptEntry, language: string): Term | undefined {
	return entry.terms
		.filter((t) => t.language === language)
		.sort((a, b) => {
			const rank = (s: TermStatus): number => (s === "preferred" ? 0 : 1);
			const d = rank(a.status) - rank(b.status);
			return d !== 0 ? d : a.termId.localeCompare(b.termId);
		})[0];
}

/// Rendering

async function refreshTermbases(): Promise<void> {
	termbases = await reloadTermbases();
	if (selectedId && !termbases.some((tb) => tb.termbaseId === selectedId)) {
		selectedId = null;
	}
	const select = get<HTMLSelectElement>("zctr-termbase-select");
	if (select) {
		select.replaceChildren();
		const placeholder = doc!.createElementNS(XHTML_NS, "option") as HTMLOptionElement;
		placeholder.value = "";
		placeholder.textContent = termbases.length
			? getString("tb-select-placeholder")
			: getString("tb-select-empty");
		select.append(placeholder);
		const activeId = activeTermbaseId();
		for (const tb of termbases) {
			const option = doc!.createElementNS(XHTML_NS, "option") as HTMLOptionElement;
			option.value = tb.termbaseId;
			const args = {
				name: tb.name,
				src: tb.sourceLanguage,
				tgt: tb.targetLanguage,
				count: tb.entries.length,
			};
			option.textContent =
				tb.termbaseId === activeId
					? getString("tb-option-active", {args})
					: getString("tb-option", {args});
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
		? getString("tb-meta", {
		args: {
			name: tb.name,
			src: tb.sourceLanguage,
			tgt: tb.targetLanguage,
			count: tb.entries.length,
			created: tb.updatedAt
				? new Date(tb.updatedAt).toLocaleDateString()
				: "-",
			updated: tb.updatedAt
				? new Date(tb.updatedAt).toLocaleDateString()
				: "-",
			description: tb.description ? tb.description : "-",
		},
	}) + "\n"
		: getString("tb-meta-hint");
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

	const visible = entries.slice(0, ENTRY_RENDER_LIMIT);
	for (const entry of visible) {
		const source = primaryTerm(entry, tb.sourceLanguage);
		const target = primaryTerm(entry, tb.targetLanguage);
		const row = doc!.createElementNS(XHTML_NS, "div") as HTMLDivElement;
		row.className = `zctr-termbase-entry${
			entry.conceptId === editingConceptId ? " is-active" : ""
		}${source?.status === "forbidden" ? " is-forbidden" : ""}`;
		const srcSpan = doc!.createElementNS(XHTML_NS, "span") as HTMLSpanElement;
		srcSpan.className = "zctr-termbase-entry-source";
		srcSpan.textContent = source?.text ?? getString("tb-missing-source");
		const tgtSpan = doc!.createElementNS(XHTML_NS, "span") as HTMLSpanElement;
		tgtSpan.className = "zctr-termbase-entry-target";
		tgtSpan.textContent = target?.text ?? getString("tb-missing-target");
		row.append(srcSpan, tgtSpan);
		row.title = `${source?.status ?? ""} ${source?.note ?? ""}`.trim();
		row.addEventListener("click", () => {
			editingConceptId = entry.conceptId;
			loadEntryForm(tb, entry);
			// re-render whole list will freeze the pane with large termbases
			container
				.querySelectorAll<HTMLElement>(".zctr-termbase-entry.is-active")
				.forEach((el: HTMLElement) => el.classList.remove("is-active"));
			row.classList.add("is-active");
		});
		container.append(row);
	}
	if (entries.length > ENTRY_RENDER_LIMIT) {
		container.append(
			hEl(
				"div",
				getString("tb-entries-truncated", {
					args: {count: entries.length, max: ENTRY_RENDER_LIMIT},
				}),
				"color: var(--zctr-text-secondary); font-size: small; padding: 4px;",
			),
		);
	}
	if (!entries.length) {
		container.append(
			hEl(
				"div",
				query ? getString("tb-entries-no-match") : getString("tb-entries-empty"),
				"color: var(--zctr-text-secondary); font-size: small; padding: 4px;",
			),
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

/// Entry CRUD

function formTermbase(): Termbase | null {
	const tb = selectedTermbase();
	if (!tb) {
		setStatusMessage(getString("tb-msg-no-termbase-selected"));
		return null;
	}
	return tb;
}

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
		setStatusMessage(getString("tb-msg-terms-required"));
		return;
	}
	const conceptId = `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
	tb.entries.push(formConcept(tb, conceptId));
	persistAndRefresh(tb, conceptId, getString("tb-msg-entry-added"));
}

function updateEntry(): void {
	const tb = formTermbase();
	if (!tb || !editingConceptId) {
		setStatusMessage(getString("tb-msg-select-entry-to-update"));
		return;
	}
	const idx = tb.entries.findIndex((e) => e.conceptId === editingConceptId);
	if (idx === -1) {
		setStatusMessage(getString("tb-msg-entry-missing"));
		editingConceptId = null;
		return;
	}
	const sourceText = inputValue("zctr-termbase-src");
	const targetText = inputValue("zctr-termbase-tgt");
	if (!sourceText || !targetText) {
		setStatusMessage(getString("tb-msg-terms-required"));
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
	persistAndRefresh(tb, editingConceptId, getString("tb-msg-entry-updated"));
}

function removeEntry(): void {
	const tb = formTermbase();
	if (!tb || !editingConceptId) {
		setStatusMessage(getString("tb-msg-select-entry-to-delete"));
		return;
	}
	tb.entries = tb.entries.filter((e) => e.conceptId !== editingConceptId);
	editingConceptId = null;
	persistAndRefresh(tb, null, getString("tb-msg-entry-removed"));
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
		setStatusMessage(
			getString("tb-msg-save-failed", {
				args: {detail: (error as Error).message},
			}),
		);
		return;
	}
	zlog.info(`Entry operation: ${message} termbase=${tb.termbaseId} entries=${tb.entries.length}`);
	editingConceptId = selectConceptId;
	await refreshTermbases();
	setStatusMessage(message);
}

/// Termbase CRUD + import/export

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
	const name = promptText(
		getString("tb-new-title"),
		getString("tb-new-name-prompt"),
		"NLP EN-ZH",
	);
	if (name === null) {
		return;
	}
	const languages = promptText(
		getString("tb-new-title"),
		getString("tb-pair-prompt"),
		"en,zh",
	);
	if (languages === null) {
		return;
	}
	const [source, target] = languages.split(",").map((s) => s.trim());
	if (!source || !target || source === target) {
		alertUser(getString("tb-new-title"), getString("tb-new-pair-invalid"));
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
		setStatusMessage(
			getString("tb-msg-create-failed", {
				args: {detail: (error as Error).message},
			}),
		);
		return;
	}
	zlog.info(`Termbase created: ${termbase.termbaseId} (${termbase.sourceLanguage}→${termbase.targetLanguage})`);
	selectedId = termbase.termbaseId;
	setActiveTermbase(selectedId);
	await refreshTermbases();
	setStatusMessage(getString("tb-msg-created"));
}

async function removeTermbase(): Promise<void> {
	if (!win) {
		return;
	}
	const tb = formTermbase();
	if (!tb) {
		return;
	}
	if (!confirmUser(getString("tb-confirm-delete", {args: {name: tb.name}}))) {
		return;
	}
	await deleteTermbase(tb.termbaseId);
	zlog.info(`Termbase deleted: ${tb.termbaseId}`);
	if (selectedId === tb.termbaseId) {
		setActiveTermbase(null);
	}
	selectedId = null;
	editingConceptId = null;
	await refreshTermbases();
	setStatusMessage(getString("tb-msg-deleted"));
}

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
				fp.appendFilter(getString("tb-filter-json"), "*.json");
			} else {
				fp.appendFilter(getString("tb-filter-all"), "*.tsv;*.csv;*.txt;*.json;*.tbx;*.xml");
			}
			fp.show()
				.then((ret: number) => {
					const ok = save
						? ret === fp.returnOK || ret === fp.returnReplace
						: ret === fp.returnOK;
					resolve(ok ? (fp.file as string) : null);
				})
				.catch((error: unknown) => {
					zlog.warn("File picker failed:", error);
					resolve(null);
				});
		} catch (error) {
			zlog.warn("File picker init failed:", error);
			resolve(null);
		}
	});
}

async function importTermbase(): Promise<void> {
	const file = await pickFile(getString("tb-import-title"), false, "");
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
					getString("tb-import-title"),
					getString("tb-import-json-invalid", {
						args: {detail: issues.slice(0, 6).join("\n")},
					}),
				);
				return;
			}
		} else if (lower.endsWith(".tbx") || lower.endsWith(".xml")) {
			const name = fileName.replace(/\.(tbx|xml)$/i, "") || getString("tb-import-default-name");
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
				alertUser(getString("tb-import-title"), getString("tb-import-tbx-empty"));
				return;
			}
		} else {
			// TSV / CSV / TXT with delimiter auto-detection.
			const rows = parseDelimited(content);
			if (!rows.length) {
				alertUser(getString("tb-import-title"), getString("tb-import-rows-empty"));
				return;
			}
			const name = fileName.replace(/\.(tsv|csv|txt)$/i, "") || getString("tb-import-default-name");
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
		zlog.info(`Termbase imported: ${termbase.termbaseId} (${lower}) entries=${termbase.entries.length}`);
		selectedId = termbase.termbaseId;
		setActiveTermbase(selectedId);
		editingConceptId = null;
		await refreshTermbases();
		setStatusMessage(
			getString("tb-msg-imported", {args: {count: termbase.entries.length}}),
		);
	} catch (error) {
		setStatusMessage(
			getString("tb-msg-import-failed", {
				args: {detail: (error as Error).message},
			}),
		);
	}
}

async function exportTermbaseTbx(): Promise<void> {
	const tb = formTermbase();
	if (!tb) {
		return;
	}
	const file = await pickFile(getString("tb-export-tbx-title"), true, `${tb.termbaseId}.tbx`);
	if (!file) {
		return;
	}
	try {
		await (Zotero.File as any).putContentsAsync(file, toTbx(tb));
		zlog.info(`Termbase exported as TBX: ${tb.termbaseId} → ${file}`);
		setStatusMessage(getString("tb-msg-exported-tbx"));
	} catch (error) {
		setStatusMessage(
			getString("tb-msg-export-failed", {
				args: {detail: (error as Error).message},
			}),
		);
	}
}

async function exportTermbase(): Promise<void> {
	const tb = formTermbase();
	if (!tb) {
		return;
	}
	const file = await pickFile(getString("tb-export-title"), true, `${tb.termbaseId}.json`);
	if (!file) {
		return;
	}
	try {
		await (Zotero.File as any).putContentsAsync(file, toJson(tb));
		zlog.info(`Termbase exported as JSON: ${tb.termbaseId} → ${file}`);
		setStatusMessage(getString("tb-msg-exported-json"));
	} catch (error) {
		setStatusMessage(
			getString("tb-msg-export-failed", {
				args: {detail: (error as Error).message},
			}),
		);
	}
}

function promptTermbasePair(): { source: string; target: string } | null {
	const languages = promptText(
		getString("tb-import-title"),
		getString("tb-pair-prompt"),
		"en,zh",
	);
	if (languages === null) {
		return null;
	}
	const [source, target] = languages.split(",").map((s) => s.trim());
	if (!source || !target || source === target) {
		alertUser(getString("tb-import-title"), getString("tb-import-pair-invalid"));
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
		zlog.warn(`Prompt failed (${title}):`, error);
		return null;
	}
}

function alertUser(title: string, message: string): void {
	try {
		Services.prompt.alert(win as any, title, message);
	} catch (error) {
		zlog.warn(`Alert failed (${title}):`, error);
	}
}

function confirmUser(message: string): boolean {
	if (!win) {
		return false;
	}
	try {
		return Services.prompt.confirm(win as any, "ZCTr", message);
	} catch (error) {
		zlog.warn("Confirm failed:", error);
		return false;
	}
}

/// Events

function bindEvents(): void {
	get("zctr-termbase-select")?.addEventListener("change", (event) => {
		selectedId = (event.target as HTMLSelectElement).value || null;
		editingConceptId = null;
		setActiveTermbase(selectedId);
		zlog.info(`Termbase activation changed: ${selectedId ?? "(none)"}`);
		renderMeta();
		renderEntries();
	});
	get("zctr-termbase-new")?.addEventListener("click", () => void createTermbase());
	get("zctr-termbase-delete")?.addEventListener("click", () => void removeTermbase());
	get("zctr-termbase-import")?.addEventListener("click", () => void importTermbase());
	get("zctr-termbase-refresh")?.addEventListener("click", () => {
		void refreshTermbases()
			.then(() => setStatusMessage(getString("tb-msg-refreshed")))
			.catch((error) =>
				setStatusMessage(
					getString("tb-msg-refresh-failed", {
						args: {detail: (error as Error).message},
					}),
				),
			);
	});
	get("zctr-termbase-export")?.addEventListener("click", () => void exportTermbase());
	get("zctr-termbase-export-tbx")?.addEventListener("click", () => void exportTermbaseTbx());
	get("zctr-termbase-search")?.addEventListener("input", () => renderEntries());
	get("zctr-termbase-add")?.addEventListener("click", addEntry);
	get("zctr-termbase-update")?.addEventListener("click", updateEntry);
	get("zctr-termbase-remove")?.addEventListener("click", removeEntry);
}
