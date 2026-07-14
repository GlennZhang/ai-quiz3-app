#!/usr/bin/env node
/**
 * 端到端测试：finishSet 清空 qCard 后 → "继续"/"再来一轮" 仍能正常渲染
 * 以及 resume 卡片在首页的显示与恢复
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf-8');

const HARNESS = `
;(function(){
  function out(s){ var d=document.createElement('div'); d.id='__test_out'; d.textContent=s; document.body.appendChild(d); }
  var results=[];
  function ok(name,cond){ results.push({name,pass:!!cond}); }
  try{
    // 用两道判断题构造一个短本轮
    var jUid = Q.find(q=>q.type==='judge').uid;
    var jUid2 = Q.filter(q=>q.type==='judge')[1].uid;
    cur.session = { mode:'all', list:[jUid,jUid2], idx:0, correct:0, wrong:0, title:'测试', single:false, results:{} };
    show('quiz');

    // 作答两题，触发 finishSet
    renderQuestion();
    var jq = QMAP[jUid];
    document.querySelector('#qBody .jbtn[data-v="'+jq.answer+'"]').click();  // 答对
    // autoNext 默认开，但 jsdom 的 setTimeout 仍会跑；手动 next 更稳
    setTimeout(function(){
      if(cur.session.idx===0) nextQuestion();
      renderQuestion();
      var jq2 = QMAP[cur.session.list[cur.session.idx]];
      document.querySelector('#qBody .jbtn[data-v="'+jq2.answer+'"]').click();

      setTimeout(function(){
        // 触发结束：点"查看结果"
        var nx=document.getElementById('btnNext');
        if(nx && nx.textContent.indexOf('查看结果')>=0) nx.click();

        setTimeout(function(){
          ok('finishSet 后显示结果摘要', !!document.querySelector('.summary'));
          ok('finishSet 后 qBody 已被清空', !document.getElementById('qBody'));

          // 回首页，检查"继续"卡片
          endSession();
          // 注意 endSession 清掉了持久化；这里手动造一个持久化 session 再渲染首页
          localStorage.setItem(SK_SESSION, JSON.stringify({mode:'all',list:[jUid,jUid2],idx:0,correct:0,wrong:0,title:'全部练习',single:false,results:{[jUid]:{chosen:['√'],correct:true}}}));
          renderHome();
          ok('首页显示"继续"卡片', document.getElementById('resumeCard').style.display!=='none');
          ok('继续卡片可点击', !!document.getElementById('resumeBtn'));

          // 点击继续 → 应恢复正常渲染（qCard 结构恢复）
          document.getElementById('resumeBtn').click();
          ok('继续后 qBody 恢复', !!document.getElementById('qBody'));
          ok('继续后显示题目', !!document.getElementById('qStem').textContent);
          ok('继续后回放显示解析', document.getElementById('qFb').innerHTML.indexOf('解析')>=0);

          out(JSON.stringify(results));
        }, 50);
      }, 50);
    }, 50);
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
    try{
      const results = JSON.parse(txt);
      let pass=0;
      results.forEach(r=>{ if(r.pass){pass++;console.log('✓',r.name)} else {console.error('✗',r.name)} });
      console.log(`\n${pass}/${results.length} 通过`);
      process.exit(pass===results.length?0:1);
    }catch(e){
      console.error('解析失败:', txt);
      process.exit(1);
    }
  }, 800);
});
