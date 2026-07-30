# AI 助教聊天工具 · 设计文档

- **日期**: 2026-07-30
- **状态**: 已确认，待实现
- **作用域**: 在 `index.html`（主题库 900 题）与 `mock/index.html`（机构模拟卷题库）中内嵌一个全局浮动 AI 助教

---

## 1. 背景与目标

当前应用是「人工智能训练师（三级）理论刷题」的自包含单文件 Web 应用，用户答题产生的错题、连续答对巩固进度（streak）、累计统计都存在浏览器 `localStorage`。

用户希望内嵌一个**懂这些学习数据**的 AI 助教，主要用途：
1. **错题总结**：基于错题记录生成知识点归因、薄弱点分析。
2. **题目问答**：针对具体题目进行讲解、追问。

目标是在不破坏「完全离线 / 自包含 / 无后端」特性的前提下，给到一个能主动按需取数（而非把题库硬塞 prompt）的 agent 助教。

## 2. 硬约束

| # | 约束 | 来源 |
|---|---|---|
| C1 | 纯前端、完全离线、自包含，**不加任何后端** | 用户 |
| C2 | LLM 由**使用人自己配置** API（base URL + key + 模型），key 仅存本机 | 用户 |
| C3 | 不引入 `pi`（earendil-works/pi）作为运行时依赖 | 可行性结论（见 §3） |
| C4 | 遵循现有纯静态部署（Cloudflare Pages）与测试框架（jsdom + playwright） | 项目现状 |

## 3. 关键技术决策：为何不直接用 pi，但仍参考它

调研 `@earendil-works/pi-ai@0.80.6` 与 `@earendil-works/pi-agent-core@0.80.6`（npm registry 实证）：

- 两者均声明 `engines: node >= 22.19.0`，**无 `browser` field、无浏览器构建产物**。
- `pi-ai` 依赖 `@aws-sdk/client-bedrock-runtime`、`@smithy/node-http-handler`、`http-proxy-agent`/`https-proxy-agent` 等**纯 Node（net/tls/http）** 包；解压 **6MB / 594 文件**，浏览器无法加载。
- `pi-agent-core` 的 session/state 持久化依赖 **SQLite**；浏览器无原生 SQLite。
- 浏览器侧存在 **CORS 硬墙**（Anthropic、Bedrock 等禁止网页直连），而 pi-ai 用各家官方 SDK 直连，不处理浏览器 CORS。

**结论**：pi 在纯静态前端不可用；唯一能用 pi 的方式是加 Node 后端，但这直接打破 C1。故选择 **方案 A：纯前端自研 agent-loop**，**算法参考 pi 的 `agent-loop.ts`**，但用浏览器原生 `fetch` + `localStorage` 重写，去掉所有 Node/SQLite 依赖。

用户三个诉求（① 离线自包含、② 自配 key、③ agent-loop + session 管理）只有方案 A 能同时满足。

## 4. 架构总览

```
┌─────────────── 浮动气泡 UI (DOM) ───────────────┐
│  💬 → 聊天面板（消息流 / 输入框 / 快捷指令 / ⚙）  │
└───────────────────────┬─────────────────────────┘
                        │ 用户消息 / abort
                        ▼
┌─────────────── agent-loop 引擎 ─────────────────┐
│  while turns < MAX_TURNS:                        │
│    流式调 LLM → 取 assistant 消息                 │
│    if 含 tool_calls: 执行工具 → 结果回灌 → 继续   │
│    else: 结束                                     │
└───────────────────────┬─────────────────────────┘
          请求/流式      │            工具调用
          ▼              │              ▼
┌──── LLM 客户端 ────┐   │   ┌─── 工具层（只读）───┐
│ fetch /v1/chat/    │   │   │ window.__AI_TUTOR_  │
│ completions (SSE)  │   │   │ ADAPTER__ → 宿主数据 │
│ OpenAI 兼容格式    │   │   │ cfg + 题库(QMAP)     │
└────────────────────┘   │   └──────────────────────┘
```

**三条逻辑边界清晰**：
- **UI 层**：只管渲染消息、收输入、显示工具调用与流式增量。
- **引擎层**：纯算法，无 DOM、无 `window` 依赖，可被 jsdom 单测。
- **工具层**：通过宿主适配器读数据，引擎不感知两个 html 的内部变量。

## 5. 组件设计

### 5.1 `ai-tutor.js` 内部模块（单文件，逻辑分区）

