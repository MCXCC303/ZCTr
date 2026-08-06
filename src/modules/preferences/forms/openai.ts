/**
 * OpenAI-compatible provider form: API Base URL + model (free text).
 * The API key is a shared field managed by the preferences pane.
 */

import {getWin, inputValue, type ProviderForm, setInputValue, setVisible,} from "../provider-form";
import type {ProviderConfig} from "../../translate/translator";

export const openaiForm: ProviderForm = {
	setVisible(visible: boolean): void {
		setVisible("zctr-field-baseurl", visible);
		setVisible("zctr-field-model", visible);
	},

	load(provider: ProviderConfig | null): void {
		setInputValue("zctr-input-baseurl", provider?.apiBaseUrl ?? "");
		setInputValue("zctr-input-model", provider?.model ?? "");
	},

	validate(base: ProviderConfig): ProviderConfig | null {
		const apiBaseUrl = inputValue("zctr-input-baseurl")
			.trim()
			.replace(/\/+$/, "");
		const model = inputValue("zctr-input-model").trim();
		if (!apiBaseUrl) {
			getWin()?.alert("API Base URL 不能为空。");
			return null;
		}
		if (!model) {
			getWin()?.alert("模型不能为空。");
			return null;
		}
		return {
			...base,
			apiBaseUrl,
			apiKey: inputValue("zctr-input-apikey").trim(),
			model,
		};
	},

	reset(): void {
		setInputValue("zctr-input-baseurl", "");
		setInputValue("zctr-input-model", "");
	},

	bindEvents(): void {
	},
};
