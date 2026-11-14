# ZCTr — 用户可见文案。
#
# 此处的消息 id 不带前缀。构建时 zotero-plugin-scaffold 会把本文件重命名为
# `zctr-addon.ftl`，并给每个 id 加上 `zctr-` 前缀；src/utils/locale.ts 中的
# getString() 在查找时会补上同样的前缀，addon/content/preferences.xhtml 则通过
# data-l10n-id 引用这些消息（构建时属性值同样会被加上前缀）。
#
# 日志（zlog.*）、LLM 提示词和代码注释不属于用户可见文案，保留在代码里。

# 插件名
addon-name = ZCTr

# 阅读器右键菜单项
menu-translate = ZCTr 翻译

# 翻译弹窗
popup-title = ZCTr 翻译
popup-close = 关闭
popup-cache-badge = ⚡ 缓存
popup-cache-title = 本次翻译来自本地缓存
popup-collect = ＋ 收录术语
popup-collect-title = 把当前选区与译文收录为术语到术语库
popup-collected = ✓ 已收录
popup-keep-original = （保留原文）
popup-no-provider = ⚠ 未配置翻译供应商，请前往 ZCTr 设置中添加并激活一个供应商。
popup-error = ⚠ 翻译失败：{ $detail }
popup-retry = 重试
popup-translating = 翻译中…

# 设置面板：JS 侧文案（XHTML 侧见文件末尾的 pref-* 组）
prefs-init-error = ZCTr 设置初始化失败：{ $detail }
pref-provider-empty = 暂无供应商，点击下方“添加供应商”开始配置。
pref-provider-active = ● 激活
pref-error-name-required = 名称不能为空。
pref-error-shortcut-modifier = 快捷键需要包含至少一个修饰键（Ctrl / Alt / Shift / ⌘）。
pref-context-level-selection = 仅选段，不附加任何上下文
pref-context-level-local = 含句 + 当前段 + 小节标题 (+ 相邻段)
pref-context-level-semantic = 含句 + 当前段 + 小节标题 + 条目标题 + 摘要
pref-context-level-adaptive = 含句 + 当前段 + 小节标题 (+ 条目标题 + 摘要)

# 供应商类型与表单
provider-type-openai = OpenAI 兼容
provider-type-deepseek = DeepSeek
provider-type-ollama = Ollama
openai-error-baseurl = API Base URL 不能为空。
openai-error-model = 模型不能为空。
ollama-error-select-model = 请先测试 Ollama 连接，然后选择模型。
ollama-saved = { $model }（已保存，请测试连接刷新）
ollama-option-test-first = 请先测试连接
ollama-option-no-models = 未检测到已安装的模型
ollama-testing = 检测中…
ollama-connected = ✓ 连接成功，检测到 { $count } 个模型：{ $models }
ollama-connected-empty = ✓ 连接成功（未检测到已安装的模型）
ollama-failed = ✗ 连接失败：{ $detail }
error-ollama-unreachable = 无法连接 Ollama 服务

# 目标语言下拉（语言名随界面语言变化；prompt 另用英文名，见 provider/languages.ts）
lang-zh = 中文
lang-en = 英文
lang-ja = 日文
lang-ko = 韩文
lang-fr = 法文
lang-de = 德文
lang-ru = 俄文
lang-es = 西班牙文
lang-it = 意大利文
lang-pt = 葡萄牙文
lang-ar = 阿拉伯文
lang-th = 泰文
lang-vi = 越南文

# 术语库数据校验 / 存储（错误会出现在导入与保存提示中）
termbase-error-id = termbaseId 不能为空
termbase-error-source-language = sourceLanguage 不能为空
termbase-error-target-language = targetLanguage 不能为空
termbase-error-same-language = sourceLanguage 与 targetLanguage 不能相同
termbase-error-entries = entries 必须是数组
termbase-error-concept-id = 词条缺少 conceptId
termbase-error-missing-pair = 词条 { $id } 缺少 { $source } 或 { $target } 术语
termbase-error-empty-term = 词条 { $id } 存在空术语
termbase-error-no-id = (无 id)
termbase-error-access-dir = 无法访问术语库目录
termbase-error-validation = 术语库校验失败: { $detail }

