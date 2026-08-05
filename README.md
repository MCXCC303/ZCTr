# ZCTr — Zotero 点按翻译插件

在 Zotero PDF 阅读器中选中文本后，通过右键菜单在文本旁弹出悬浮窗，调用大语言模型翻译选中内容。

## 功能

- **右键翻译**：PDF 阅读器中选中文本 → 右键 → 点击 "ZCTr 翻译"，悬浮窗自动出现在选中文本旁（优先下方，空间不足时在上方），尽量不遮挡文本
- **流式输出**：默认开启，译文逐字显示（SSE）；可在设置中关闭改为整段显示
- **悬浮窗交互**：拖动标题栏移动位置、拖动右下角手柄调整大小、点击窗外或按 `Esc` 关闭
- **三种供应商类型**：
    - **DeepSeek**：内置 API 端点，只需 API Key，模型下拉选择（`deepseek-v4-pro` / `deepseek-v4-flash`）
    - **Ollama**：本地服务，只需端口（默认 11434）与模型名，支持**连通性检测**（自动列出已安装模型）
    - **OpenAI 兼容**：任意兼容端点（API Base URL + API Key + 模型）
- **API Key 安全**：密钥通过 Firefox 登录管理器（NSS 加密）存储，不落盘到插件偏好设置的明文 JSON 中
- **目标语言可选**：13 种常用语言下拉选择（默认中文），保存即生效

## 安装

1. 构建插件：`npm install && npm run build`
2. 在 Zotero 中打开 **工具 → 附加组件 → ⚙️ → 从文件安装附加组件**，选择 `build/zc-tr.xpi`
3. 重启 Zotero

## 配置

打开 Zotero **设置（首选项）→ ZCTr**：

1. 点击 **添加供应商**，第一个条目选择**供应商类型**，后续表单按类型自适应：
    - **DeepSeek**：名称 + API Key + 模型（下拉）
    - **Ollama**：名称 + 端口 + 模型，可点击 **测试连接** 检测本地 Ollama 服务并列出已安装模型
    - **OpenAI 兼容**：名称 + API Base URL + API Key + 模型
2. 点击 **保存**，再点击 **设为激活**（可配置多个供应商，列表中点击切换）
3. **目标语言**：下拉选择（中文 / 英文 / 日文 / 韩文 / 法文 / 德文 / 俄文 / 西班牙文 / 意大利文 / 葡萄牙文 / 阿拉伯文 / 泰文 / 越南文），选择即保存
4. **使用流式输出**：勾选后翻译结果逐字显示（默认开启）

左侧供应商列表显示 `名称 - 类型` 格式，方便区分。

## 翻译请求格式

请求通过 OpenAI 兼容的 `POST {API Base URL}/chat/completions` 接口发送（DeepSeek 内置 `https://api.deepseek.com`，Ollama 为
`http://localhost:{port}/v1`），流式模式下启用 SSE（`stream: true`，逐块解析 `choices[0].delta.content`，以 `data: [DONE]`
结束）：

```json
{
	"model": "deepseek-v4-flash",
	"messages": [
		{
			"role": "system",
			"content": "You are a professional translator..."
		},
		{
			"role": "user",
			"content": "<选中的文本>"
		}
	],
	"temperature": 0.3,
	"stream": true
}
```

### 模块结构

```
src/
├── index.ts / addon.ts / hooks.ts     # 入口与生命周期（面板注册、阅读器事件注册）
├── utils/
│   ├── prefs.ts                       # 偏好设置封装（键名常量）
│   └── ztoolkit.ts                    # zotero-plugin-toolkit 初始化
└── modules/
    ├── translate/translator.ts        # 供应商管理 + 翻译请求（流式/非流式）+ API Key 安全存储
    ├── reader/translate-popup.ts      # 右键菜单注入 + 悬浮窗（定位/拖动/缩放/关闭）
    └── preferences/prefs-ui.ts        # 设置面板（类型化表单 + Ollama 连通性检测）
```

## 许可证

AGPL-3.0-or-later
