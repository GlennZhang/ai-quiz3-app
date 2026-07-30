# AI 助教聊天工具 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `index.html` 与 `mock/index.html` 内嵌一个全局浮动 AI 助教，能读取用户的错题/进度数据生成错题总结与题目讲解。

**Architecture:** 纯前端、参考 pi 的自研 agent-loop（tool-calling 循环），封装在共享的 `ai-tutor.js`（IIFE，挂 `window.AiTutor`）。LLM 走用户自配的 OpenAI 兼容 `/v1/chat/completions`（SSE 流式）。宿主页面通过 `window.__AI_TUTOR_DATA__={S,Q,QMAP}` 暴露数据，`ai-tutor.js` 用 `AiTutor.makeAdapter` 构造只读数据适配器。完全离线、无后端、不引 pi。

**Tech Stack:** 原生 JavaScript（IIFE，无构建步骤）、OpenAI Chat Completions API（SSE）、jsdom + Node 测试（沿用 `test/*.test.js` 模式）、Cloudflare Pages 静态部署。

## Global Constraints

- C1 纯前端、完全离线、自包含，**不加任何后端**。
- C2 LLM 由使用人自配 base URL + key + 模型，key 仅存本机 localStorage。
- C3 **不引入 pi 作为运行时依赖**；只参考其 `agent-loop.ts` 算法。
- C4 OpenAI 兼容端点：`{baseUrl}/chat/completions`，`tools` + `tool_calls` + `stream:true`。
- C5 所有对学习数据的访问**只读**；适配器绝不写 `localStorage`。
- C6 localStorage keys：`aitrainer_ai_cfg`（AI 配置，读写）、`aitrainer_chat_session`（会话，读写）、`aitrainer_lv3_v1`/`aitrainer_newbank_v1`（学习状态 S，**只读**）。
- C7 `agent-loop` 上限 `MAX_TURNS = 8`；含 length 截断保护与 AbortSignal。
- C8 共享单文件 `ai-tutor.js`，被两个 html 引用；UI 在 `DOMContentLoaded` 自检 `window.__AI_TUTOR_DATA__` 存在后自启。

## File Structure

```
ai-tutor.js                 # 新增。全部 AI 逻辑（IIFE，挂 window.AiTutor）
  ├─ CONFIG   getConfig/saveConfig/PRESETS              [Task 1]
  ├─ SESSION  loadSession/saveSession/clearSession       [Task 1]
  ├─ ADAPTER  makeAdapter(S,Q,QMAP) 只读数据访问         [Task 2]
  ├─ SSE      newAccumulator/applyDelta/finalizeAssistant[Task 3]
  ├─ LLM      streamChat({...,fetchFn}) async generator  [Task 4]
  ├─ TOOLS    TOOLS 数组 + dispatchTool                  [Task 5]
  ├─ LOOP     runAgentLoop({...})                        [Task 6]
  ├─ UI       buildUI/initUI/渲染/事件/配置面板           [Task 7]
  └─ boot     DOMContentLoaded 自启                      [Task 7]
index.html                  # 改：加 __AI_TUTOR_DATA__ + <script src>      [Task 8]
mock/index.html             # 改：同上                                       [Task 9]
test/ai-tutor.test.js       # 新增。CONFIG/SESSION/makeAdapter/SSE/LLM/TOOLS/LOOP 单测 [Task 1-6]
test/ai-tutor-ui.test.js    # 新增。UI 基础交互测试                          [Task 7]
test/ai-tutor-adapter.test.js # 新增。集成 index.html 适配器测试             [Task 8]
```

**关于 spec 的细化**：spec §5.2/§14 原写「各 html 内联适配器」。实现时改为「`ai-tutor.js` 提供 `makeAdapter(S,Q,QMAP)` 工厂，各 html 只挂 `__AI_TUTOR_DATA__`」。理由：两个 html 的全局变量同名（`S/Q/QMAP`），适配器代码完全一致，工厂化后①两个 html 共享一份适配器代码 ②适配器是纯函数、可直接单测 ③html 改动最小（一行数据引用）。适配器对外契约（4 个只读方法）不变。

---

## Task 1: ai-tutor.js 骨架 + CONFIG + SESSION

**Files:**
- Create: `ai-tutor.js`
- Test: `test/ai-tutor.test.js`

**Interfaces:**
- Produces: `window.AiTutor.getConfig()`, `saveConfig(c)`, `PRESETS`, `loadSession()`, `saveSession(msgs)`, `clearSession()`。

- [ ] **Step 1: 写失败测试** — 创建 `test/ai-tutor.test.js`

```js
#!/usr/bin/env node
/* ai-tutor.js 核心逻辑单测（CONFIG / SESSION）。把 ai-tutor.js 源码注入 jsdom。 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const AI_SRC = fs.readFileSync(path.resolve(__dirname, '../ai-tutor.js'), 'utf-8');

function makeDOM(preSet = {}){
  const html = `<!DOCTYPE html><html><body><div id="ai-tutor-root"></div>
<script>${AI_SRC}</script></body></html>`;
  return new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(window){
      for(const [k,v] of Object.entries(preSet)) window.localStorage.setItem(k, v);
    }
  });
}

let pass=0, fail=0;
function ok(name, cond){ if(cond){pass++;console.log('✓',name);} else {fail++;console.error('✗',name);} }

const dom = makeDOM({ 'aitrainer_ai_cfg': JSON.stringify({baseUrl:'https://api.x/v1', apiKey:'sk-1', model:'m1'}) });
const A = dom.window.AiTutor;

// CONFIG: 读取已存配置
ok('getConfig 读 baseUrl', A.getConfig().baseUrl === 'https://api.x/v1');
ok('getConfig 读 apiKey', A.getConfig().apiKey === 'sk-1');
ok('getConfig 读 model', A.getConfig().model === 'm1');

// CONFIG: 默认值（无 key）
const dom2 = makeDOM({});
const cfg2 = dom2.window.AiTutor.getConfig();
ok('getConfig 无配置时各字段为空串', cfg2.baseUrl==='' && cfg2.apiKey==='' && cfg2.model==='');

// CONFIG: saveConfig 写入
dom2.window.AiTutor.saveConfig({baseUrl:'b', apiKey:'k', model:'mm'});
ok('saveConfig 持久化', dom2.window.localStorage.getItem('aitrainer_ai_cfg') === JSON.stringify({baseUrl:'b',apiKey:'k',model:'mm'}));

// PRESETS 含四个预设
ok('PRESETS 含 deepseek', !!A.PRESETS.deepseek && A.PRESETS.deepseek.baseUrl.endsWith('/v1'));
ok('PRESETS 含 zhipu', !!A.PRESETS.zhipu);
ok('PRESETS 含 ollama', !!A.PRESETS.ollama && A.PRESETS.ollama.baseUrl.includes('localhost'));
ok('PRESETS 含 custom', !!A.PRESETS.custom);

// SESSION
const dom3 = makeDOM({ 'aitrainer_chat_session': JSON.stringify({messages:[{role:'user',content:'hi'}]}) });
ok('loadSession 读历史', dom3.window.AiTutor.loadSession().messages.length === 1);
dom3.window.AiTutor.saveSession([{role:'user',content:'a'},{role:'assistant',content:'b'}]);
ok('saveSession 持久化', JSON.parse(dom3.window.localStorage.getItem('aitrainer_chat_session')).messages.length === 2);
dom3.window.AiTutor.clearSession();
ok('clearSession 清空', JSON.parse(dom3.window.localStorage.getItem('aitrainer_chat_session')).messages.length === 0);

console.log('\n'+pass+'/'+(pass+fail)+' 通过');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node test/ai-tutor.test.js`
Expected: 报错 `Cannot find module '.../ai-tutor.js'`（文件尚未创建）。

- [ ] **Step 3: 创建 `ai-tutor.js` 最小实现（骨架 + CONFIG + SESSION）**

```js
;(function(){
  'use strict';

  /* ============ CONFIG ============ */
  const CFG_KEY = 'aitrainer_ai_cfg';
  const PRESETS = {
    deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat' },
    zhipu:    { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', model: 'glm-4-flash' },
    ollama:   { baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'qwen2.5:7b' },
    custom:   { baseUrl: '', apiKey: '', model: '' }
  };
  function getConfig(){
    let c = {};
    try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch(e){ c = {}; }
    return {
      baseUrl: c.baseUrl || '',
      apiKey:  c.apiKey  || '',
      model:   c.model   || ''
    };
  }
  function saveConfig(c){
    localStorage.setItem(CFG_KEY, JSON.stringify({ baseUrl:c.baseUrl||'', apiKey:c.apiKey||'', model:c.model||'' }));
  }

  /* ============ SESSION ============ */
  const SESSION_KEY = 'aitrainer_chat_session';
  function loadSession(){
    try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'); return { messages: Array.isArray(s.messages) ? s.messages : [] }; }
    catch(e){ return { messages: [] }; }
  }
  function saveSession(messages){
    localStorage.setItem(SESSION_KEY, JSON.stringify({ messages: messages || [] }));
  }
  function clearSession(){ saveSession([]); }

  /* ============ 公开接口（后续 Task 追加） ============ */
  const AiTutor = { getConfig, saveConfig, PRESETS, loadSession, saveSession, clearSession };

  window.AiTutor = AiTutor;

  /* UI 自启占位（Task 7 实现） */
  function boot(){ /* placeholder */ }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node test/ai-tutor.test.js`
