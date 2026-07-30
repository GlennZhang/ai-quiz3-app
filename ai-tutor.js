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
      if(assistant.finish_reason === 'length'){
        for(const tc of toolCalls){
          messages.push({ role:'tool', tool_call_id: tc.id, content: JSON.stringify({ error:'输出被 token 上限截断，工具参数可能不完整，请重新发起该工具调用' }) });
        }
        onEvent({ type:'length_truncated' });
        continue;
      }
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
    cfg.innerHTML = '<label>预设</label><div class="ait-presets" id="ait-presets"></div>'
      + '<label>Base URL（OpenAI 兼容，不含 /chat/completions）</label><input id="ait-cfg-baseurl" value="' + (c.baseUrl||'') + '">'
      + '<label>API Key（仅存本机）</label><input id="ait-cfg-apikey" type="password" value="' + (c.apiKey||'') + '">'
      + '<label>模型名</label><input id="ait-cfg-model" value="' + (c.model||'') + '">'
      + '<button id="ait-cfg-save" style="background:var(--pri,#4f6ef7);color:#fff;border:none;padding:8px;border-radius:8px;cursor:pointer">保存配置</button>';
    Object.keys(PRESETS).forEach(k=>{
      const b = el('button', null, k);
      b.id = 'ait-cfg-preset-' + k;
      b.onclick = ()=>{
        const p = PRESETS[k];
        document.getElementById('ait-cfg-baseurl').value = p.baseUrl;
        document.getElementById('ait-cfg-model').value = p.model;
      };
      cfg.querySelector('#ait-presets').appendChild(b);
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
    document.getElementById('ait-cfg-save').onclick = ()=>{
      saveConfig({
        baseUrl: document.getElementById('ait-cfg-baseurl').value,
        apiKey: document.getElementById('ait-cfg-apikey').value,
        model: document.getElementById('ait-cfg-model').value
      });
    };
    ta.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } });

    renderMessages();
  }
  function renderMessages(){
    const body = document.getElementById('ait-body'); if(!body) return;
    body.innerHTML = '';
    const messages = loadSession().messages;
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
  document.addEventListener('click', (e)=>{
    if(e.target && e.target.id==='ait-send' && abortCtrl){ e.preventDefault(); abortCtrl.abort(); }
  }, true);

  /* ============ 公开接口（后续 Task 追加） ============ */
  const AiTutor = { getConfig, saveConfig, PRESETS, loadSession, saveSession, clearSession, makeAdapter, newAccumulator, applyDelta, finalizeAssistant, streamChat, TOOLS, dispatchTool, runAgentLoop };

  window.AiTutor = AiTutor;

  /* UI 自启占位（Task 7 实现） */
  function boot(){
    const data = window.__AI_TUTOR_DATA__;
    if(!data){ if(typeof console!=='undefined') console.warn('[ai-tutor] window.__AI_TUTOR_DATA__ 缺失，助教已禁用'); return; }
    try { buildUI(); } catch(e){ if(typeof console!=='undefined') console.error('[ai-tutor] 初始化失败', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
