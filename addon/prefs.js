// ZCTr preferences
// 供应商列表（JSON 数组字符串，元素: { id, name, apiBaseUrl, apiKey, model }）
pref("providers", "[]");
// 当前激活的供应商 id
pref("activeProviderId", "");
// 目标语言（如 zh, en）
pref("targetLang", "zh");
// 翻译快捷键（修饰键+键的组合字符串，如 "ctrl+alt+t"；空字符串 = 禁用）
pref("shortcut", "ctrl+alt+t");
// 使用流式输出（SSE，逐字显示翻译结果）
pref("streaming", true);
// 持久化翻译缓存（写入 Zotero 数据目录，重启后保留）
pref("cachePersist", false);
// 内存缓存队列长度
pref("cacheLimit", 50);
// 持久化缓存队列长度（仅写入文件的条目数上限）
pref("cachePersistLimit", 100);
