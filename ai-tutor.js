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

  /* ============ 公开接口（后续 Task 追加） ============ */
  const AiTutor = { getConfig, saveConfig, PRESETS, loadSession, saveSession, clearSession, makeAdapter, newAccumulator, applyDelta, finalizeAssistant, streamChat };

  window.AiTutor = AiTutor;

  /* UI 自启占位（Task 7 实现） */
  function boot(){ /* placeholder */ }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
