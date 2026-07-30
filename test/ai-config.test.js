#!/usr/bin/env node
/* ai-tutor.js 的 CONFIG / SESSION 单测。把 ai-tutor.js 源码注入 jsdom。 */
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

ok('getConfig 读 baseUrl', A.getConfig().baseUrl === 'https://api.x/v1');
ok('getConfig 读 apiKey', A.getConfig().apiKey === 'sk-1');
ok('getConfig 读 model', A.getConfig().model === 'm1');

const dom2 = makeDOM({});
const cfg2 = dom2.window.AiTutor.getConfig();
ok('getConfig 无配置时各字段为空串', cfg2.baseUrl==='' && cfg2.apiKey==='' && cfg2.model==='');

dom2.window.AiTutor.saveConfig({baseUrl:'b', apiKey:'k', model:'mm'});
ok('saveConfig 持久化', dom2.window.localStorage.getItem('aitrainer_ai_cfg') === JSON.stringify({baseUrl:'b',apiKey:'k',model:'mm'}));

ok('PRESETS 含 deepseek', !!A.PRESETS.deepseek && A.PRESETS.deepseek.baseUrl.endsWith('/v1'));
ok('PRESETS 含 zhipu', !!A.PRESETS.zhipu);
ok('PRESETS 含 ollama', !!A.PRESETS.ollama && A.PRESETS.ollama.baseUrl.includes('localhost'));
ok('PRESETS 含 custom', !!A.PRESETS.custom);

const dom3 = makeDOM({ 'aitrainer_chat_session': JSON.stringify({messages:[{role:'user',content:'hi'}]}) });
ok('loadSession 读历史', dom3.window.AiTutor.loadSession().messages.length === 1);
dom3.window.AiTutor.saveSession([{role:'user',content:'a'},{role:'assistant',content:'b'}]);
ok('saveSession 持久化', JSON.parse(dom3.window.localStorage.getItem('aitrainer_chat_session')).messages.length === 2);
dom3.window.AiTutor.clearSession();
ok('clearSession 清空', JSON.parse(dom3.window.localStorage.getItem('aitrainer_chat_session')).messages.length === 0);

console.log('\n'+pass+'/'+(pass+fail)+' 通过');
process.exit(fail ? 1 : 0);
