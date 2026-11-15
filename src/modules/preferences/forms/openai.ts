import {getWin, inputValue, type ProviderForm, setInputValue, setVisible,} from "../provider-form";
import type {ProviderConfig} from "../../provider/types";
import {getString} from "../../../utils/locale";

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
			getWin()?.alert(getString("openai-error-baseurl"));
			return null;
		}
		if (!model) {
			getWin()?.alert(getString("openai-error-model"));
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