| 模块 | 职责 |
|---|---|
| `config` | 模型配置的读写（localStorage `aitrainer_ai_cfg`），内置预设 |
| `llmClient` | `fetch` OpenAI 兼容 `/v1/chat/completions`，SSE 流式解析，产出增量事件 |
| `agentLoop` | 提炼自 pi 的循环；输入 messages+tools，产出事件流，含三处健壮性（§6） |
| `tools` | 4 个工具的定义（JSON schema）+ 执行分发，调用适配器 |
| `session` | messages 数组的存取（localStorage `aitrainer_chat_session`）、清空 |
| `ui` | 浮动按钮、面板 DOM、渲染、事件绑定 |

### 5.2 宿主适配器契约（解耦关键）

`ai-tutor.js` **不直接访问** `QMAP`、`cfg`、`S` 等宿主内部变量。要求宿主页面在加载 `ai-tutor.js` **之前**，在 `window` 上挂载：

```js
window.__AI_TUTOR_ADAPTER__ = {
  // 学习进度总览
  getProgressStats(): { total, answered, correct, wrongCount,
                        byType: { judge:{done,correct}, single:{...}, multi:{...} } },
  // 错题列表（按错次倒序），limit 默认 10，type 可选 'judge'|'single'|'multi'
  getWrongQuestions({ limit?, type? }): [
    { uid, type, typeLabel, stem, options, answer, explanation,
      wrongCount, streak /* 连续答对次数，达 5 移除 */ }
  ],
  // 单题详情
  getQuestion(uid): { uid, type, typeLabel, stem, options, answer, explanation } | null,
  // 题干关键词检索
  searchQuestions(keyword, limit?): [ { uid, type, stem } ]
};
```

- 所有方法**只读**，绝不写回 `localStorage`。
- `index.html` 与 `mock/index.html` 各自实现一个薄适配器，在**自身脚本作用域内直接访问全局 `S`/`Q`/`QMAP`**（均已由宿主加载完成，`S` 来自 `aitrainer_lv3_v1` / `aitrainer_newbank_v1`），**不直接读 localStorage**。`ai-tutor.js` 在初始化时若 `window.__AI_TUTOR_ADAPTER__` 缺失则禁用助教并告警。

## 6. agent-loop 算法（参考 pi）

```
async function runAgentLoop({ messages, tools, config, signal, onEvent }):
  for turn in 0..MAX_TURNS(=8):
    resp = llmClient.stream({ model, messages, tools, signal })   // SSE
    assistantMsg = await accumulate(resp, onEvent)                // 流式回调 UI
    if assistantMsg.finish_reason == 'length':
        // pi 健壮性①: 输出被 token 上限截断 → tool_call 参数可能残缺，
        // 不执行，把每个 tool_call 标记为错误结果回传，让模型重发。
        markTruncatedToolCallsAsError(assistantMsg) → 回灌 → continue
    messages.push(assistantMsg)
    toolCalls = assistantMsg.tool_calls
    if toolCalls 非空:
        for tc in toolCalls:                 // 顺序执行（足够；勿需 pi 的并行模式）
            result = tools.dispatch(tc)      // 调适配器
            messages.push({ role:'tool', tool_call_id: tc.id, content: JSON result })
        continue
    else:
        break   // finish_reason == 'stop'，自然结束
  persistSession(messages)
```

借鉴 pi 的三处健壮性：
1. **length 截断保护**：`finish_reason==='length'` 时不执行 tool_call。
2. **AbortSignal**：贯穿 `fetch` 与循环，用户可随时「停止生成」。
3. **MAX_TURNS=8**：防止工具调用死循环。

## 7. 工具集（OpenAI function calling 格式）

系统提示词定位：*你是「人工智能训练师（三级）理论刷题」的助教。只基于本应用题库与该用户的错题/进度作答；先调用工具取真实数据再回答；错题归因到具体知识点，鼓励推导而非直接给答案；回答用中文。*

| 工具 | 入参 schema | 说明 |
|---|---|---|
| `get_progress_stats` | `{}` | 全局学习概览，助教开场/总结时调用 |
| `get_wrong_questions` | `{ limit?: int(默认10, 上限30), type?: enum }` | 取错题；长总结时分页 |
| `get_question` | `{ uid: string }` | 单题详情讲解 |
| `search_questions` | `{ keyword: string, limit?: int }` | 关键词找题 |

工具结果统一 `JSON.stringify` 后作为 `role:'tool'` 消息回灌；题目含中文题干/选项，token 成本可控（按 limit 约束）。

## 8. 模型配置

聊天面板顶部 ⚙ → 配置面板：**base URL** + **API key** + **模型名**，存 `localStorage['aitrainer_ai_cfg']`。

内置预设（一键填充，仍可改）：

| 预设 | base URL | 说明 |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | 国内、便宜、中文好、支持浏览器 CORS |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | 国内 |
| Ollama 本地 | `http://localhost:11434/v1` | 真·离线，无需 key |
| 自定义 | — | 任意 OpenAI 兼容端点 |

