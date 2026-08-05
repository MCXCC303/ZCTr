# ZCTr — Zotero 点按翻译插件

在 Zotero PDF 阅读器中选中文本后，通过右键菜单 "ZCTr 翻译" 在文本旁弹出悬浮窗，调用大语言模型（OpenAI 兼容 API）翻译选中内容。

## 功能

- **右键翻译**：PDF 阅读器中选中文本 → 右键 → 点击 "ZCTr 翻译"，悬浮窗自动出现在选中文本旁（优先下方，空间不足时在上方），尽量不遮挡文本
- **流式输出**：默认开启，译文逐字显示（SSE）；可在设置中关闭改为整段显示
- **悬浮窗交互**：拖动标题栏移动位置、拖动右下角手柄调整大小、点击窗外或按 `Esc` 关闭
- **多供应商**：设置中可添加多个翻译供应商（名称 / API Base URL / API Key / 模型），列表选择激活项
- **目标语言可配**：默认翻译为中文，可修改目标语言代码

## 安装

1. 构建插件：`npm install && npm run build`
2. 在 Zotero 中打开 **工具 → 附加组件 → ⚙️ → 从文件安装附加组件**，选择 `build/zc-tr.xpi`
3. 重启 Zotero

## 配置

打开 Zotero **设置（首选项）→ ZCTr**：

1. 点击 **添加供应商**，填写：
   - **名称**：任意名称（如 `DeepSeek`、`OpenAI`、`Ollama`）
   - **API Base URL**：OpenAI 兼容接口根地址，如 `https://api.deepseek.com`、`https://api.openai.com/v1`
   - **API Key**：访问密钥（本地服务如 Ollama 可留空）
   - **模型**：如 `deepseek-chat`、`gpt-4o-mini`
2. 点击 **保存**，再点击 **设为激活**（可配置多个供应商，列表中点击切换）
3. **目标语言**：翻译输出语言的语言代码，如 `zh` / `en` / `ja`
4. **使用流式输出**：勾选后翻译结果逐字显示（默认开启）

## 翻译请求格式

请求通过 OpenAI 兼容的 `POST {API Base URL}/chat/completions` 接口发送，流式模式下启用 SSE（`stream: true`，逐块解析 `choices[0].delta.content`，以 `data: [DONE]` 结束）：

```json
{
  "model": "deepseek-chat",
  "messages": [
    { "role": "system", "content": "You are a professional translator..." },
    { "role": "user", "content": "<选中的文本>" }
  ],
  "temperature": 0.3,
  "stream": true
}
```

## 开发

- 代码结构参考 [paper-chat-for-zotero](https://github.com/syt2/paper-chat-for-zotero)（zotero-plugin-scaffold + TypeScript + zotero-plugin-toolkit）
- `npm run build`：构建并导出 `build/zc-tr.xpi`
- `npm run typecheck`：类型检查
- `npm run start`：开发模式（`zotero-plugin serve`）

### 关键实现

- **右键菜单**：通过 `Zotero.Reader.registerEventListener("createViewContextMenu", ...)` 注入菜单项（Zotero 阅读器自定义事件机制，见 `chrome/content/zotero/xpcom/reader.js` 与 `reader/src/common/context-menu.js`）
- **选中文本**：优先读浏览器原生选区（textLayer）；右键时 Zotero 会重渲染 PDF 清除原生选区，兜底使用逻辑选区 `_selectionRanges`（每个 range 自带 `text`）
- **悬浮窗定位**：用 `getClientRectForPopup`（Zotero 内部 API）获取选中文本视口矩形，优先显示在选区下方
- **悬浮窗交互**：创建于阅读器 iframe 文档内；拖动/缩放/点击关闭均需同时在阅读器文档与 pdf.js viewer iframe 上监听（跨 iframe 事件不冒泡）
- **流式输出**：`fetch` + `ReadableStream` 迭代读取 SSE 流（非流式走 `Zotero.HTTP.request`）

## 许可证

AGPL-3.0-or-later
