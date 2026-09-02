<h1 align="center">ZCTr</h1>
<p align="center">
  <b>Click-to-translate plugin for Zotero</b>
</p>
<p align="center">
  <img src="https://raw.githubusercontent.com/MCXCC303/images/main/AI%20TransMate/screenshot_2026-08-05-215717.png" width="720">
</p>
<p align="center">
  <img src="https://github.com/MCXCC303/ZCTr/actions/workflows/ci.yml/badge.svg">
  <img src="https://img.shields.io/github/v/release/MCXCC303/ZCTr">
  <img src="https://img.shields.io/badge/Zotero-7.0+-%23CC2936">
  <img src="https://img.shields.io/badge/LICENSE-AGPL--3.0-black">
</p>

---

This is an extremely simple & powerful translate plugin for Zotero.

## Installation

1. Build the plugin: `npm install && npm run build`
2. In Zotero: `Tools -> Add-ons -> ⚙️ -> Install Add-on From File…`, choose `build/zc-tr.xpi`
3. Restart Zotero

## Usage

1. Select paragraph/text in reader, right click and find `ZCTr` item, a pop-up window will appear to give specified translation.
2. Highlight this paragraph, cache will be used if the text were translated again.

## Terminology (Termbase)

Manage termbases in `Settings → ZCTr → 术语表`:

- Create a termbase per language pair (e.g. `en → zh-CN`), or import JSON / TSV / CSV / TBX files. Local termbases are able to export as JSON or TBX.
- Matched source terms are injected into the translation request as reference material (with preferred/forbidden status support), so translations follow your terminology.
- The popup shows matched terms as a preview; the button in the popup files the current selection + translation into a termbase of your choice (duplicates and language-pair conflicts are refused).

## Configuration

- Provider types now adapts:
    - **DeepSeek**: name + API key + model
    - **Ollama**: name + port + model, with a **Test Connection** button that detects the local Ollama service and lists installed models
    - **OpenAI-compatible**: name + API Base URL + API key + model
- Support stream output.
- Cache is written to the Zotero data directory and survives restarts.

## Translation request format

Requests go through the OpenAI-compatible `POST {API Base URL}/chat/completions` endpoint. In streaming mode SSE is used.
```json
{
	"model": "deepseek-v4-flash",
	"messages": [
		{
			"role": "system",
			"content": "You are a professional translator..."
		},
		{
			"role": "user",
			"content": "<SELECTED-TEXT>"
		}
	],
	"temperature": 0.3,
	"stream": true
}
```

## License

AGPL-3.0-or-later · Copyright © 2026 MCXCC303
