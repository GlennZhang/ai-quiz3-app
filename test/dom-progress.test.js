#!/usr/bin/env node
/**
 * 进度继续/重新 端到端测试：
 *  - 基于全局记录(S.right/S.wrong)检测进度
 *  - 继续：跳到第一个未做，承接已做题到本轮(导航器/回放/统计一致)
 *  - 重新：从头开始，本轮 results 空，全局记录不丢
 *  - 首页模式卡片显示"已做 X/总数"
 *  - 旧错题本/统计不受影响
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf-8');

// 旧数据：有错题、有统计（确认进度功能不影响它们）
const OLD_DATA = {
  wrong: { "multi_1": {count:2,last:1700000000000} },
  right: {},
  totalRight: 40, totalAns: 90,
  lastAttempt: {}
};

const HARNESS = `
;(function(){
  function out(s){ var d=document.createElement('div'); d.id='__out'; d.textContent=s; document.body.appendChild(d); }
  var R=[]; function ok(n,c){ R.push({name:n,pass:!!c}); }
  // 可控 confirm
  var confirmRet=true; var confirmCalls=[];
  window.confirm=function(msg){ confirmCalls.push(String(msg)); return confirmRet; };

  try{
    // 模拟用户在 all 模式做过 judge_1(对)、judge_2(对)
    S.right['judge_1']=true; S.right['judge_2']=true;
    S.lastAttempt['judge_1']={chosen:['√'],correct:true,ts:1};
    save();

    // —— 继续 ——
    confirmRet=true;
    startSession('all');
    ok('继续: 弹了进度确认框', confirmCalls.length>0 && confirmCalls[0].indexOf('进度')>=0);
    ok('继续: idx 跳到第3题(index 2)', cur.session.idx===2);
    ok('继续: 本轮承接2题', Object.keys(cur.session.results).length===2);
    ok('继续: 本轮正确数=2', cur.session.correct===2);

    // 承接的题可回看（回放）
    cur.session.idx=0; renderQuestion();
    ok('继续: 承接题有回放解析', document.getElementById('qFb').innerHTML.indexOf('解析')>=0);

    // —— 重新 ——
    endSession();
    confirmCalls=[]; confirmRet=false;
    startSession('all');
    ok('重新: 也弹了确认框', confirmCalls.length>0);
    ok('重新: idx=0', cur.session.idx===0);
    ok('重新: 本轮 results 为空', Object.keys(cur.session.results).length===0);
    ok('重新: 全局记录保留', S.right['judge_1']===true && S.right['judge_2']===true);

    // —— 无进度不弹窗 ——
    endSession();
    confirmCalls=[];
    // single 模式没做过
    startSession('single');
    ok('无进度: 不弹确认框', confirmCalls.length===0);
    ok('无进度: idx=0', cur.session.idx===0);
    endSession();

    // —— 首页进度显示 ——
    renderHome();
    var allSpan=document.querySelector('[data-start="all"] .meta span');
    var singleSpan=document.querySelector('[data-start="single"] .meta span');
    ok('首页: 全部练习显示进度(已做)', allSpan.textContent.indexOf('已做')>=0);
    ok('首页: 全部练习进度=3题(2对+1旧错)', allSpan.textContent.indexOf('3 / 900')>=0);
    ok('首页: 未做模式显示默认文案', singleSpan.textContent.indexOf('300')>=0 && singleSpan.textContent.indexOf('四选一')>=0);

    // —— 旧数据不受影响 ——
    ok('旧错题本保留', !!S.wrong['multi_1']);
    ok('旧统计保留', S.totalAns===90);

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
    const el=dom.window.document.getElementById('__out'); const txt=el?el.textContent:'(no output)';
    try{
      const R=JSON.parse(txt); let pass=0;
      R.forEach(r=>{ if(r.pass){pass++;console.log('✓',r.name)} else {console.error('✗',r.name)} });
      console.log('\n'+pass+'/'+R.length+' 通过'); process.exit(pass===R.length?0:1);
    }catch(e){ console.error('解析失败:',txt); process.exit(1); }
  },300);
});
