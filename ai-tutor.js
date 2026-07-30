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