Expected: `14/14 通过`，退出码 0。

- [ ] **Step 5: 提交**

```bash
git add ai-tutor.js test/ai-tutor.test.js
git commit -m "feat(ai-tutor): 新增 ai-tutor.js 骨架与 CONFIG/SESSION 模块"
```

---

## Task 2: makeAdapter 只读数据访问层

**Files:**
- Modify: `ai-tutor.js`（在 `/* ============ 公开接口` 区块前插入 ADAPTER 区块）
- Test: `test/ai-tutor.test.js`（追加 ADAPTER 测试段）

**Interfaces:**
- Consumes: 宿主提供的 `S`（`{wrong:{uid:{count,last,streak}}, right:{uid:true}, totalRight, totalAns}`）、`Q`（题目数组 `{uid,type,typeLabel,stem,options,answer,explanation}`）、`QMAP`（`{uid:question}`）。
- Produces: `AiTutor.makeAdapter(S,Q,QMAP)` → `{ getProgressStats(), getWrongQuestions({limit?,type?}), getQuestion(uid), searchQuestions(keyword,limit?) }`。

- [ ] **Step 1: 在 `test/ai-tutor.test.js` 末尾（`process.exit` 之前）追加测试段**

```js
/* ===== Task 2: makeAdapter ===== */
(function(){
  const Q = [
    {uid:'judge_1', type:'judge',  typeLabel:'判断题', stem:'题干甲', options:{}, answer:'√', explanation:'解甲'},
    {uid:'single_1',type:'single', typeLabel:'单选题', stem:'题干乙 contains KEYWORD', options:{A:'a',B:'b'}, answer:'A', explanation:'解乙'},
    {uid:'multi_1', type:'multi',  typeLabel:'多选题', stem:'题干丙', options:{A:'a',B:'b',C:'c'}, answer:'ABC', explanation:'解丙'}
  ];
  const QMAP = {}; Q.forEach(q=>QMAP[q.uid]=q);
  const S = {
    wrong: { judge_1:{count:3,last:1,streak:0}, single_1:{count:1,last:1,streak:2} },
    right: { multi_1:true },
    totalRight: 5, totalAns: 9
  };
  const a = A.makeAdapter(S, Q, QMAP);

  // getProgressStats
  const st = a.getProgressStats();
  ok('stats.total=3', st.total === 3);
  ok('stats.answered=totalAns', st.answered === 9);
  ok('stats.correct=totalRight', st.correct === 5);
  ok('stats.wrongCount=2', st.wrongCount === 2);
  ok('stats.byType.judge.total=1', st.byType.judge.total === 1);
  ok('stats.byType.single.done=1', st.byType.single.done === 1);
  ok('stats.byType.multi.correct=1', st.byType.multi.correct === 1);

  // getWrongQuestions：按 count 倒序
  const w = a.getWrongQuestions({ limit: 10 });
  ok('wrong 第一条是 judge_1(count3)', w[0].uid === 'judge_1');
  ok('wrong 含 wrongCount', w[0].wrongCount === 3);
  ok('wrong 含 stem', typeof w[0].stem === 'string');
  ok('wrong 含 streak', w[0].streak === 0);
  // type 过滤
  const wj = a.getWrongQuestions({ limit: 10, type: 'single' });
  ok('type=single 只返回 single_1', wj.length === 1 && wj[0].uid === 'single_1');
  // limit 上限 30
  const big = a.getWrongQuestions({ limit: 999 });
  ok('limit 上限 30 生效', big.length <= 30);

  // getQuestion
  const q1 = a.getQuestion('judge_1');
  ok('getQuestion 返回详情', q1 && q1.stem === '题干甲' && q1.answer === '√');
  ok('getQuestion 未知 uid 返回 null', a.getQuestion('nope') === null);

  // searchQuestions
  const s = a.searchQuestions('KEYWORD');
  ok('search 命中关键词', s.length === 1 && s[0].uid === 'single_1');
  ok('search 空关键词返回空数组', a.searchQuestions('').length === 0);
})();
```

- [ ] **Step 2: 运行测试，确认新增项失败**

Run: `node test/ai-tutor.test.js`
Expected: `A.makeAdapter is not a function`，新增断言失败。

- [ ] **Step 3: 在 `ai-tutor.js` 的 `/* ============ 公开接口` 区块**之前**插入 ADAPTER 区块**

```js
  /* ============ ADAPTER（只读数据访问） ============ */
  function shapeQuestion(q){
    return q ? { uid:q.uid, type:q.type, typeLabel:q.typeLabel, stem:q.stem, options:q.options, answer:q.answer, explanation:q.explanation } : null;
  }
  function makeAdapter(S, Q, QMAP){
    function getProgressStats(){
      const rightUids = Object.keys(S.right || {}), wrongUids = Object.keys(S.wrong || {});
      const st = { judge:{total:0,done:0,correct:0,wrong:0}, single:{total:0,done:0,correct:0,wrong:0}, multi:{total:0,done:0,correct:0,wrong:0} };
      (Q||[]).forEach(q=>{ if(st[q.type]) st[q.type].total++; });
      rightUids.forEach(u=>{ const q=QMAP[u]; if(q&&st[q.type]){ st[q.type].done++; st[q.type].correct++; } });
      wrongUids.forEach(u=>{ const q=QMAP[u]; if(q&&st[q.type]){ st[q.type].done++; st[q.type].wrong++; } });
      return { total:(Q||[]).length, answered:S.totalAns||0, correct:S.totalRight||0, wrongCount:wrongUids.length, byType:st };
    }
    function getWrongQuestions(opts){
      opts = opts || {};
      const limit = Math.min(opts.limit == null ? 10 : opts.limit, 30);
      let arr = Object.keys(S.wrong || {}).map(uid=>({ uid, count:(S.wrong[uid]&&S.wrong[uid].count)||0, streak:(S.wrong[uid]&&S.wrong[uid].streak)||0 }))
        .sort((a,b)=>b.count - a.count);
      if(opts.type) arr = arr.filter(w=>{ const q=QMAP[w.uid]; return q && q.type===opts.type; });
      arr = arr.slice(0, limit);
      return arr.map(w=>{ const q=QMAP[w.uid]; if(!q) return null; const shaped=shapeQuestion(q); shaped.wrongCount=w.count; shaped.streak=w.streak; return shaped; }).filter(Boolean);
    }
    function getQuestion(uid){ return shapeQuestion(QMAP[uid] || null); }
    function searchQuestions(keyword, limit){
      limit = limit == null ? 10 : limit;
      if(!keyword) return [];
      const kw = String(keyword).toLowerCase();
      const out = [];
      for(const q of (Q||[])){
        if(q.stem && String(q.stem).toLowerCase().indexOf(kw) >= 0){ out.push({ uid:q.uid, type:q.type, stem:q.stem }); if(out.length >= limit) break; }
      }
      return out;
    }
    return { getProgressStats, getWrongQuestions, getQuestion, searchQuestions };
  }
```

并把 `makeAdapter` 加入公开接口对象：

```js
  const AiTutor = { getConfig, saveConfig, PRESETS, loadSession, saveSession, clearSession, makeAdapter };
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node test/ai-tutor.test.js`
Expected: 全部通过（CONFIG/SESSION + ADAPTER）。

- [ ] **Step 5: 提交**

```bash
git add ai-tutor.js test/ai-tutor.test.js
git commit -m "feat(ai-tutor): 新增 makeAdapter 只读数据访问层"
```

---

## Task 3: SSE 解析 + delta 累积

**Files:**
- Modify: `ai-tutor.js`（新增 SSE 区块）
- Test: `test/ai-tutor.test.js`（追加 SSE 测试段）

**Interfaces:**
- Produces: `AiTutor.newAccumulator()`, `AiTutor.applyDelta(acc, openaiChunk)`, `AiTutor.finalizeAssistant(acc)`。

