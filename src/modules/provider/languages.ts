export const TARGET_LANGUAGES = [
	{code: "zh", labelId: "lang-zh", name: "Chinese"},
	{code: "en", labelId: "lang-en", name: "English"},
	{code: "ja", labelId: "lang-ja", name: "Japanese"},
	{code: "ko", labelId: "lang-ko", name: "Korean"},
	{code: "fr", labelId: "lang-fr", name: "French"},
	{code: "de", labelId: "lang-de", name: "German"},
	{code: "ru", labelId: "lang-ru", name: "Russian"},
	{code: "es", labelId: "lang-es", name: "Spanish"},
	{code: "it", labelId: "lang-it", name: "Italian"},
	{code: "pt", labelId: "lang-pt", name: "Portuguese"},
	{code: "ar", labelId: "lang-ar", name: "Arabic"},
	{code: "th", labelId: "lang-th", name: "Thai"},
	{code: "vi", labelId: "lang-vi", name: "Vietnamese"},
] as const;

export type TargetLanguageCode = (typeof TARGET_LANGUAGES)[number]["code"];

export function getTargetLanguageName(code: string): string {
	return (
		TARGET_LANGUAGES.find((l) => l.code === code)?.name || code
	);
}
