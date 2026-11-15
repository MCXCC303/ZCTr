# The build renames this file to `zctr-addon.ftl` and prefixes every id with
# `zctr-`; getString() (src/utils/locale.ts) and the `data-l10n-id` attributes
# in addon/content/preferences.xhtml use the same prefixed ids.

# Add-on name
addon-name = ZCTr

# Reader context-menu entry
menu-translate = ZCTr Translate

# Translation popup
popup-title = ZCTr Translate
popup-close = Close
popup-cache-badge = ⚡ Cache
popup-cache-title = This translation came from the local cache
popup-collect = ＋ Add term
popup-collect-title = Save the current selection and its translation as a term in a termbase
popup-collected = ✓ Saved
popup-keep-original = (keep original)
popup-no-provider = ⚠ No translation provider is configured. Add and activate one in ZCTr settings.
popup-error = ⚠ Translation failed: { $detail }
popup-retry = Retry
popup-translating = Translating…

# Preferences pane: strings used from JavaScript (the XHTML side is the pref-* group below)
prefs-init-error = Could not initialize ZCTr settings: { $detail }
pref-provider-empty = No providers yet. Click “Add provider” below to get started.
pref-provider-active = ● Active
pref-error-name-required = Name cannot be empty.
pref-error-shortcut-modifier = The shortcut must include at least one modifier key (Ctrl / Alt / Shift / ⌘).
pref-context-level-selection = Selection only, no context attached
pref-context-level-local = Sentence + current paragraph + section title (+ adjacent paragraphs)
pref-context-level-semantic = Sentence + current paragraph + section title + item title + abstract
pref-context-level-adaptive = Sentence + current paragraph + section title (+ item title + abstract)

# Provider types and forms
provider-type-openai = OpenAI-compatible
provider-type-deepseek = DeepSeek
provider-type-ollama = Ollama
openai-error-baseurl = API Base URL cannot be empty.
openai-error-model = Model cannot be empty.
ollama-error-select-model = Test the Ollama connection first, then choose a model.
ollama-saved = { $model } (saved; test the connection to refresh)
ollama-option-test-first = Test the connection first
ollama-option-no-models = No installed models detected
ollama-testing = Testing…
ollama-connected = ✓ Connected — { $count } models found: { $models }
ollama-connected-empty = ✓ Connected (no installed models detected)
ollama-failed = ✗ Connection failed: { $detail }
error-ollama-unreachable = Could not reach the Ollama service

# Target-language dropdown (labels follow the UI language; prompts use the English names)
lang-zh = Chinese
lang-en = English
lang-ja = Japanese
lang-ko = Korean
lang-fr = French
lang-de = German
lang-ru = Russian
lang-es = Spanish
lang-it = Italian
lang-pt = Portuguese
lang-ar = Arabic
lang-th = Thai
lang-vi = Vietnamese

# Termbase validation / storage (errors shown in import and save alerts)
termbase-error-id = termbaseId cannot be empty
termbase-error-source-language = sourceLanguage cannot be empty
termbase-error-target-language = targetLanguage cannot be empty
termbase-error-same-language = sourceLanguage and targetLanguage must differ
termbase-error-entries = entries must be an array
termbase-error-concept-id = entry is missing conceptId
termbase-error-missing-pair = entry { $id } has no { $source } or { $target } term
termbase-error-empty-term = entry { $id } contains an empty term
termbase-error-no-id = (no id)
termbase-error-access-dir = Cannot access the termbase directory
termbase-error-validation = Termbase validation failed: { $detail }

# Term collection (write side) language-pair / duplicate refusals
term-error-not-found = The termbase does not exist or cannot be read; please reopen the collection window.
term-error-empty = Source and target terms cannot be empty.
term-error-doc-language = The termbase language pair { $source } → { $target } conflicts with the document language ({ $docLang }): the source term would never match. Choose a termbase with a matching language pair.
term-error-target-language = The termbase language pair { $source } → { $target } does not match the current translation target ({ $targetLang }). Choose a termbase with a matching language pair.
term-error-duplicate = The source term “{ $term }” already exists in termbase “{ $name }” (entry { $conceptId }).
term-error-save = Save failed: { $detail }

# Preferences pane (data-l10n-id in addon/content/preferences.xhtml)

pref-section-providers = Providers
pref-btn-add-provider = Add provider
pref-label-provider-type = Provider type
pref-type-openai = OpenAI-compatible
pref-label-provider-name = Name
pref-placeholder-provider-name = e.g. My DeepSeek / Local Ollama
pref-label-baseurl = API Base URL
pref-label-model = Model
pref-placeholder-model = e.g. gpt-4o-mini
pref-ollama-test-first = Test the connection first
pref-label-ollama-port = Ollama port
pref-btn-test-connection = Test connection
pref-label-apikey = API Key
pref-btn-save = Save
pref-btn-set-active = Set active
pref-btn-delete = Delete

pref-section-termbase = Terminology
pref-label-termbase-enabled = Enable term matching and injection
pref-desc-termbase-scope = ZCTr matches terms against the selected termbase only; with no active termbase it uses every compatible termbase
pref-termbase-new = New
pref-termbase-delete = Delete
pref-termbase-import = Import
pref-termbase-refresh = Refresh
pref-termbase-export-json = Export JSON
pref-termbase-export-tbx = Export TBX
pref-termbase-search-placeholder = Search entries…
pref-termbase-entries-title = Entry editor
pref-termbase-src = Source term
pref-termbase-tgt = Target term
pref-termbase-status = Status
pref-termbase-variants = Variants (comma-separated)
pref-termbase-note = Note
pref-termbase-add = Add entry
pref-termbase-update = Update entry
pref-termbase-remove = Delete entry
pref-termbase-none = (no termbases)
pref-termbase-status-preferred = Preferred
pref-termbase-status-admitted = Admitted
pref-termbase-status-forbidden = Forbidden
pref-termbase-status-deprecated = Deprecated

