/**
 * DeepSeek provider form: model dropdown (built-in base URL).
 * The API key is a shared field managed by the preferences pane.
 */

import {inputValue, type ProviderForm, selectValue, setSelectValue, setVisible,} from "../provider-form";
import {DEEPSEEK_MODELS, type ProviderConfig} from "../../provider/types";

export const deepseekForm: ProviderForm = {
	setVisible(visible: boolean): void {
		setVisible("zctr-field-model-select", visible);
	},

	load(provider: ProviderConfig | null): void {
		setSelectValue(
			"zctr-input-model-select",
			provider?.model || DEEPSEEK_MODELS[0],
		);
	},

	validate(base: ProviderConfig): ProviderConfig | null {
		const model = selectValue("zctr-input-model-select");
		return {
			...base,
			apiKey: inputValue("zctr-input-apikey").trim(),
			model: model || DEEPSEEK_MODELS[0],
		};
	},

	reset(): void {
		setSelectValue("zctr-input-model-select", DEEPSEEK_MODELS[0]);
	},

	bindEvents(): void {
	},
};