- [ ] **Step 1: 追加 SSE 测试段**（在 `process.exit` 前）

```js
/* ===== Task 3: SSE delta 累积 ===== */
(function(){
  const acc = A.newAccumulator();
  // 纯文本流
  A.applyDelta(acc, { choices:[{ delta:{ content:'你好' }, finish_reason:null }] });
  A.applyDelta(acc, { choices:[{ delta:{ content:'，世界' }, finish_reason:null }] });
  A.applyDelta(acc, { choices:[{ delta:{}, finish_reason:'stop' }] });
  const m1 = A.finalizeAssistant(acc);
  ok('文本累积', m1.content === '你好，世界');
  ok('finish_reason=stop', m1.finish_reason === 'stop');
  ok('无 tool_calls 时 tool_calls 为 undefined', m1.tool_calls === undefined);
  ok('role=assistant', m1.role === 'assistant');

  // tool_calls 流式增量（按 index 累积 name 与 arguments 分片）
  const acc2 = A.newAccumulator();
  A.applyDelta(acc2, { choices:[{ delta:{ tool_calls:[{ index:0, id:'call_1', type:'function', function:{ name:'get_wrong_questions', arguments:'' } }] }, finish_reason:null }] });
  A.applyDelta(acc2, { choices:[{ delta:{ tool_calls:[{ index:0, function:{ arguments:'{"limit":' } }] }, finish_reason:null }] });
  A.applyDelta(acc2, { choices:[{ delta:{ tool_calls:[{ index:0, function:{ arguments: '5}' } }] }, finish_reason:null }] });
  A.applyDelta(acc2, { choices:[{ delta:{}, finish_reason:'tool_calls' }] });
  const m2 = A.finalizeAssistant(acc2);
  ok('tool_calls 存在', !!m2.tool_calls && m2.tool_calls.length === 1);
  ok('tool_call.name', m2.tool_calls[0].function.name === 'get_wrong_questions');
  ok('tool_call.arguments 拼接', m2.tool_calls[0].function.arguments === '{"limit":5}');
  ok('tool_call.id', m2.tool_calls[0].id === 'call_1');
  ok('finish_reason=tool_calls', m2.finish_reason === 'tool_calls');
  ok('有 tool_calls 时 content 为 null', m2.content === null);

  // length 截断
  const acc3 = A.newAccumulator();
  A.applyDelta(acc3, { choices:[{ delta:{ tool_calls:[{ index:0, id:'c', type:'function', function:{ name:'get_question', arguments:'{"uid' } }] }, finish_reason:'length' }] });
  const m3 = A.finalizeAssistant(acc3);
  ok('length 截断 finish_reason', m3.finish_reason === 'length');
})();
```

- [ ] **Step 2: 运行，确认失败**

Run: `node test/ai-tutor.test.js`
Expected: `A.newAccumulator is not a function`。

- [ ] **Step 3: 在 `ai-tutor.js` ADAPTER 区块后插入 SSE 区块**

```js
  /* ============ SSE / delta 累积 ============ */
  function newAccumulator(){ return { text:'', toolCallsMap:{}, finishReason:null }; }
  function applyDelta(acc, chunk){
    const choice = chunk && chunk.choices && chunk.choices[0];
    if(!choice) return;
    const d = choice.delta;
    if(d){
      if(typeof d.content === 'string') acc.text += d.content;
      if(Array.isArray(d.tool_calls)){
        for(const tc of d.tool_calls){
          const i = tc.index == null ? 0 : tc.index;
          if(!acc.toolCallsMap[i]) acc.toolCallsMap[i] = { id:('call_'+i), type:'function', function:{ name:'', arguments:'' } };
          const slot = acc.toolCallsMap[i];
          if(tc.id) slot.id = tc.id;
          if(tc.function){
            if(tc.function.name) slot.function.name += tc.function.name;
            if(typeof tc.function.arguments === 'string') slot.function.arguments += tc.function.arguments;
          }
        }
      }
    }
    if(choice.finish_reason) acc.finishReason = choice.finish_reason;
  }
  function finalizeAssistant(acc){
    const idxs = Object.keys(acc.toolCallsMap).map(Number).sort((a,b)=>a-b);
    const tool_calls = idxs.map(i=>acc.toolCallsMap[i]);
    return {
      role: 'assistant',
      content: acc.text || null,
      tool_calls: tool_calls.length ? tool_calls : undefined,
      finish_reason: acc.finishReason
    };
  }
```

并把三个函数加入公开接口：

```js
  const AiTutor = { getConfig, saveConfig, PRESETS, loadSession, saveSession, clearSession, makeAdapter,
                     newAccumulator, applyDelta, finalizeAssistant };
```

- [ ] **Step 4: 运行，确认通过**

Run: `node test/ai-tutor.test.js`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add ai-tutor.js test/ai-tutor.test.js
git commit -m "feat(ai-tutor): 新增 SSE delta 解析与累积"
```

---

## Task 4: streamChat 流式客户端

**Files:**
- Modify: `ai-tutor.js`（新增 LLM 区块）
- Test: `test/ai-tutor.test.js`（追加 LLM 测试段）

**Interfaces:**
- Produces: `AiTutor.streamChat({baseUrl,apiKey,model,messages,tools,signal,fetchFn})` — async generator，逐个 yield 解析后的 OpenAI chunk 对象（`{choices:[{delta,finish_reason}]}`）。

- [ ] **Step 1: 追加 LLM 测试段**

```js
/* ===== Task 4: streamChat ===== */
(async function(){
  // 构造一个 SSE 文本流，用 ReadableStream 返回（模拟 fetch Response.body）
  function sseResponse(sseText){
    const body = new ReadableStream({ start(c){ c.enqueue(new TextEncoder().encode(sseText)); c.close(); } });
    return { ok:true, status:200, body };
  }
  const sse = 'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n'
            + 'data: {"choices":[{"delta":{"content":"!"},"finish_reason":null}]}\n\n'
            + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
            + 'data: [DONE]\n\n';
  let calls = 0;
  const fetchFn = async (url, opts)=>{
    calls++;
    ok('streamChat 请求 URL 正确', url === 'https://api.x/v1/chat/completions');
    ok('streamChat 方法 POST', opts.method === 'POST');
    ok('streamChat 带 Authorization', opts.headers['Authorization'] === 'Bearer sk-1');
    ok('streamChat body stream:true', JSON.parse(opts.body).stream === true);
    ok('streamChat 带 tools', Array.isArray(JSON.parse(opts.body).tools));
    ok('streamChat 透传 signal', opts.signal === 'sig-token');
    return sseResponse(sse);
  };
  const chunks = [];
  for await (const c of A.streamChat({
    baseUrl:'https://api.x/v1', apiKey:'sk-1', model:'m',
    messages:[{role:'user',content:'hi'}], tools:[{type:'function',function:{name:'x'}}],
    signal:'sig-token', fetchFn
  })){ chunks.push(c); }
  ok('yield chunk 数量=3', chunks.length === 3);
  ok('首个 chunk 含 content Hi', chunks[0].choices[0].delta.content === 'Hi');

  // HTTP 错误抛异常
  const errFetch = async ()=>({ ok:false, status:401, body:new ReadableStream({start(c){c.close();}}) });
  let threw = false;
  try{ for await (const _ of A.streamChat({baseUrl:'https://api.x/v1',apiKey:'k',model:'m',messages:[],fetchFn:errFetch})){} }
  catch(e){ threw = true; ok('HTTP 错误信息含状态码', /401/.test(e.message)); }
  ok('HTTP 错误抛异常', threw);

  // 无 apiKey 时不带 Authorization
  const noAuthFetch = async (url,opts)=>{ ok('无 key 无 Authorization', !opts.headers['Authorization']); return sseResponse('data: [DONE]\n\n'); };
  for await (const _ of A.streamChat({baseUrl:'https://api.x/v1',apiKey:'',model:'m',messages:[],fetchFn:noAuthFetch})){}
  finalize();
})();
function finalize(){
  console.log('\n'+pass+'/'+(pass+fail)+' 通过');
  process.exit(fail ? 1 : 0);
}
```

> 注意：把原文件末尾的 `console.log('\n'+pass+'/'+(pass+fail)+' 通过'); process.exit(...)` 两行**删除**，由上面 `finalize()` 统一收尾（因为 streamChat 测试是异步的，需在 await 后再退出）。

- [ ] **Step 2: 运行，确认失败**

Run: `node test/ai-tutor.test.js`
Expected: `A.streamChat is not a function`。

- [ ] **Step 3: 在 SSE 区块后插入 LLM 区块**

```js
  /* ============ LLM 客户端（OpenAI 兼容 /v1/chat/completions，SSE 流式） ============ */
  async function* streamChat(opts){
    const baseUrl = (opts.baseUrl || '').replace(/\/+$/, '');
    const url = baseUrl + '/chat/completions';
    const headers = { 'Content-Type':'application/json' };
    if(opts.apiKey) headers['Authorization'] = 'Bearer ' + opts.apiKey;
    const body = { model: opts.model, messages: opts.messages, stream: true };
    if(opts.tools && opts.tools.length) body.tools = opts.tools;
    const fetchFn = opts.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    if(!fetchFn) throw new Error('当前环境无 fetch');
    const resp = await fetchFn(url, { method:'POST', headers, body: JSON.stringify(body), signal: opts.signal });
    if(!resp || !resp.ok) throw new Error('LLM 请求失败: HTTP ' + (resp ? resp.status : '(无响应)'));
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      buf += dec.decode(value, { stream:true });
      let nl;
      while((nl = buf.indexOf('\n')) >= 0){
        let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        line = line.replace(/\r$/, '');
        if(line.indexOf('data:') !== 0) continue;
        const data = line.slice(5).trim();
        if(!data) continue;
        if(data === '[DONE]') return;
        try { yield JSON.parse(data); } catch(e){ /* 跳过非 JSON 行 */ }
      }
    }
  }
