#!/usr/bin/env node
/**
 * 收藏功能端到端测试：
 *  - 收藏按钮切换 ★/☆、状态记忆、持久化
 *  - 收藏题练习（只含收藏题）
 *  - 收藏本视图（列出/移除/空态）
 *  - 与错题本视图切换不串味
 *  - 旧数据（错题/进度）不受影响
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf-8');

// 同时注入一份"已有错题与进度"的旧数据，确认收藏功能不影响它们
const OLD_DATA = {
  wrong: { "judge_1": {count:3,last:1700000000000} },
  right: { "judge_2": true },
  totalRight: 50, totalAns: 120,
  lastAttempt: { "judge_1": {chosen:["×"],correct:false,ts:1700000000000} }
};

const HARNESS = `
;(function(){
  function out(s){ var d=document.createElement('div'); d.id='__out'; d.textContent=s; document.body.appendChild(d); }
  var R=[]; function ok(n,c){ R.push({name:n,pass:!!c}); }
  try{
    var jUid = Q.find(q=>q.type==='judge').uid;
    var sUid = Q.find(q=>q.type==='single').uid;
    var fb=function(){ return document.getElementById('btnFav'); };

    startSession('all');
    cur.session.list=[jUid, sUid]; cur.session.idx=0; cur.session.results={};
    renderQuestion();

    ok('初始未收藏(☆)', fb().textContent==='☆');
    ok('初始无高亮', !fb().classList.contains('on'));

    fb().click();
    ok('点击后变★', fb().textContent==='★');
    ok('点击后有高亮', fb().classList.contains('on'));
    ok('S.fav 记录', !!S.fav[jUid]);
    var persisted=JSON.parse(localStorage.getItem('aitrainer_lv3_v1'));
    ok('已持久化到 localStorage', !!persisted.fav && !!persisted.fav[jUid]);

    // 切到第2题（未收藏）再回来，状态保持
    cur.session.idx=1; renderQuestion();
    ok('第2题未收藏(☆)', fb().textContent==='☆');
    cur.session.idx=0; renderQuestion();
    ok('回到第1题状态保持(★)', fb().textContent==='★');

    // 取消收藏
    fb().click();
    ok('取消后变☆', fb().textContent==='☆');
    ok('S.fav 已移除', !S.fav[jUid]);

    // 收藏两题 → 收藏题练习
    S.fav[jUid]={ts:1}; S.fav[sUid]={ts:2}; save();
    startSession('fav');
    ok('收藏练习含2题', cur.session.list.length===2);
    ok('收藏练习只含收藏题', cur.session.list.every(u=>S.fav[u]));

    // 收藏本视图
    renderFav();
    ok('收藏本标题=收藏本', document.getElementById('wbH2').textContent==='收藏本');
    ok('收藏本列出2条', document.querySelectorAll('#wbList .wrow').length===2);
    ok('练习按钮文案', document.getElementById('wbPractice').textContent==='练习这些收藏题');

    // 从收藏本移除一题
    document.querySelector('#wbList [data-rm]').click();
    ok('移除后剩1条', document.querySelectorAll('#wbList .wrow').length===1);
    ok('移除后 S.fav 剩1', Object.keys(S.fav).length===1);

    // 切回错题本视图不串味
    renderWrong();
    ok('错题本标题恢复', document.getElementById('wbH2').textContent==='错题本');
    ok('错题本按钮文案恢复', document.getElementById('wbPractice').textContent==='练习这些错题');

    // 空收藏本提示
    S.fav={}; save(); renderFav();
    ok('空收藏本显示提示', !!document.querySelector('#wbList .empty'));

    // —— 旧数据未受影响 ——
    ok('旧错题本保留', !!S.wrong['judge_1'] && S.wrong['judge_1'].count===3);
    ok('旧已答对保留', !!S.right['judge_2']);
    ok('旧统计保留', S.totalAns===120);

    out(JSON.stringify(R));
  }catch(e){ out('ERROR: '+(e&&e.stack||e)); }
})();
`;

let html = SRC.slice(0, SRC.lastIndexOf('</script>')) + HARNESS + '\n</script>';
const dom = new JSDOM(html, {
  runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true,
  beforeParse(window){ window.localStorage.setItem('aitrainer_lv3_v1', JSON.stringify(OLD_DATA)); }
});
dom.window.scrollTo = ()=>{};
dom.window.addEventListener('load', ()=>{
  setTimeout(()=>{
    const el = dom.window.document.getElementById('__out');
    const txt = el ? el.textContent : '(no output)';
    try{
      const R = JSON.parse(txt);
      let pass=0;
      R.forEach(r=>{ if(r.pass){pass++;console.log('✓',r.name)} else {console.error('✗',r.name)} });
      console.log(`\n${pass}/${R.length} 通过`);
      process.exit(pass===R.length?0:1);
    }catch(e){ console.error('解析失败:', txt); process.exit(1); }
  }, 300);
});