# 术语收录（写入侧）的语言对 / 重复校验提示
term-error-not-found = 术语库不存在或无法读取，请重新打开收录窗口。
term-error-empty = 源术语与目标术语不能为空。
term-error-doc-language = 术语库语言对为 { $source } → { $target }，与当前文档语言（{ $docLang }）冲突：该词条的源术语永远不会被匹配到。请选择语言对匹配的术语库。
term-error-target-language = 术语库语言对为 { $source } → { $target }，与当前翻译目标语言（{ $targetLang }）不匹配。请选择语言对匹配的术语库。
term-error-duplicate = 源术语「{ $term }」已存在于术语库「{ $name }」（词条 { $conceptId }）。
term-error-save = 保存失败：{ $detail }

# ---------------------------------------------------------------------------
# 设置面板（addon/content/preferences.xhtml 通过 data-l10n-id 引用）
# ---------------------------------------------------------------------------

pref-section-providers = 供应商设置
pref-btn-add-provider = 添加供应商
pref-label-provider-type = 供应商类型
pref-type-openai = OpenAI 兼容
pref-label-provider-name = 名称
pref-placeholder-provider-name = 如: 我的 DeepSeek / 本地 Ollama
pref-label-baseurl = API Base URL
pref-label-model = 模型
pref-placeholder-model = 如: gpt-4o-mini
pref-ollama-test-first = 请先测试连接
pref-label-ollama-port = Ollama 端口
pref-btn-test-connection = 测试连接
pref-label-apikey = API Key
pref-btn-save = 保存
pref-btn-set-active = 设为激活
pref-btn-delete = 删除

pref-section-termbase = 术语表
pref-label-termbase-enabled = 启用术语匹配与注入
pref-desc-termbase-scope = ZCTr 默认翻译时仅使用选中的词库进行术语匹配，未激活时使用全部兼容词库
pref-termbase-new = 新建
pref-termbase-delete = 删除
pref-termbase-import = 导入
pref-termbase-refresh = 刷新
pref-termbase-export-json = 导出JSON
pref-termbase-export-tbx = 导出TBX
pref-termbase-search-placeholder = 搜索词条…
pref-termbase-entries-title = 词条编辑
pref-termbase-src = 源术语
pref-termbase-tgt = 目标术语
pref-termbase-status = 状态
pref-termbase-variants = 变体（逗号分隔）
pref-termbase-note = 备注
pref-termbase-add = 新增词条
pref-termbase-update = 更新词条
pref-termbase-remove = 删除词条
pref-termbase-none = （无术语库）
pref-termbase-status-preferred = 首选
pref-termbase-status-admitted = 许用
pref-termbase-status-forbidden = 禁用
pref-termbase-status-deprecated = 废弃

pref-section-global = 全局设置
pref-section-translation = 翻译设置
pref-label-target-lang = 目标语言
pref-label-shortcut = 点按翻译快捷键
pref-placeholder-shortcut = 点击后按组合键，Esc 清除
pref-label-streaming = 使用流式输出

pref-section-generation = 生成参数
pref-desc-advanced-params = 高级参数（仅对支持的 Provider/Model 生效）
pref-placeholder-default = 默认

pref-section-context = 上下文
pref-label-context-level = 上下文级别
pref-label-context-abstract = 包含 Abstract
pref-label-context-title = 包含条目标题
pref-label-context-section-title = 包含小节标题（可用时）
pref-label-context-adjacent = 包含相邻段落
pref-desc-context = 上下文仅用于消除指代与术语歧义，不参与译文输出
pref-label-context-terminology = 包含术语

pref-section-cache = 缓存设置
pref-label-cache-persist = 持久化翻译缓存
pref-label-cache-limit-memory = 缓存队列长度（内存）
pref-label-cache-limit-file = 缓存队列长度（文件）
pref-desc-cache-limit = -1 表示不限制长度（缓存不断累积可能导致运行缓慢）

pref-section-log = 日志
pref-label-log-level = 日志级别

# ZCTr — 术语收录弹窗的文案（源文件：src/modules/reader/collect-term.ts）。
# 合并进 addon/locale/zh-CN/addon.ftl。

# 窗口标题与状态标签（status 取值 preferred/admitted/forbidden/deprecated 本身不本地化）
collect-title = 收录术语
collect-status-preferred = 首选
collect-status-admitted = 许用
collect-status-forbidden = 禁用
collect-status-deprecated = 废弃

