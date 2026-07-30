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

  /* ============ 公开接口（后续 Task 追加） ============ */
  const AiTutor = { getConfig, saveConfig, PRESETS, loadSession, saveSession, clearSession, makeAdapter };

  window.AiTutor = AiTutor;

  /* UI 自启占位（Task 7 实现） */
  function boot(){ /* placeholder */ }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
