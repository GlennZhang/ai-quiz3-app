#!/usr/bin/env node
/**
 * 真实 DOM 集成测试：在脚本作用域内注入测试桩，
 * 验证回放显示解析、着色、锁定、重新做、继续 的端到端行为。
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');

const SRC = fs.readFileSync(require('path').resolve(__dirname,'../index.html'),'utf-8');

// 在 </script> 前注入测试桩：暴露内部状态 + 自动跑断言
const HARNESS = `
;(function(){
  function out(s){ var b=document.getElementById('qBody'); var d=document.createElement('div'); d.id='__test_out'; d.textContent=s; document.body.appendChild(d); }
  var results=[];
  function ok(name,cond){ results.push({name,pass:!!cond}); }
  try{
    // 挑一道判断题和单选题
    var jUid = Q.find(q=>q.type==='judge').uid;
    var sUid = Q.find(q=>q.type==='single').uid;
    var jq = QMAP[jUid], sq = QMAP[sUid];

    // 启动一个多题本轮
    startSession('all');
    // 跳到那道判断题
    cur.session.list = [jUid, sUid];
    cur.session.idx = 0;
    cur.session.results = {};
    renderQuestion();

    // 1) 未答：无解析、按钮未锁定
    ok('未答时不显示解析', document.getElementById('qFb').className.indexOf('show')<0);
    ok('未答时按钮未锁定', !document.querySelector('#qBody .jbtn').classList.contains('locked'));

    // 作答判断题（故意答错：选 ×；若答案正是×则选√，保证错）
    var wrongChoice = jq.answer==='√' ? '×' : '√';
    document.querySelector('#qBody .jbtn[data-v="'+wrongChoice+'"]').click();

    // 2) 答错后显示解析 + 正确答案标绿 + 我的选项标红 + 锁定
    var fb=document.getElementById('qFb');
    ok('答错后显示反馈', fb.className.indexOf('show')>=0);
    ok('答错后显示解析文本', fb.innerHTML.indexOf('解析')>=0);
    ok('答错后正确选项标绿', document.querySelector('#qBody .jbtn[data-v="'+jq.answer+'"]').classList.contains('correct'));
    ok('答错后我的选项标红', document.querySelector('#qBody .jbtn[data-v="'+wrongChoice+'"]').classList.contains('wrong'));
    ok('答错后按钮锁定', document.querySelector('#qBody .jbtn').classList.contains('locked'));

    // 3) 本轮 results 已记录
    ok('本轮 results 已记录该题', !!cur.session.results[jUid]);

    // 导航到第2题（未做），再点回第1题 → 应进入回放
    cur.session.idx=1; renderQuestion();
    ok('导航到未做题不显示解析', document.getElementById('qFb').className.indexOf('show')<0);
    cur.session.idx=0; renderQuestion();

    // 4) 回放：解析显示、回显选择、锁定、出现"下一题"
    ok('回放时显示解析', document.getElementById('qFb').innerHTML.indexOf('解析')>=0);
    ok('回放时正确选项标绿', document.querySelector('#qBody .jbtn[data-v="'+jq.answer+'"]').classList.contains('correct'));
    ok('回放时我的选项标红', document.querySelector('#qBody .jbtn[data-v="'+wrongChoice+'"]').classList.contains('wrong'));
    ok('回放时按钮锁定', document.querySelector('#qBody .jbtn').classList.contains('locked'));
    ok('回放时出现下一题按钮', !!document.getElementById('btnNext'));

    // 5) 重新做：清空本轮，导航全白、可重答
    restartRound();
    ok('重新做后 results 清空', Object.keys(cur.session.results).length===0);
    ok('重新做后回到第1题', cur.session.idx===0);
    ok('重新做后不显示解析', document.getElementById('qFb').className.indexOf('show')<0);
    ok('重新做后按钮未锁定', !document.querySelector('#qBody .jbtn').classList.contains('locked'));

    // 6) 全局错题本仍记录（重做不影响）
    ok('重做后错题本仍有记录', !!S.wrong[jUid]);

    out(JSON.stringify(results));
  }catch(e){ out('ERROR: '+(e&&e.stack||e)); }
})();
`;

let html = SRC.slice(0, SRC.lastIndexOf('</script>')) + HARNESS + '\n</script>';

const dom = new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true });
dom.window.scrollTo = ()=>{};

dom.window.addEventListener('load', ()=>{
  setTimeout(()=>{
    const el = dom.window.document.getElementById('__test_out');
    const txt = el ? el.textContent : '(no output)';
    console.log(txt);
    try{
      const results = JSON.parse(txt);
      let pass=0;
      results.forEach(r=>{ if(r.pass){pass++;console.log('✓',r.name)} else {console.error('✗',r.name)} });
      console.log(`\n${pass}/${results.length} 通过`);
      process.exit(pass===results.length?0:1);
    }catch(e){
      console.error('解析测试输出失败:', txt);
      process.exit(1);
    }
  }, 300);
});
