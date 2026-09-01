/**
 * Target language model. The stored pref value is the ISO `code`; the prompt
 * uses the natural-language `name` (better understood by LLMs and stable for
 * prompt caching).
 */
export const TARGET_LANGUAGES = [
	{code: "zh", label: "中文", name: "Chinese"},
	{code: "en", label: "英文", name: "English"},
	{code: "ja", label: "日文", name: "Japanese"},
	{code: "ko", label: "韩文", name: "Korean"},
	{code: "fr", label: "法文", name: "French"},
	{code: "de", label: "德文", name: "German"},
	{code: "ru", label: "俄文", name: "Russian"},
	{code: "es", label: "西班牙文", name: "Spanish"},
	{code: "it", label: "意大利文", name: "Italian"},
	{code: "pt", label: "葡萄牙文", name: "Portuguese"},
	{code: "ar", label: "阿拉伯文", name: "Arabic"},
	{code: "th", label: "泰文", name: "Thai"},
	{code: "vi", label: "越南文", name: "Vietnamese"},
] as const;

export type TargetLanguageCode = (typeof TARGET_LANGUAGES)[number]["code"];

/** Map a stored language code to its natural-language name for prompts. */
export function getTargetLanguageName(code: string): string {
	return (
		TARGET_LANGUAGES.find((l) => l.code === code)?.name || code
	);
}