```

加入公开接口：

```js
                     newAccumulator, applyDelta, finalizeAssistant, streamChat };
```

- [ ] **Step 4: 运行，确认通过**

Run: `node test/ai-tutor.test.js`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add ai-tutor.js test/ai-tutor.test.js
git commit -m "feat(ai-tutor): 新增 OpenAI 兼容 SSE 流式客户端 streamChat"
```

---

## Task 5: TOOLS 定义 + dispatchTool

**Files:**
- Modify: `ai-tutor.js`（新增 TOOLS 区块）
- Test: `test/ai-tutor.test.js`（追加 TOOLS 测试段，需在 `finalize()` 调用前；由于 TOOLS 测试同步，直接放在 Task4 异步 IIFE 之前即可）

**Interfaces:**
- Produces: `AiTutor.TOOLS`（OpenAI `tools` 数组），`AiTutor.dispatchTool(toolCall, adapter)` → `{...}` 结果对象（由调用方 `JSON.stringify` 回灌）。

- [ ] **Step 1: 在 Task4 异步 IIFE 之前插入 TOOLS 同步测试段**

```js
/* ===== Task 5: TOOLS + dispatchTool ===== */
(function(){
  const Q = [{uid:'judge_1',type:'judge',typeLabel:'判断题',stem:'s',options:{},answer:'√',explanation:'e'}];
  const QMAP = { judge_1:Q[0] };
  const S = { wrong:{judge_1:{count:2,streak:1}}, right:{}, totalAns:3, totalRight:1 };
  const adapter = A.makeAdapter(S, Q, QMAP);

  ok('TOOLS 是数组且含 4 个', Array.isArray(A.TOOLS) && A.TOOLS.length === 4);
  ok('TOOLS[0] 是 function 类型', A.TOOLS[0].type === 'function');
  const names = A.TOOLS.map(t=>t.function.name);
  ok('含 get_progress_stats', names.indexOf('get_progress_stats')>=0);
  ok('含 get_wrong_questions', names.indexOf('get_wrong_questions')>=0);
  ok('含 get_question', names.indexOf('get_question')>=0);
  ok('含 search_questions', names.indexOf('search_questions')>=0);
  ok('get_question 入参 schema 含 uid', !!A.TOOLS.find(t=>t.function.name==='get_question').function.parameters.properties.uid);

  // dispatchTool：解析 arguments JSON，调用 adapter
  const r1 = A.dispatchTool({ function:{ name:'get_wrong_questions', arguments:'{"limit":5}' } }, adapter);
  ok('dispatch get_wrong_questions 返回数组', Array.isArray(r1) && r1.length === 1 && r1[0].uid === 'judge_1');

  const r2 = A.dispatchTool({ function:{ name:'get_question', arguments:'{"uid":"judge_1"}' } }, adapter);
  ok('dispatch get_question 返回详情', r2 && r2.uid === 'judge_1');

  const r3 = A.dispatchTool({ function:{ name:'get_progress_stats', arguments:'{}' } }, adapter);
  ok('dispatch get_progress_stats 返回 total', r3 && r3.total === 1);

  const r4 = A.dispatchTool({ function:{ name:'search_questions', arguments:'{"keyword":"s"}' } }, adapter);
  ok('dispatch search_questions 命中', Array.isArray(r4) && r4.length === 1);

  // 异常参数：arguments 非 JSON → 容错为 {}；未知工具 → error
  const r5 = A.dispatchTool({ function:{ name:'get_progress_stats', arguments:'{坏json' } }, adapter);
  ok('坏 JSON 容错执行', r5 && r5.total === 1);
  const r6 = A.dispatchTool({ function:{ name:'no_such_tool', arguments:'{}' } }, adapter);
  ok('未知工具返回 error', r6 && r6.error && /未知工具/.test(r6.error));
})();
```

- [ ] **Step 2: 运行，确认失败**

Run: `node test/ai-tutor.test.js`
Expected: `A.TOOLS is undefined` 之类。

- [ ] **Step 3: 在 LLM 区块后插入 TOOLS 区块**

```js
  /* ============ TOOLS ============ */
  const TOOLS = [
    { type:'function', function:{ name:'get_progress_stats', description:'获取该用户的学习进度总览：总题数、累计答题数、累计答对数、当前错题数、各题型（判断/单选/多选）的总量/已做/掌握/错题数。无需参数。',
      parameters:{ type:'object', properties:{}, required:[] } } },
    { type:'function', function:{ name:'get_wrong_questions', description:'获取当前错题列表（按错误次数倒序）。返回每题的 uid、题型、题干、选项、正确答案、解析、错误次数、巩固连续答对次数（达5次会被移除）。',
      parameters:{ type:'object',
        properties:{ limit:{ type:'integer', description:'返回条数，默认10，上限30', default:10 }, type:{ type:'string', enum:['judge','single','multi'], description:'可选，仅返回某题型' } },
        required:[] } } },
    { type:'function', function:{ name:'get_question', description:'按 uid 获取单题完整详情（题型、题干、选项、答案、解析），用于讲解某道题。',
      parameters:{ type:'object', properties:{ uid:{ type:'string' } }, required:['uid'] } } },
    { type:'function', function:{ name:'search_questions', description:'按关键词在题库题干中检索题目（返回 uid、题型、题干片段）。',
      parameters:{ type:'object', properties:{ keyword:{ type:'string' }, limit:{ type:'integer', default:10 } }, required:['keyword'] } } }
  ];
  const TOOLS_BY_NAME = {}; TOOLS.forEach(t=>TOOLS_BY_NAME[t.function.name] = t);
  const TOOL_RUNNERS = {
    get_progress_stats: (args, ad)=> ad.getProgressStats(),
    get_wrong_questions: (args, ad)=> ad.getWrongQuestions(args || {}),
    get_question:        (args, ad)=> { const q = ad.getQuestion(args && args.uid); return q || { error:'未找到该题目: '+(args&&args.uid) }; },
    search_questions:    (args, ad)=> ad.searchQuestions(args && args.keyword, args && args.limit)
  };
  function dispatchTool(toolCall, adapter){
    const name = toolCall && toolCall.function && toolCall.function.name;
    let args = {};
    try { args = JSON.parse((toolCall.function.arguments) || '{}'); } catch(e){ args = {}; }
    if(!TOOLS_BY_NAME[name]) return { error: '未知工具: ' + name };
    try { return TOOL_RUNNERS[name](args, adapter); }
    catch(e){ return { error: String((e && e.message) || e) }; }
  }
```

加入公开接口：

```js
                     newAccumulator, applyDelta, finalizeAssistant, streamChat, TOOLS, dispatchTool };
```

- [ ] **Step 4: 运行，确认通过**

