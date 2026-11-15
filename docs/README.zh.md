<h1 align="center">ZCTr</h1>
<p align="center">
  <b>Zotero 点按翻译插件</b>
</p>
<p align="center">
  <img alt="" src="https://raw.githubusercontent.com/MCXCC303/images/main/AI%20TransMate/screenshot_2026-08-05-215717.png" width="720">
</p>
<p align="center">
  <img alt="" src="https://github.com/MCXCC303/ZCTr/actions/workflows/ci.yml/badge.svg">
  <img alt="" src="https://img.shields.io/github/v/release/MCXCC303/ZCTr">
  <img alt="" src="https://img.shields.io/badge/Zotero-7.0+-%23CC2936">
  <img alt="" src="https://img.shields.io/badge/LICENSE-AGPL--3.0-black">
</p>

---

一款极简且功能强大的 Zotero 翻译插件。

## 安装

1. 构建插件：`npm install && npm run build`
2. 在 Zotero 中：`工具 -> 插件 -> ⚙️ -> 从文件安装插件…`，选择 `build/zc-tr.xpi`
3. 重启 Zotero

## 使用

1. 在阅读器中选中段落/文本，右键点击并找到 `ZCTr` 菜单项，将弹出窗口提供指定的翻译
2. 高亮该段落，若再次翻译该文本将使用缓存

## 术语库

在 `设置 → ZCTr → 术语库` 中管理术语库：

- 为每个语言对创建术语库（例如 `en → zh-CN`），或导入 JSON / TSV / CSV / TBX 文件。本地术语库可导出为 JSON 或 TBX。
- 匹配到的源术语会作为参考资料注入翻译请求（支持首选/禁止状态）。
- 弹窗中会显示匹配术语的预览；弹窗中的按钮可将当前选中内容及译文归档到选择的术语库中。

## 配置

- 提供商类型现已适配：
  - **DeepSeek**：API_KEY + 模型
  - **Ollama**：端口 + 模型，并带有测试连接功能，可检测本地 Ollama 服务并列出已安装的模型
  - **OpenAI 格式调用**：BASE_URL + API_KEY + 模型
- 支持流式输出。
- 缓存将写入 Zotero 数据目录，重启后仍然保留。

## 翻译请求格式

请求通过兼容 OpenAI 的 `POST {API Base URL}/chat/completions` 端点发送。流式模式下使用 SSE。

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
      "content": "<SELECTED-TEXT>"
    }
  ],
  "temperature": 0.3,
  "stream": true
}
```

## License

AGPL-3.0-or-later · Copyright © 2026 MCXCC303
