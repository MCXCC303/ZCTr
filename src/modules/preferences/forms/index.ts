/**
 * Provider form registry - maps each provider type to its form.
 */

import type {ProviderType} from "../../provider/types";
import type {ProviderForm} from "../provider-form";
import {openaiForm} from "./openai";
import {deepseekForm} from "./deepseek";
import {ollamaForm} from "./ollama";

/** The form for each provider type. */
export const providerForms: Record<ProviderType, ProviderForm> = {
	openai: openaiForm,
	deepseek: deepseekForm,
	ollama: ollamaForm,
};

export type {ProviderForm} from "../provider-form";