Run: `node test/ai-tutor.test.js`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add ai-tutor.js test/ai-tutor.test.js
git commit -m "feat(ai-tutor): 新增工具集 TOOLS 与 dispatchTool"
```

---

## Task 6: runAgentLoop 核心循环

**Files:**
- Modify: `ai-tutor.js`（新增 LOOP 区块）
- Test: `test/ai-tutor.test.js`（追加 LOOP 测试段，异步，放在 Task4 IIFE 之后、`finalize` 定义之后，调用 `finalize()` 统一收尾）

**Interfaces:**
- Consumes: Task 3/4/5 的 `applyDelta`/`finalizeAssistant`/`streamChat`/`TOOLS`/`dispatchTool`。
- Produces: `AiTutor.runAgentLoop({messages, config, adapter, fetchFn, signal, onEvent, maxTurns})` → `Promise<messages[]>`，沿途通过 `onEvent` 回调发 `{type:'text_delta'|'assistant'|'tool_call'|'tool_result'|'done'|'length_truncated'|'max_turns'|'aborted'|'error', ...}`。

- [ ] **Step 1: 把测试收尾改为支持多个异步段。在文件末尾用如下结构（替换原 `finalize()` 调用位置）**

```js
/* ===== Task 6: runAgentLoop ===== */
function sseOf(events){
  // events: [{content?|toolCalls?|finish}] → 拼成 SSE
  const lines = events.map(ev=>{
    const delta = {};
    if(ev.content != null) delta.content = ev.content;
    if(ev.toolCalls) delta.tool_calls = ev.toolCalls;
    return 'data: ' + JSON.stringify({ choices:[{ delta, finish_reason: ev.finish || null }] }) + '\n\n';
  }).join('') + 'data: [DONE]\n\n';
  return { ok:true, status:200, body:new ReadableStream({ start(c){ c.enqueue(new TextEncoder().encode(lines)); c.close(); } }) };
}
async function runLoopTests(){
  const Q=[{uid:'judge_1',type:'judge',typeLabel:'判断题',stem:'s',options:{},answer:'√',explanation:'e'}];
  const QMAP={judge_1:Q[0]};
  const baseAdapter = ()=>A.makeAdapter({wrong:{judge_1:{count:1,streak:0}},right:{},totalAns:1,totalRight:0},Q,QMAP);
  const baseConfig = { baseUrl:'https://api.x/v1', apiKey:'sk', model:'m' };

  // (1) 纯文本单轮 → done
  let queue=[ sseOf([{content:'你好'},{finish:'stop'}]) ];
  const fetchFn1 = async ()=> queue.shift();
  let ev1=[]; 
  const out1 = await A.runAgentLoop({ messages:[{role:'system',content:'sys'},{role:'user',content:'hi'}], config:baseConfig, adapter:baseAdapter(), fetchFn:fetchFn1, onEvent:e=>ev1.push(e) });
  ok('单轮：1 次 LLM 调用', queue.length===0);
  ok('单轮：末消息是 assistant 文本', out1[out1.length-1].role==='assistant' && out1[out1.length-1].content==='你好');
  ok('单轮：触发 done 事件', ev1.some(e=>e.type==='done'));
  ok('单轮：触发 text_delta', ev1.some(e=>e.type==='text_delta'));

  // (2) tool_call → 回灌 → 二轮 stop
  queue=[
    sseOf([{toolCalls:[{index:0,id:'c1',type:'function',function:{name:'get_wrong_questions',arguments:'{"limit":5}'}}],finish:'tool_calls'}]),
    sseOf([{content:'总结完成'},{finish:'stop'}])
  ];
  let ev2=[];
  const out2 = await A.runAgentLoop({ messages:[{role:'user',content:'总结错题'}], config:baseConfig, adapter:baseAdapter(), fetchFn: async()=>queue.shift(), onEvent:e=>ev2.push(e) });
  ok('多轮：2 次调用后队列空', queue.length===0);
  ok('多轮：消息含 tool 角色回灌', out2.some(m=>m.role==='tool' && m.tool_call_id==='c1'));
  ok('多轮：触发 tool_call 事件', ev2.some(e=>e.type==='tool_call'&&e.name==='get_wrong_questions'));
  ok('多轮：触发 tool_result 事件', ev2.some(e=>e.type==='tool_result'));

  // (3) length 截断：不执行工具，回灌错误，下一轮 stop
  queue=[
    sseOf([{toolCalls:[{index:0,id:'c2',type:'function',function:{name:'get_question',arguments:'{"uid":"judge_1"}'}}],finish:'length'}]),
    sseOf([{content:'重试成功'},{finish:'stop'}])
  ];
  let ev3=[];
  const out3 = await A.runAgentLoop({ messages:[{role:'user',content:'q'}], config:baseConfig, adapter:baseAdapter(), fetchFn: async()=>queue.shift(), onEvent:e=>ev3.push(e) });
  ok('length：触发 length_truncated 事件', ev3.some(e=>e.type==='length_truncated'));
  ok('length：tool 消息内容含截断提示', /截断/.test(out3.find(m=>m.role==='tool').content));

  // (4) MAX_TURNS 兜底：持续返回 tool_calls
  const loopSse = ()=> sseOf([{toolCalls:[{index:0,id:'cx',type:'function',function:{name:'get_progress_stats',arguments:'{}'}}],finish:'tool_calls'}]);
  let ev4=[];
  await A.runAgentLoop({ messages:[{role:'user',content:'x'}], config:baseConfig, adapter:baseAdapter(), fetchFn: async()=>loopSse(), onEvent:e=>ev4.push(e), maxTurns:3 });
  ok('MAX_TURNS：触发 max_turns 事件', ev4.some(e=>e.type==='max_turns'));

  // (5) abort：fetchFn 抛 AbortError
  let ev5=[];
  const ac = new AbortController(); ac.abort();
  await A.runAgentLoop({ messages:[{role:'user',content:'x'}], config:baseConfig, adapter:baseAdapter(), signal:ac.signal, fetchFn: async()=>{ const e=new Error('aborted'); e.name='AbortError'; throw e; }, onEvent:e=>ev5.push(e) });
  ok('abort：触发 aborted 事件', ev5.some(e=>e.type==='aborted'));

  finalize();
}
runLoopTests();
```

- [ ] **Step 2: 运行，确认失败**

Run: `node test/ai-tutor.test.js`
Expected: `A.runAgentLoop is not a function`。

- [ ] **Step 3: 在 TOOLS 区块后插入 LOOP 区块**

```js
  /* ============ agent-loop（参考 pi runLoop） ============ */
  const MAX_TURNS_DEFAULT = 8;
  async function runAgentLoop(opts){
    const messages = (opts.messages || []).slice();
    const adapter = opts.adapter;
    const onEvent = opts.onEvent || (()=>{});
    const maxTurns = opts.maxTurns || MAX_TURNS_DEFAULT;
    const fetchFn = opts.fetchFn;
    for(let turn=0; turn<maxTurns; turn++){
      const acc = newAccumulator();
      try{
        for await(const chunk of streamChat({
          baseUrl: opts.config.baseUrl, apiKey: opts.config.apiKey, model: opts.config.model,
          messages, tools: TOOLS, signal: opts.signal, fetchFn
        })){
          const choice = chunk && chunk.choices && chunk.choices[0];
          if(!choice) continue;
          if(choice.delta && typeof choice.delta.content === 'string' && choice.delta.content){
            onEvent({ type:'text_delta', text: choice.delta.content });
          }
          applyDelta(acc, chunk);
        }
      }catch(e){
        if(e && e.name === 'AbortError'){ onEvent({ type:'aborted' }); return messages; }
        onEvent({ type:'error', message: String((e && e.message) || e) });
        return messages;
      }
      const assistant = finalizeAssistant(acc);
      messages.push(assistant);
      onEvent({ type:'assistant', message: assistant });
      const toolCalls = assistant.tool_calls;
      if(!toolCalls || !toolCalls.length){ onEvent({ type:'done' }); return messages; }
      // length 截断保护（借鉴 pi）：不执行可能残缺的工具调用
      if(assistant.finish_reason === 'length'){
        for(const tc of toolCalls){
          messages.push({ role:'tool', tool_call_id: tc.id, content: JSON.stringify({ error:'输出被 token 上限截断，工具参数可能不完整，请重新发起该工具调用' }) });
        }
        onEvent({ type:'length_truncated' });
        continue;
      }
      // 顺序执行工具并回灌
      for(const tc of toolCalls){
        onEvent({ type:'tool_call', name: tc.function.name, args: tc.function.arguments });
        const result = dispatchTool(tc, adapter);
        messages.push({ role:'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        onEvent({ type:'tool_result', name: tc.function.name, result });
      }
    }
    onEvent({ type:'max_turns' });
    return messages;
  }
```

加入公开接口：

```js
                     newAccumulator, applyDelta, finalizeAssistant, streamChat, TOOLS, dispatchTool, runAgentLoop };
```

- [ ] **Step 4: 运行，确认通过**

Run: `node test/ai-tutor.test.js`
Expected: 全部通过（含 CONFIG/SESSION/ADAPTER/SSE/LLM/TOOLS/LOOP）。

- [ ] **Step 5: 提交**

```bash
git add ai-tutor.js test/ai-tutor.test.js
git commit -m "feat(ai-tutor): 新增 runAgentLoop 核心循环（含 length 截断/abort/MAX_TURNS）"
```

---

## Task 7: UI（浮动气泡 + 面板 + 配置 + 渲染）

**Files:**
- Modify: `ai-tutor.js`（新增 UI 区块；替换 `boot()` 占位）
- Test: `test/ai-tutor-ui.test.js`（新建）

**Interfaces:**
- Consumes: Task 1/6 的 CONFIG/SESSION/runAgentLoop/makeAdapter。
- Produces: 自启 UI（气泡按钮 → 聊天面板：消息流、输入框、发送/停止、⚙配置、展开/收起、快捷指令、清空会话）。

- [ ] **Step 1: 写失败测试 `test/ai-tutor-ui.test.js`**

```js
#!/usr/bin/env node
/* UI 基础交互：气泡出现、点击展开面板、配置写入、快捷指令、流式渲染（mock） */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const AI_SRC = fs.readFileSync(path.resolve(__dirname, '../ai-tutor.js'), 'utf-8');

const html = `<!DOCTYPE html><html><body>
<div id="ai-tutor-root"></div>
<script>window.__AI_TUTOR_DATA__ = { S:{wrong:{},right:{},totalAns:0,totalRight:0}, Q:[], QMAP:{} };</script>
<script>${AI_SRC}</script>
</body></html>`;

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('✓',n);} else {fail++;console.error('✗',n);} }