未配置时气泡显示「请先点⚙配置模型」，不发起请求。key 存储处明确标注「仅存本机浏览器」。

## 9. session 与 localStorage

| key | 内容 | 写入方 |
|---|---|---|
| `aitrainer_ai_cfg` | `{ baseUrl, apiKey, model, preset }` | 配置面板 |
| `aitrainer_chat_session` | `{ messages: [...] }` 单一连续会话 | 引擎每轮 |
| `aitrainer_lv3_v1` / `aitrainer_newbank_v1` | 现有学习数据 `S`（wrong/right/totalAns/...）（**只读**） | 现有应用 |
| `aitrainer_cfg` / `aitrainer_newbank_cfg` | 现有用户偏好（shuffle/autoNext/explain）（AI 不使用） | 现有应用 |

单一会话（浮动气泡不适合多会话列表）；刷新不丢；面板内「清空会话」按钮重置 `aitrainer_chat_session`。

## 10. UI 设计（浮动气泡）

- **入口**：右下角固定 💬 圆钮，所有 view 可见。
- **默认**：约 360×480 小面板，含消息流、输入框、发送/停止键。
- **展开⤢**：顶部按钮切换半屏大面板，容纳长篇错题总结。
- **快捷指令**：输入框上方 `总结错题` / `分析薄弱点`，点击发送预设 prompt。
- **流式**：assistant 文本逐字渲染；工具调用显示 `🛠 调用 get_wrong_questions…` 行。
- **样式**：复用 `:root` CSS 变量（`--pri` 等）与圆角风格，与宿主一致。

## 11. 错误处理

| 情况 | 处理 |
|---|---|
| 未配置 base URL/key | 气泡提示去 ⚙ 配置，不发请求 |
| 网络/CORS 失败 | 面板内红色提示，并附「部分厂商不允许网页直连，请用 Ollama/支持 CORS 的端点或自建代理」 |
| LLM 返回非法 tool 参数 | 该 tool_call 回传 `{error}`，模型有机会重试 |
| `finish_reason==='length'` | 见 §6 健壮性① |
| 达 MAX_TURNS | 终止并提示「本轮工具调用过多，请缩小问题范围」 |
| 适配器缺失 | 禁用助教，控制台告警 |

## 12. 测试策略

沿用 `test/*.test.js`（jsdom）与 `package.json` 的 `npm test`：

- **agentLoop 单测**（mock `llmClient` + mock 适配器）：
  - 纯文本回复 → 单轮结束。
  - 含 tool_calls → 执行→回灌→二次请求→停止。
  - `length` 截断 → 不执行工具、回传错误。
  - MAX_TURNS 兜底。
  - AbortSignal 中断。
- **工具层单测**：用 fixture `cfg` + 题库，断言 `getWrongQuestions`/`getProgressStats`/`searchQuestions` 返回结构正确、只读。
- **配置/会话存取单测**：读写 localStorage key 正确。
- **E2E（playwright，可选）**：配置→提问→看到流式回复。

## 13. 文件组织（方案甲：共享）

```
ai-tutor.js          # 新增，AI 全部逻辑（UI+引擎+工具+配置+session），被两个 html 引用
index.html           # 改：加 <script src="ai-tutor.js"> + 挂载 window.__AI_TUTOR_ADAPTER__ + 气泡容器
mock/index.html      # 改：同上，适配器指向 newbank 题库与 aitrainer_newbank_cfg
test/ai-tutor.test.js # 新增，单测
```

Cloudflare Pages 多文件静态部署无碍；离线场景只需多带一个本地 `ai-tutor.js`。

## 14. 宿主集成清单

每个 html 需要：
1. 在 `<body>` 末尾、引入 `ai-tutor.js` **之前**，注入气泡容器占位与 `window.__AI_TUTOR_ADAPTER__` 实现（转发到本页 `cfg`/题库）。
2. `<script src="ai-tutor.js" defer></script>`。
3. `ai-tutor.js` 在 `DOMContentLoaded` 时自检 `window.__AI_TUTOR_ADAPTER__` 是否存在：存在则自启气泡；缺失则禁用并在控制台告警。宿主无需手动初始化。

## 15. 不做（YAGNI）

多会话管理、AI 写回错题状态、多模态、向量检索（RAG）、服务端代理、pi 并行工具执行、流式 thinking 渲染。

## 16. 风险与开放项

- **R1 CORS**：取决于用户所选端点；Ollama/DeepSeek 可用，Anthropic 直连不可用——已在错误提示与预设中规避。
- **R2 token 成本**：错题多时 `get_wrong_questions` 受 `limit` 上限（30）约束，可控。
- **R3 题目版权**：题干会发往用户自配的 LLM；因 key 与端点均由用户掌控，由用户自行合规。
