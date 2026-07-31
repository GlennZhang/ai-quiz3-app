# AI 助教 · 对话框 resize + markdown 渲染 设计文档

- **日期**: 2026-07-31
- **状态**: 已确认，待实现
- **作用域**: 增强已完成的 `ai-tutor.js` 浮动气泡 UI（分支 `feat/ai-tutor-chat`）

## 1. 背景

AI 助教（浮动气泡 + 纯前端 agent-loop）已完成 10 任务并经用户实测真实 LLM 对话可运行。用户补充两个功能：
1. 聊天对话框（panel）可拖拉调整大小。
2. AI 回复是 markdown 格式，需渲染成 HTML（当前 `send()` 流式用 `textContent` 纯文本显示）。

## 2. 硬约束

| # | 约束 |
|---|---|
| C1 | 纯静态自包含、离线、**不引 CDN** |
| C2 | **XSS 安全**（AI/用户文本不得注入活标签） |
| C3 | `ai-tutor.js` 维持**单文件** |

## 3. 设计

### 3.1 对话框 resize
`.ait-panel` 的 CSS 增加 `resize: both; min-width: 280px; min-height: 320px;`（浏览器原生右下角拖拽手柄；`max-width/max-height` 已存在）。**零 JS 逻辑**。

### 3.2 `renderMarkdown(md)` 纯函数（挂 `window.AiTutor.renderMarkdown`）
1. **先 `escapeHtml` 整文** —— 所有原文转义，天然 XSS 安全（`<script>`、`<img onerror>` 等变纯文本）。
2. **代码块占位**：提取 ```` ```lang\n...\n``` ```` 为占位符（保护内部不被后续规则误处理），末尾还原为 `<pre><code>…</code></pre>`。
3. **块级（按行）**：标题 `#`~`######`、引用 `>`、无序列表 `-`/`*`、有序列表 `N.`、水平线 `---`、**GFM 表格** `| a | b |\n|---|---|`。
4. **行内**：粗体 `**`、斜体 `*`、行内代码 `` ` ``。
5. **段落/换行**：`\n\n` 分段为 `<p>`，段内 `\n` → `<br>`。

### 3.3 `send()` / `renderMessages()` 改动
- **流式中**：`aiBubble.textContent = aiText`（每 token 纯文本，性能，避免逐 token 重渲染 markdown）。
- **完成时**（`done`/`aborted`/`error` 之后、`finally` 渲染前）：`aiBubble.innerHTML = renderMarkdown(aiText)`（一次性渲染）。
- `renderMessages()`：assistant 消息用 `renderMarkdown`（innerHTML）；**user 消息仍用 `escapeHtml`**（用户输入不渲染 markdown，防注入）；工具行、error/aborted 文案保持 textContent。

### 3.4 样式
`injectStyle()` 补充 markdown 元素样式：`pre`/`code`（深色背景圆角）、`table`/`th`/`td`（边框）、`blockquote`（左边线灰底）、`h3`/`h4`（助教回复常用，紧凑）、`ul`/`ol`（缩进）、`p`（行距）。

### 3.5 测试（新增 `test/ai-markdown.test.js`）
- `renderMarkdown` 各语法断言：标题 → `<h2>`、粗体 → `<strong>`、无序/有序列表 → `<ul>`/`<ol><li>`、代码块 → `<pre><code>`、GFM 表格 → `<table>`、引用 → `<blockquote>`、换行 → `<br>`。
- **XSS**：输入 `<script>alert(1)</script>` 与 `<img src=x onerror=alert(1)>` → 断言输出中无活标签（`<script>` 被转义、无 `onerror`）。
- 流式→完成：mock `runAgentLoop` 返回 markdown，断言完成后 `aiBubble.innerHTML` 含渲染标签。
- resize：在 `test/ai-tutor-ui.test.js` 增一条断言——`#ait-style` 样式文本含 `resize:`。

## 4. 改动范围
- `ai-tutor.js`：加 `renderMarkdown` + `injectStyle` 补样式/resize + `send()`/`renderMessages()` 用渲染 + 导出 `renderMarkdown`。
- `test/ai-markdown.test.js`（新建）+ `test/ai-tutor-ui.test.js`（加 resize 断言）。
- `index.html` / `mock/index.html`：**不动**（接入代码不变）。

## 5. 不做（YAGNI）
- 不引入 marked.js / DOMPurify 等外部库（违反 C1/C3，且手写够用）。
- 手写渲染器不支持的复杂 markdown（深层嵌套列表、带合并单元格的复杂表格）退化为可读纯文本，可接受。