const dom = new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true });
dom.window.scrollTo = ()=>{};
dom.window.addEventListener('load', ()=>{
  setTimeout(()=>{
    const d = dom.window.document;
    ok('挂载气泡按钮', !!d.getElementById('ait-fab'));
    ok('面板初始隐藏', d.getElementById('ait-panel').style.display === 'none' || d.getElementById('ait-panel').classList.contains('ait-hidden'));

    // 点击气泡 → 面板可见
    d.getElementById('ait-fab').click();
    const panel = d.getElementById('ait-panel');
    ok('点击后面板可见', panel.style.display !== 'none' && !panel.classList.contains('ait-hidden'));

    // 未配置时发送 → 提示去配置，不抛错
    const input = d.getElementById('ait-input');
    const sendBtn = d.getElementById('ait-send');
    input.value = '总结错题';
    sendBtn.click();
    ok('未配置发送有提示节点', !!d.querySelector('.ait-system, .ait-warn, .ait-msg-system'));

    // 配置面板：填入并保存
    d.getElementById('ait-cfg-btn').click();
    d.getElementById('ait-cfg-baseurl').value = 'https://api.deepseek.com/v1';
    d.getElementById('ait-cfg-apikey').value = 'sk-test';
    d.getElementById('ait-cfg-model').value = 'deepseek-chat';
    d.getElementById('ait-cfg-save').click();
    const saved = JSON.parse(dom.window.localStorage.getItem('aitrainer_ai_cfg'));
    ok('配置已持久化', saved.baseUrl === 'https://api.deepseek.com/v1' && saved.apiKey === 'sk-test');

    // 预设按钮填充 deepseek
    d.getElementById('ait-cfg-preset-deepseek').click();
    ok('预设 deepseek 填充 baseUrl', d.getElementById('ait-cfg-baseurl').value === 'https://api.deepseek.com/v1');

    console.log('\n'+pass+'/'+(pass+fail)+' 通过');
    process.exit(fail ? 1 : 0);
  }, 100);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node test/ai-tutor-ui.test.js`
Expected: 找不到 `ait-fab` 等元素（UI 未实现）。

- [ ] **Step 3: 在 `ai-tutor.js` 的 LOOP 区块后插入 UI 区块，并替换 `boot()` 占位**

```js
  /* ============ UI ============ */
  const SYSTEM_PROMPT = '你是「人工智能训练师（三级）理论刷题」的助教。只基于本应用题库与该用户的错题/进度作答；需要数据时先调用工具（get_progress_stats / get_wrong_questions / get_question / search_questions）取真实数据再回答；错题归因到具体知识点，鼓励推导而非直接给答案；回答用中文。';
  let abortCtrl = null;

  function el(tag, cls, html){
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(html != null) e.innerHTML = html;
    return e;
  }
  function injectStyle(){
    if(document.getElementById('ait-style')) return;
    const s = el('style', null, `
.ait-fab{position:fixed;right:18px;bottom:18px;z-index:9999;width:54px;height:54px;border-radius:50%;background:var(--pri,#4f6ef7);color:#fff;font-size:24px;display:grid;place-items:center;box-shadow:0 4px 16px rgba(20,30,60,.25);cursor:pointer;border:none}
.ait-hidden{display:none!important}
.ait-panel{position:fixed;right:18px;bottom:84px;z-index:9999;width:360px;max-width:calc(100vw - 24px);height:480px;max-height:calc(100vh - 120px);background:var(--card,#fff);border:1px solid var(--line,#e6e9f0);border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgba(20,30,60,.18)}
.ait-panel.ait-big{width:min(760px,calc(100vw-24px));height:min(640px,calc(100vh-120px))}
.ait-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line,#e6e9f0);background:var(--pri-bg,#eef1fe)}
.ait-head b{font-size:14px;flex:1}
.ait-head button{font-size:13px;padding:4px 8px;border-radius:8px;background:#fff;border:1px solid var(--line,#e6e9f0);cursor:pointer}
.ait-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--bg,#f4f6fb)}
.ait-msg{max-width:88%;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.ait-msg-user{align-self:flex-end;background:var(--pri,#4f6ef7);color:#fff}
.ait-msg-ai{align-self:flex-start;background:#fff;border:1px solid var(--line,#e6e9f0)}
.ait-msg-system{align-self:center;background:var(--warn-bg,#fdf3e2);color:var(--warn,#d97706);font-size:12px}
.ait-tool{align-self:flex-start;font-size:12px;color:var(--sub,#6b7280);font-style:italic}
.ait-foot{border-top:1px solid var(--line,#e6e9f0);padding:8px}
.ait-quick{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
.ait-quick button{font-size:12px;padding:4px 10px;border-radius:999px;background:var(--pri-bg,#eef1fe);color:var(--pri,#4f6ef7);border:1px solid var(--line,#e6e9f0);cursor:pointer}
.ait-input-row{display:flex;gap:8px}
.ait-input-row textarea{flex:1;resize:none;height:44px;padding:8px 10px;border-radius:10px;border:1px solid var(--line,#e6e9f0);font:inherit}
.ait-input-row button{padding:0 16px;border-radius:10px;background:var(--pri,#4f6ef7);color:#fff;border:none;cursor:pointer}
.ait-cfg{padding:10px 12px;border-bottom:1px solid var(--line,#e6e9f0);background:#fff;display:flex;flex-direction:column;gap:8px}
.ait-cfg label{font-size:12px;color:var(--sub,#6b7280)}
.ait-cfg input{width:100%;padding:6px 8px;border:1px solid var(--line,#e6e9f0);border-radius:8px;font:inherit}
.ait-presets{display:flex;gap:6px;flex-wrap:wrap}
`);
    s.id = 'ait-style';
    document.head.appendChild(s);
  }
  function buildUI(){
    injectStyle();
    const fab = el('button', 'ait-fab', '💬'); fab.id = 'ait-fab'; fab.type = 'button';
    const panel = el('div', 'ait-panel ait-hidden'); panel.id = 'ait-panel';

    const head = el('div','ait-head');
    head.appendChild(el('b', null, '🤖 AI 助教'));
    const expandBtn = el('button', null, '⤢'); expandBtn.id='ait-expand';
    const cfgBtn = el('button', null, '⚙'); cfgBtn.id='ait-cfg-btn';
    const clearBtn = el('button', null, '清空'); clearBtn.id='ait-clear';
    head.appendChild(expandBtn); head.appendChild(cfgBtn); head.appendChild(clearBtn);

    const cfg = el('div','ait-cfg ait-hidden'); cfg.id='ait-cfg';
    const c = getConfig();
    cfg.innerHTML = `
<label>预设</label><div class="ait-presets" id="ait-presets"></div>
<label>Base URL（OpenAI 兼容，不含 /chat/completions）</label><input id="ait-cfg-baseurl" value="${c.baseUrl}">
<label>API Key（仅存本机）</label><input id="ait-cfg-apikey" type="password" value="${c.apiKey}">
<label>模型名</label><input id="ait-cfg-model" value="${c.model}">
<button id="ait-cfg-save" style="background:var(--pri,#4f6ef7);color:#fff;border:none;padding:8px;border-radius:8px;cursor:pointer">保存配置</button>`;
    // 预设按钮
    Object.keys(PRESETS).forEach(k=>{
      const b = el('button', null, k);
      const presetsWrap = cfg.querySelector('#ait-presets') || (()=>{ const w=el('div','ait-presets'); w.id='ait-presets'; return w; })();
      b.id = 'ait-cfg-preset-' + k;
      b.onclick = ()=>{
        const p = PRESETS[k];
        document.getElementById('ait-cfg-baseurl').value = p.baseUrl;
        document.getElementById('ait-cfg-model').value = p.model;
      };
      presetsWrap.appendChild(b);
    });

    const body = el('div','ait-body'); body.id='ait-body';

    const foot = el('div','ait-foot');
    const quick = el('div','ait-quick');
    [['总结错题','帮我总结当前错题的薄弱知识点并给出复习建议。'],
     ['分析薄弱点','分析我的学习进度，指出最薄弱的题型和知识点。']].forEach(([label, prompt])=>{
      const b = el('button', null, label);
      b.onclick = ()=>{ document.getElementById('ait-input').value = prompt; send(); };
      quick.appendChild(b);
    });
    const row = el('div','ait-input-row');
    const ta = el('textarea'); ta.id='ait-input'; ta.placeholder='向助教提问…';
    const sendBtn = el('button', null, '发送'); sendBtn.id='ait-send';
    row.appendChild(ta); row.appendChild(sendBtn);
    foot.appendChild(quick); foot.appendChild(row);

    panel.appendChild(head); panel.appendChild(cfg); panel.appendChild(body); panel.appendChild(foot);
    document.body.appendChild(fab); document.body.appendChild(panel);

    fab.onclick = ()=> panel.classList.toggle('ait-hidden');
    expandBtn.onclick = ()=> panel.classList.toggle('ait-big');
    cfgBtn.onclick = ()=> cfg.classList.toggle('ait-hidden');
    clearBtn.onclick = ()=>{ if(confirm('清空当前会话？')){ clearSession(); renderMessages(); } };
    sendBtn.onclick = send;
    ta.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } });

    renderMessages();
  }
  function renderMessages(){
    const body = document.getElementById('ait-body'); if(!body) return;
    body.innerHTML = '';
    const { messages } = loadSession();
    messages.forEach(m=>{
      if(m.role==='user') body.appendChild(el('div','ait-msg ait-msg-user', escapeHtml(m.content)));
      else if(m.role==='assistant' && m.content) body.appendChild(el('div','ait-msg ait-msg-ai', escapeHtml(m.content)));
      else if(m.role==='tool') body.appendChild(el('div','ait-tool', '🛠 已查询：' + escapeHtml(m.name || '')));
    });
    body.scrollTop = body.scrollHeight;
  }
  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  async function send(){
    const cfg = getConfig();
    const data = window.__AI_TUTOR_DATA__;
    if(!cfg.baseUrl || !cfg.model || !data){
      const body = document.getElementById('ait-body');
      body.appendChild(el('div','ait-msg ait-msg-system', data ? '请先点⚙配置模型（Base URL / 模型名）' : '数据未就绪，助教不可用'));
      return;
    }
    const ta = document.getElementById('ait-input');
    const text = (ta.value || '').trim(); if(!text) return;
    ta.value = '';
    const messages = loadSession().messages;
    if(!messages.some(m=>m.role==='system')) messages.unshift({ role:'system', content: SYSTEM_PROMPT });
    messages.push({ role:'user', content: text });
    saveSession(messages);
    // 渲染用户消息 + AI 占位
    const body = document.getElementById('ait-body');
    body.appendChild(el('div','ait-msg ait-msg-user', escapeHtml(text)));
    const aiBubble = el('div','ait-msg ait-msg-ai', ''); body.appendChild(aiBubble);
    const toolLine = el('div','ait-tool',''); body.appendChild(toolLine);
    body.scrollTop = body.scrollHeight;

    document.getElementById('ait-send').textContent = '停止';
    abortCtrl = (typeof AbortController!=='undefined') ? new AbortController() : null;
    let aiText = '';
    try{
      await runAgentLoop({
        messages, config: cfg, adapter: makeAdapter(data.S, data.Q, data.QMAP),
        signal: abortCtrl && abortCtrl.signal, onEvent: ev=>{
          if(ev.type==='text_delta'){ aiText += ev.text; aiBubble.textContent = aiText; body.scrollTop = body.scrollHeight; }
          else if(ev.type==='tool_call'){ toolLine.textContent = '🛠 调用 ' + ev.name + '…'; }
          else if(ev.type==='tool_result'){ toolLine.textContent = '🛠 已查询：' + ev.name; }
          else if(ev.type==='error'){ aiBubble.textContent = '⚠ ' + ev.message; }
          else if(ev.type==='aborted'){ aiBubble.textContent = (aiText||'') + '\n（已停止）'; }
        }
      });
      saveSession(messages);
    }finally{
      document.getElementById('ait-send').textContent = '发送';
      abortCtrl = null;
      renderMessages();
    }
  }
  // 「停止」按钮：send 进行中点发送键 → 中断
  // （为简洁，发送键文案切换已在 send 内处理；中断通过重写 send 按钮事件）
