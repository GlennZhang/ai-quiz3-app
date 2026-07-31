#!/usr/bin/env node
/* UI 基础交互测试 */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const AI_SRC = fs.readFileSync(path.resolve(__dirname,'../ai-tutor.js'),'utf-8');

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
    ok('面板初始隐藏', d.getElementById('ait-panel').classList.contains('ait-hidden'));
    d.getElementById('ait-fab').click();
    ok('点击后面板可见', !d.getElementById('ait-panel').classList.contains('ait-hidden'));
    const input = d.getElementById('ait-input');
    const sendBtn = d.getElementById('ait-send');
    input.value = '总结错题';
    sendBtn.click();
    ok('未配置发送有提示节点', !!d.querySelector('.ait-msg-system'));
    d.getElementById('ait-cfg-btn').click();
    d.getElementById('ait-cfg-baseurl').value = 'https://api.deepseek.com/v1';
    d.getElementById('ait-cfg-apikey').value = 'sk-test';
    d.getElementById('ait-cfg-model').value = 'deepseek-chat';
    d.getElementById('ait-cfg-save').click();
    const saved = JSON.parse(dom.window.localStorage.getItem('aitrainer_ai_cfg'));
    ok('配置已持久化', saved.baseUrl === 'https://api.deepseek.com/v1' && saved.apiKey === 'sk-test');
    d.getElementById('ait-cfg-preset-deepseek').click();
    ok('预设 deepseek 填充 baseUrl', d.getElementById('ait-cfg-baseurl').value === 'https://api.deepseek.com/v1');
    ok('面板样式含 resize(可拖拉)', d.getElementById('ait-style').textContent.indexOf('resize:') >= 0);
    console.log('\n'+pass+'/'+(pass+fail)+' 通过');
    process.exit(fail ? 1 : 0);
  }, 100);
});