# 错误提示（$detail 为技术细节）
collect-error-load-termbases = 加载术语库失败：{ $detail }
collect-error-no-termbase = 尚未创建任何术语库。请先新建或导入术语库。
collect-error-open-window = 无法打开收录窗口。
collect-error-init-window = 窗口初始化失败：{ $detail }
collect-alert-rejected = 无法收录

# 表单
collect-section-termbases = 术语库
collect-termbase-option = { $name }（{ $source } → { $target } · { $count } 词条）
collect-field-source = 源术语
collect-field-source-placeholder = 源语言术语（默认取选中文本，可编辑）
collect-field-target = 目标术语
collect-field-target-placeholder = 目标语言译文（默认取翻译结果，可编辑）
collect-field-status = 状态
collect-field-note = 备注
collect-field-note-placeholder = 可选：如 用微调，不用精调
collect-hint-language-pair = 语言对：{ $source } → { $target }
collect-hint-context = 当前语境：文档语言 { $docLang } · 翻译目标 { $target }
collect-unknown = 未知
collect-hint-footer = 注：重复或语言对冲突的收录会被拒绝。
collect-button-cancel = 取消
collect-button-collect = 收录
# ZCTr 术语库管理器（src/modules/preferences/termbase-ui.ts）的用户可见文案。
# 合并进 addon/locale/zh-CN/addon.ftl；id 不带前缀，构建时统一加 zctr-。

tb-select-placeholder = 选择术语库…
tb-select-empty = （无术语库）
tb-option = { $name } ({ $src }→{ $tgt }, { $count })
tb-option-active = { $name } ({ $src }→{ $tgt }, { $count })（激活）
tb-meta =
    术语库：{ $name }
    术语翻译方向：{ $src } → { $tgt }
    词条数：{ $count }
    创建于：{ $created }
    最近修订于：{ $updated }
    描述：{ $description }
tb-meta-hint = 术语库用于约束特定术语的译法。
tb-missing-source = （缺源术语）
tb-missing-target = （缺目标术语）
tb-entries-truncated = 共 { $count } 条匹配，仅显示前 { $max } 条，请用上方搜索框过滤
tb-entries-no-match = 没有匹配的词条
tb-entries-empty = （空术语库，使用下方表单新增词条）
tb-msg-no-termbase-selected = 请先选择一个术语库
tb-msg-terms-required = 源术语与目标术语不能为空
tb-msg-entry-added = 已新增词条
tb-msg-select-entry-to-update = 请先选择要更新的词条
tb-msg-entry-missing = 词条不存在（可能已被删除）
tb-msg-entry-updated = 已更新词条
tb-msg-select-entry-to-delete = 请先选择要删除的词条
tb-msg-entry-removed = 已删除词条
tb-msg-save-failed = 保存失败: { $detail }
tb-msg-create-failed = 新建失败: { $detail }
tb-new-title = 新建术语库
tb-new-name-prompt = 术语库名称（如 NLP EN-ZH）
tb-pair-prompt = 源语言,目标语言（如 en,zh）
tb-new-pair-invalid = 语言对格式应为“源,目标”（如 en,zh-CN）
tb-msg-created = 已新建术语库
tb-confirm-delete = 确定删除术语库“{ $name }”？（文件将被移除）
tb-msg-deleted = 已删除术语库
tb-filter-json = JSON 术语库
tb-filter-all = 术语库文件
tb-import-title = 导入术语库
tb-import-json-invalid =
    JSON 校验失败：
    { $detail }
tb-import-tbx-empty = TBX 中未解析到任何 termEntry
tb-import-rows-empty = 未解析到任何术语行（支持 TSV/CSV/TXT）
tb-import-default-name = 导入的术语库
tb-msg-imported = 已导入 { $count } 个词条
tb-msg-import-failed = 导入失败: { $detail }
tb-export-tbx-title = 导出术语库 (TBX)
tb-msg-exported-tbx = 已导出 TBX
tb-msg-export-failed = 导出失败: { $detail }
tb-export-title = 导出术语库
tb-msg-exported-json = 已导出 JSON
tb-import-pair-invalid = 语言对格式应为“源,目标”
tb-msg-refreshed = 已从磁盘刷新术语库
tb-msg-refresh-failed = 刷新失败: { $detail }