```

并在 `send()` 之后、`boot` 之前补一段把「停止」接上 abortCtrl 的逻辑（重写发送键点击）：

```js
  // 让发送键在生成中充当「停止」
  document.addEventListener('click', (e)=>{
    if(e.target && e.target.id==='ait-send' && abortCtrl){ e.preventDefault(); abortCtrl.abort(); }
  }, true);
```

最后替换 `boot()` 占位为：

```js
  function boot(){
    const data = window.__AI_TUTOR_DATA__;
    if(!data){ if(typeof console!=='undefined') console.warn('[ai-tutor] window.__AI_TUTOR_DATA__ 缺失，助教已禁用'); return; }
    try { buildUI(); } catch(e){ if(typeof console!=='undefined') console.error('[ai-tutor] 初始化失败', e); }
  }
```

- [ ] **Step 4: 运行，确认通过**

Run: `node test/ai-tutor-ui.test.js`
Expected: `6/6 通过`（或测试中实际断言数全部通过），退出码 0。

- [ ] **Step 5: 提交**

```bash
git add ai-tutor.js test/ai-tutor-ui.test.js
git commit -m "feat(ai-tutor): 新增浮动气泡 UI、配置面板、快捷指令与流式渲染"
```

---

## Task 8: 集成 index.html

**Files:**
- Modify: `index.html`（在 `</body>` 前加数据引用 + 脚本引入）
- Test: `test/ai-tutor-adapter.test.js`（新建，加载真实 index.html 验证 adapter）

**Interfaces:**
- Consumes: 全局 `S`、`Q`、`QMAP`（index.html 第二个 `<script>` 顶层作用域已定义）。
- Produces: `window.__AI_TUTOR_DATA__ = {S, Q, QMAP}` + `<script src="ai-tutor.js" defer>`，使助教自启。

- [ ] **Step 1: 写失败测试 `test/ai-tutor-adapter.test.js`**

```js
#!/usr/bin/env node
/* 集成测试：加载真实 index.html，验证 ai-tutor 经 __AI_TUTOR_DATA__ 取到错题数据。
   技巧：把 ai-tutor.js 源码注入到 index.html 末尾（避免依赖 jsdom 加载外部 src），
   并在注入前挂 __AI_TUTOR_DATA__，使 boot() 自启时能拿到数据。 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf-8');
const AI_SRC = fs.readFileSync(path.resolve(__dirname,'../ai-tutor.js'),'utf-8');

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('✓',n);} else {fail++;console.error('✗',n);} }

// 在最后一个 </script> 之后注入：__AI_TUTOR_DATA__ + ai-tutor.js 源码
const INJECT = `
<script>
window.__AI_TUTOR_DATA__ = { S: S, Q: Q, QMAP: QMAP };
</script>
<script>${AI_SRC}</script>
`;
let html = SRC.replace('</body>', INJECT + '</body>');

const fixture = {
  wrong: { judge_1:{count:2,last:1,streak:0}, single_1:{count:1,last:1,streak:1} },
  right: { multi_1:true },
  totalAns: 5, totalRight: 2
};

const dom = new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true,
  beforeParse(window){ window.localStorage.setItem('aitrainer_lv3_v1', JSON.stringify(fixture)); } });
dom.window.scrollTo = ()=>{};
dom.window.addEventListener('load', ()=>{
  setTimeout(()=>{
    const w = dom.window;
    ok('挂载 __AI_TUTOR_DATA__', !!w.__AI_TUTOR_DATA__);
    ok('AiTutor 可用', !!w.AiTutor);
    // boot 已自启 → 气泡应存在
    ok('气泡按钮已渲染', !!w.document.getElementById('ait-fab'));

    // 适配器（boot 内部构造，但数据访问用同一 makeAdapter，这里直接复测）
    const ad = w.AiTutor.makeAdapter(w.S, w.Q, w.QMAP);
    const st = ad.getProgressStats();
    ok('stats.total 与题库一致', st.total === w.Q.length);
    ok('stats.wrongCount=2', st.wrongCount === 2);
    const wq = ad.getWrongQuestions({ limit: 5 });
    ok('getWrongQuestions 含 judge_1', wq.some(x=>x.uid==='judge_1'));
    ok('getWrongQuestions 含 wrongCount', wq[0].wrongCount === 2);

    console.log('\n'+pass+'/'+(pass+fail)+' 通过');
    process.exit(fail ? 1 : 0);
  }, 400);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node test/ai-tutor-adapter.test.js`
Expected: `挂载 __AI_TUTOR_DATA__` 失败（index.html 还没加数据引用；注意：测试本身注入了 `__AI_TUTOR_DATA__`，所以这一步其实是为了验证 `w.S`/`w.Q`/`w.QMAP` 在注入点作用域可见——若 index.html 结构导致全局不可见会报错）。若测试已通过，直接进入 Step 3 让真实 html 也带上集成代码。

- [ ] **Step 3: 修改 `index.html`——在 `</body>` 之前加入**

定位 `</body>`（文件末尾），在其之前插入：

```html
<!-- AI 助教（浮动气泡）：暴露本页学习数据，由 ai-tutor.js 自启 -->
<script>
  window.__AI_TUTOR_DATA__ = { S: S, Q: Q, QMAP: QMAP };
</script>
<script src="ai-tutor.js" defer></script>
```

> 说明：`S`/`Q`/`QMAP` 是 index.html 第二个 `<script>`（顶层作用域）定义的全局变量，在此处可直接引用。`defer` 保证在文档解析后执行，`ai-tutor.js` 的 `boot()` 会读取 `__AI_TUTOR_DATA__` 并自启气泡。

- [ ] **Step 4: 运行，确认通过**

Run: `node test/ai-tutor-adapter.test.js && node test/ai-tutor.test.js`
Expected: 两个文件全部通过。

- [ ] **Step 5: 提交**

```bash
git add index.html test/ai-tutor-adapter.test.js
git commit -m "feat(index.html): 接入 AI 助教（__AI_TUTOR_DATA__ + ai-tutor.js）"
```

---

## Task 9: 集成 mock/index.html

**Files:**
- Modify: `mock/index.html`（同 Task 8，但适配器数据来自 newbank 题库）
- Test: 复用 `test/ai-tutor-adapter.test.js` 思路——为其增加对 mock 版本的断言，或新建 `test/ai-tutor-adapter-mock.test.js`

- [ ] **Step 1: 新建 `test/ai-tutor-adapter-mock.test.js`**

```js
#!/usr/bin/env node
/* 集成测试：加载真实 mock/index.html，验证 adapter 读到 newbank 错题数据。 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.resolve(__dirname,'../mock/index.html'),'utf-8');
const AI_SRC = fs.readFileSync(path.resolve(__dirname,'../ai-tutor.js'),'utf-8');

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('✓',n);} else {fail++;console.error('✗',n);} }

const INJECT = `<script>window.__AI_TUTOR_DATA__ = { S: S, Q: Q, QMAP: QMAP };</script><script>${AI_SRC}</script>`;
const html = SRC.replace('</body>', INJECT + '</body>');
const fixture = { wrong: { 'single_1':{count:4,last:1,streak:0} }, right:{}, totalAns:2, totalRight:1 };

const dom = new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true,
  beforeParse(window){ window.localStorage.setItem('aitrainer_newbank_v1', JSON.stringify(fixture)); } });
dom.window.scrollTo = ()=>{};
dom.window.addEventListener('load', ()=>{
  setTimeout(()=>{
    const w = dom.window;
    ok('mock 气泡已渲染', !!w.document.getElementById('ait-fab'));
    const ad = w.AiTutor.makeAdapter(w.S, w.Q, w.QMAP);
    ok('mock stats.total 与题库一致', ad.getProgressStats().total === w.Q.length);
    ok('mock getWrongQuestions 命中 single_1', ad.getWrongQuestions({}).some(x=>x.uid==='single_1'));
    console.log('\n'+pass+'/'+(pass+fail)+' 通过');
    process.exit(fail ? 1 : 0);
  }, 400);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node test/ai-tutor-adapter-mock.test.js`
Expected: `mock 气泡已渲染` 失败（mock/index.html 尚未接入）。

- [ ] **Step 3: 修改 `mock/index.html`——在 `</body>` 之前加入（与 Task 8 完全相同的两段）**

```html
<!-- AI 助教（浮动气泡）：暴露本页学习数据，由 ai-tutor.js 自启 -->
<script>
  window.__AI_TUTOR_DATA__ = { S: S, Q: Q, QMAP: QMAP };
</script>
<script src="ai-tutor.js" defer></script>
```

> mock/index.html 的全局 `S`/`Q`/`QMAP` 与 index.html 同名（仅 localStorage key 为 `aitrainer_newbank_v1`），因此接入代码完全一致。

- [ ] **Step 4: 运行全部测试**

Run: `npm test`
Expected: 全部 test 文件通过（含新增 4 个 ai-tutor 测试）。

- [ ] **Step 5: 提交**

```bash
git add mock/index.html test/ai-tutor-adapter-mock.test.js
git commit -m "feat(mock): 机构模拟卷版本接入 AI 助教"
```

---

## Task 10: 手动验证 + 文档更新

**Files:**
- Modify: `README.md`（说明 AI 助教用法与配置）

- [ ] **Step 1: 本地启动静态服务**

Run: `python3 -m http.server 8000`
然后在浏览器打开 `http://localhost:8000/index.html`，人工核对：
1. 右下角出现 💬 气泡，点击展开面板。
2. 点 ⚙ → 选 DeepSeek 预设 → 填自己的 key → 填模型名 → 保存。
3. 点「总结错题」快捷指令 → 观察到 `🛠 调用 get_wrong_questions…` → AI 流式输出中文总结。
4. 直接问「讲解 judge_1 这道题」→ AI 调用 `get_question` → 给出讲解。
5. 点 ⤢ 展开半屏；点「停止」可中断；刷新页面会话不丢；「清空」可重置。

> 若用 Ollama 本地：预设选 Ollama，确保 `ollama serve` 运行且已 `ollama pull` 对应模型；base URL `http://localhost:11434/v1`，key 留空。
> 若遇 CORS：换用支持浏览器 CORS 的端点（DeepSeek/Ollama）或自建代理；Anthropic/OpenAI 直连在浏览器侧通常被 CORS 拦截。

- [ ] **Step 2: 更新 `README.md`** — 新增「AI 助教」小节，说明：浮动气泡入口、配置（预设/base URL/key/模型）、数据只读、本地 Ollama 离线用法、CORS 注意事项。新增文件 `ai-tutor.js` 需与 html 一起部署。

```markdown
## AI 助教

右下角 💬 浮动按钮，可基于你的错题与进度生成错题总结、讲解题目。

- 首次使用点 ⚙ 配置：选择预设（DeepSeek / 智谱 GLM / Ollama 本地 / 自定义），填入 API Key 与模型名（仅存本机浏览器）。
- 完全离线可用：选 Ollama 预设，本地 `ollama serve` 即可，无需 Key。
- 助教通过工具调用**只读**你的学习数据，不会修改答题记录。
- 部署时 `ai-tutor.js` 需与 `index.html` / `mock/index.html` 一起上传。
```

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit -m "docs: README 增加 AI 助教使用说明"
```

---

## Self-Review 记录

- **Spec 覆盖**：§4 架构 → Task 1-7；§5 组件 → ai-tutor.js 分区；§6 agent-loop → Task 6；§7 工具集 → Task 5；§8 配置 → Task 1/7；§9 session → Task 1；§10 UI → Task 7；§11 错误处理 → Task 4/6/7；§12 测试 → 全 Task；§13 文件组织 → Task 1/8/9；§14 集成 → Task 8/9。全覆盖。
- **占位符**：无 TBD/TODO；每个代码步骤含完整代码。
- **类型/命名一致**：`makeAdapter`/`streamChat`/`runAgentLoop`/`dispatchTool`/`getConfig` 等在各 Task 与公开接口对象中名称一致；`__AI_TUTOR_DATA__`、`aitrainer_ai_cfg`、`aitrainer_chat_session` 在测试与实现中一致。
- **细化声明**：适配器由「各 html 内联」细化为「`ai-tutor.js` 的 `makeAdapter` 工厂 + html 挂 `__AI_TUTOR_DATA__`」，已在 File Structure 注明，契约不变。