pref-section-global = Global
pref-section-translation = Translation
pref-label-target-lang = Target language
pref-label-shortcut = Translate shortcut
pref-placeholder-shortcut = Click, then press a key combination; Esc clears
pref-label-streaming = Use streaming output

pref-section-generation = Generation parameters
pref-desc-advanced-params = Advanced parameters (only applied by providers/models that support them)
pref-placeholder-default = Default

pref-section-context = Context
pref-label-context-level = Context level
pref-label-context-abstract = Include abstract
pref-label-context-title = Include item title
pref-label-context-section-title = Include section title (when available)
pref-label-context-adjacent = Include adjacent paragraphs
pref-desc-context = Context is only used to disambiguate references and terminology; it is never part of the translated output
pref-label-context-terminology = Include terminology

pref-section-cache = Cache
pref-label-cache-persist = Persist translation cache
pref-label-cache-limit-memory = Cache queue length (memory)
pref-label-cache-limit-file = Cache queue length (file)
pref-desc-cache-limit = -1 means unlimited (an ever-growing cache can slow Zotero down)

pref-section-log = Logging
pref-label-log-level = Log level

# Collect-term dialog (src/modules/reader/collect-term.ts)

# Window title and status labels (the status values preferred/admitted/forbidden/deprecated themselves stay unlocalized)
collect-title = Collect Term
collect-status-preferred = Preferred
collect-status-admitted = Admitted
collect-status-forbidden = Forbidden
collect-status-deprecated = Deprecated

# Alerts ($detail is the technical message)
collect-error-load-termbases = Could not load termbases: { $detail }
collect-error-no-termbase = No termbases yet. Create or import one first.
collect-error-open-window = Could not open the collect window.
collect-error-init-window = Could not initialize the window: { $detail }
collect-alert-rejected = Cannot Collect

# Form
collect-section-termbases = Termbase
collect-termbase-option = { $name } ({ $source } → { $target } · { $count } entries)
collect-field-source = Source term
collect-field-source-placeholder = Source-language term (defaults to the selection, editable)
collect-field-target = Target term
collect-field-target-placeholder = Target-language translation (defaults to the translation, editable)
collect-field-status = Status
collect-field-note = Note
collect-field-note-placeholder = Optional, e.g. use "fine-tuning", not "instruction tuning"
collect-hint-language-pair = Language pair: { $source } → { $target }
collect-hint-context = Context: document language { $docLang } · translation target { $target }
collect-unknown = unknown
collect-hint-footer = Note: entries that duplicate an existing term or conflict with the language pair are rejected.
collect-button-cancel = Cancel
collect-button-collect = Collect
# Termbase manager (src/modules/preferences/termbase-ui.ts)

tb-select-placeholder = Select a termbase…
tb-select-empty = (no termbase)
tb-option = { $name } ({ $src }→{ $tgt }, { $count })
tb-option-active = { $name } ({ $src }→{ $tgt }, { $count }) (active)
tb-meta =
    Termbase: { $name }
    Language pair: { $src } → { $tgt }
    Entries: { $count }
    Created: { $created }
    Last modified: { $updated }
    Description: { $description }
tb-meta-hint = Termbases constrain how specific terms are translated.
tb-missing-source = (missing source term)
tb-missing-target = (missing target term)
tb-entries-truncated = { $count } matches; showing only the first { $max }. Use the search box above to filter.
tb-entries-no-match = No matching entries
tb-entries-empty = (empty termbase; add entries with the form below)
tb-msg-no-termbase-selected = Select a termbase first
tb-msg-terms-required = Source and target terms cannot be empty
tb-msg-entry-added = Entry added
tb-msg-select-entry-to-update = Select an entry to update first
tb-msg-entry-missing = Entry not found (it may have been deleted)
tb-msg-entry-updated = Entry updated
tb-msg-select-entry-to-delete = Select an entry to delete first
tb-msg-entry-removed = Entry deleted
tb-msg-save-failed = Save failed: { $detail }
tb-msg-create-failed = Could not create the termbase: { $detail }
tb-new-title = New Termbase
tb-new-name-prompt = Termbase name (e.g. NLP EN-ZH)
tb-pair-prompt = Source,target languages (e.g. en,zh)
tb-new-pair-invalid = Language pair must be "source,target" (e.g. en,zh-CN).
tb-msg-created = Termbase created
tb-confirm-delete = Delete the termbase "{ $name }"? (the file will be removed)
tb-msg-deleted = Termbase deleted
tb-filter-json = JSON Termbase
tb-filter-all = Termbase Files
tb-import-title = Import Termbase
tb-import-json-invalid =
    JSON validation failed:
    { $detail }
tb-import-tbx-empty = No termEntry elements found in the TBX file
tb-import-rows-empty = No term rows found (TSV/CSV/TXT are supported)
tb-import-default-name = Imported
tb-msg-imported =
    { $count ->
        [one] Imported 1 entry
       *[other] Imported { $count } entries
    }
tb-msg-import-failed = Import failed: { $detail }
tb-export-tbx-title = Export Termbase (TBX)
tb-msg-exported-tbx = TBX exported
tb-msg-export-failed = Export failed: { $detail }
tb-export-title = Export Termbase
tb-msg-exported-json = JSON exported
tb-import-pair-invalid = Language pair must be "source,target".
tb-msg-refreshed = Termbases reloaded from disk
tb-msg-refresh-failed = Refresh failed: { $detail }