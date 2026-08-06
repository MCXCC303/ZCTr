/**
 * Ollama provider form: port + model dropdown + connectivity test.
 *
 * The model dropdown stays disabled until the "Test Connection" button
 * succeeds; the detected models then become its options.
 */

import {getDoc, getWin, inputValue, type ProviderForm, selectValue, setInputValue, setVisible,} from "../provider-form";
import {
	OLLAMA_DEFAULT_PORT,
	type OllamaModelInfo,
	type ProviderConfig,
	testOllamaConnection,
} from "../../translate/translator";

const XHTML_NS = "http://www.w3.org/1999/xhtml";

function statusEl(): HTMLElement | null {
	return (getDoc()?.getElementById("zctr-ollama-status") as HTMLElement | null) ?? null;
}

function modelSelect(): HTMLSelectElement | null {
	return (getDoc()?.getElementById(
		"zctr-input-model-ollama",
	) as HTMLSelectElement | null) ?? null;
}

/**
 * Reset the model dropdown to the disabled "untested" state.
 * When editing an existing Ollama provider, the previously saved model is
 * shown as a placeholder so the user knows what will be re-selected after
 * the connectivity test.
 */
function resetModelSelect(preferredModel?: string): void {
	const select = modelSelect();
	if (!select) {
		return;
	}
	select.replaceChildren();
	const option = getDoc()!.createElementNS(
		XHTML_NS,
		"option",
	) as HTMLOptionElement;
	if (preferredModel) {
		option.value = preferredModel;
		option.textContent = `${preferredModel}（已保存，请测试连接刷新）`;
	} else {
		option.value = "";
		option.textContent = "请先测试连接";
	}
	select.append(option);
	select.disabled = true;
}

/**
 * Fill the model dropdown with the models reported by the local Ollama
 * service. `preferred` (e.g. the previously saved model) is selected when
 * present in the list, otherwise the first model is selected.
 */
function populateModelSelect(
	models: OllamaModelInfo[],
	preferred?: string,
): void {
	const select = modelSelect();
	if (!select) {
		return;
	}
	select.replaceChildren();
	if (!models.length) {
		const option = getDoc()!.createElementNS(
			XHTML_NS,
			"option",
		) as HTMLOptionElement;
		option.value = "";
		option.textContent = "未检测到已安装的模型";
		select.append(option);
		select.disabled = true;
		return;
	}
	for (const model of models) {
		const option = getDoc()!.createElementNS(
			XHTML_NS,
			"option",
		) as HTMLOptionElement;
		option.value = model.name;
		option.textContent = model.parameterSize
			? `${model.name} (${model.parameterSize})`
			: model.name;
		select.append(option);
	}
	select.disabled = false;
	if (preferred) {
		select.value = preferred;
	}
	if (!select.value) {
		select.value = models[0].name;
	}
}

async function testConnection(): Promise<void> {
	const status = statusEl();
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
			// Enable the model dropdown with the detected models, keeping the
			// previously saved model selected when available
			populateModelSelect(
				models,
				selectValue("zctr-input-model-ollama") || undefined,
			);
			const names = models
				.slice(0, 5)
				.map((m) => (m.parameterSize ? `${m.name} (${m.parameterSize})` : m.name))
				.join(", ");
			status.textContent = `✓ 连接成功，检测到 ${models.length} 个模型：${names}${models.length > 5 ? "…" : ""}`;
		} else {
			populateModelSelect([], undefined);
			status.textContent = "✓ 连接成功（未检测到已安装的模型）";
		}
		status.style.color = "#2f7cde";
	} catch (error) {
		status.textContent = `✗ 连接失败：${(error as Error).message}`;
		status.style.color = "#c0392b";
	}
}

export const ollamaForm: ProviderForm = {
	setVisible(visible: boolean): void {
		setVisible("zctr-field-model-ollama", visible);
		setVisible("zctr-field-port", visible);
	},

	load(provider: ProviderConfig | null): void {
		setInputValue(
			"zctr-input-port",
			String(provider?.port || OLLAMA_DEFAULT_PORT),
		);
		// The model dropdown is disabled until the connectivity test
		// succeeds; keep the previously saved model as a placeholder
		resetModelSelect(provider?.model || undefined);
		const status = statusEl();
		if (status) {
			status.textContent = "";
		}
	},

	validate(base: ProviderConfig): ProviderConfig | null {
		// The model dropdown is only usable after the connectivity test has
		// populated it with the models of the local Ollama service
		const model = selectValue("zctr-input-model-ollama").trim();
		if (!model) {
			getWin()?.alert("请先测试 Ollama 连接，然后选择模型。");
			return null;
		}
		const port = parseInt(inputValue("zctr-input-port") || "", 10);
		return {
			...base,
			port: Number.isFinite(port) ? port : OLLAMA_DEFAULT_PORT,
			model,
		};
	},

	reset(): void {
		setInputValue("zctr-input-port", String(OLLAMA_DEFAULT_PORT));
		resetModelSelect();
		const status = statusEl();
		if (status) {
			status.textContent = "";
		}
	},

	bindEvents(): void {
		getDoc()
			?.getElementById("zctr-btn-test-ollama")
			?.addEventListener("click", testConnection);
	},
};
