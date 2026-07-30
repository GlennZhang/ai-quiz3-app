#!/usr/bin/env node
/* 集成测试：加载真实 mock/index.html，验证 adapter 读到 newbank 错题数据 */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.resolve(__dirname,'../mock/index.html'),'utf-8');
const AI_SRC = fs.readFileSync(path.resolve(__dirname,'../ai-tutor.js'),'utf-8');

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('✓',n);} else {fail++;console.error('✗',n);} }

const INJECT = '<script>window.__AI_TUTOR_DATA__ = { S: S, Q: Q, QMAP: QMAP };</script><script>' + AI_SRC + '</script>';
const html = SRC.replace('</body>', INJECT + '</body>');
// 注：mock/newbank 题库 uid 前缀为 newsingle_/newmulti_（非主库的 single_/judge_）
const fixture = { wrong: { newsingle_1:{count:4,last:1,streak:0} }, right:{}, totalAns:2, totalRight:1 };

const dom = new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true,
  beforeParse(window){ window.localStorage.setItem('aitrainer_newbank_v1', JSON.stringify(fixture)); window.TextDecoder = TextDecoder; } });
dom.window.scrollTo = ()=>{};
dom.window.addEventListener('load', ()=>{
  setTimeout(()=>{
    const w = dom.window;
    ok('mock 气泡已渲染', !!w.document.getElementById('ait-fab'));
    const data = w.__AI_TUTOR_DATA__;
    ok('mock __AI_TUTOR_DATA__ 挂载', !!data);
    const ad = w.AiTutor.makeAdapter(data.S, data.Q, data.QMAP);
    ok('mock stats.total 与题库一致', ad.getProgressStats().total === data.Q.length);
    ok('mock getWrongQuestions 命中 newsingle_1', ad.getWrongQuestions({}).some(x=>x.uid==='newsingle_1'));
    console.log('\n'+pass+'/'+(pass+fail)+' 通过');
    process.exit(fail ? 1 : 0);
  }, 400);
});
