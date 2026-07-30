#!/usr/bin/env node
/* 集成测试：加载真实 index.html，验证 ai-tutor 经 __AI_TUTOR_DATA__ 取到错题数据。
   技巧：把 ai-tutor.js 源码内联注入 index.html 末尾（避免依赖 jsdom 加载外部 src），
   并在注入前挂 __AI_TUTOR_DATA__，使 boot() 自启时能拿到数据。 */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf-8');
const AI_SRC = fs.readFileSync(path.resolve(__dirname,'../ai-tutor.js'),'utf-8');

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('✓',n);} else {fail++;console.error('✗',n);} }

const INJECT = '<script>window.__AI_TUTOR_DATA__ = { S: S, Q: Q, QMAP: QMAP };</script><script>' + AI_SRC + '</script>';
const html = SRC.replace('</body>', INJECT + '</body>');
const fixture = {
  wrong: { judge_1:{count:2,last:1,streak:0}, single_1:{count:1,last:1,streak:1} },
  right: { multi_1:true },
  totalAns: 5, totalRight: 2
};

const dom = new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true,
  beforeParse(window){ window.localStorage.setItem('aitrainer_lv3_v1', JSON.stringify(fixture)); window.TextDecoder = TextDecoder; } });
dom.window.scrollTo = ()=>{};
dom.window.addEventListener('load', ()=>{
  setTimeout(()=>{
    const w = dom.window;
    ok('挂载 __AI_TUTOR_DATA__', !!w.__AI_TUTOR_DATA__);
    ok('AiTutor 可用', !!w.AiTutor);
    ok('气泡按钮已渲染', !!w.document.getElementById('ait-fab'));
    // S/Q/QMAP 在 index.html 中为 const/let 顶层声明（非 window 属性），经 __AI_TUTOR_DATA__ 暴露
    const D = w.__AI_TUTOR_DATA__;
    const ad = w.AiTutor.makeAdapter(D.S, D.Q, D.QMAP);
    const st = ad.getProgressStats();
    ok('stats.total 与题库一致', st.total === D.Q.length);
    ok('stats.wrongCount=2', st.wrongCount === 2);
    const wq = ad.getWrongQuestions({ limit: 5 });
    ok('getWrongQuestions 含 judge_1', wq.some(x=>x.uid==='judge_1'));
    ok('getWrongQuestions 含 wrongCount', wq[0].wrongCount === 2);
    console.log('\n'+pass+'/'+(pass+fail)+' 通过');
    process.exit(fail ? 1 : 0);
  }, 400);
});
