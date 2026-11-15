import {getDoc, getWin, inputValue, type ProviderForm, selectValue, setInputValue, setVisible,} from "../provider-form";
import {
	OLLAMA_DEFAULT_PORT,
	type ProviderConfig,
} from "../../provider/types";
import {
	type OllamaModelInfo,
	testOllamaConnection,
} from "../../provider/transport";
import {getString} from "../../../utils/locale";

const XHTML_NS = "http://www.w3.org/1999/xhtml";

function statusEl(): HTMLElement | null {
	return (getDoc()?.getElementById("zctr-ollama-status") as HTMLElement | null) ?? null;
}

function modelSelect(): HTMLSelectElement | null {
	return (getDoc()?.getElementById(
		"zctr-input-model-ollama",
	) as HTMLSelectElement | null) ?? null;
}

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
		option.textContent = getString("ollama-saved", {
			args: {model: preferredModel},
		});
	} else {
		option.value = "";
		option.textContent = getString("ollama-option-test-first");
	}
	select.append(option);
	select.disabled = true;
}

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
		option.textContent = getString("ollama-option-no-models");
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
	status.textContent = getString("ollama-testing");
	status.style.color = "#888";
	try {
		const models = await testOllamaConnection(portValue);
		if (models.length) {
			populateModelSelect(
				models,
				selectValue("zctr-input-model-ollama") || undefined,
			);
			const names = models
				.slice(0, 5)
				.map((m) => (m.parameterSize ? `${m.name} (${m.parameterSize})` : m.name))
				.join(", ");
			status.textContent = getString("ollama-connected", {
				args: {
					count: models.length,
					models: `${names}${models.length > 5 ? "…" : ""}`,
				},
			});
		} else {
			populateModelSelect([], undefined);
			status.textContent = getString("ollama-connected-empty");
		}
		status.style.color = "#2f7cde";
	} catch (error) {
		status.textContent = getString("ollama-failed", {
			args: {detail: (error as Error).message},
		});
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
		resetModelSelect(provider?.model || undefined);
		const status = statusEl();
		if (status) {
			status.textContent = "";
		}
	},

	validate(base: ProviderConfig): ProviderConfig | null {
		// The dropdown stays empty until a connectivity test populates it.
		const model = selectValue("zctr-input-model-ollama").trim();
		if (!model) {
			getWin()?.alert(getString("ollama-error-select-model"));
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
