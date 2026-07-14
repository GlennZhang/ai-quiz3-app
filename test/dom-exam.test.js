#!/usr/bin/env node
/**
 * 模拟考试端到端测试：
 *  - 首页入口 / 配置页
 *  - 练习模式：组卷→即时反馈
 *  - 考试模式：组卷→答题(不反馈)→导航→交卷→报告(得分/正确率/错题)
 *  - 考试作答更新错题本
 *  - 旧数据兼容
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf-8');

const OLD_DATA = { wrong:{}, right:{}, totalRight:10, totalAns:20, lastAttempt:{} };

const HARNESS = `
;(function(){
  function out(s){ var d=document.createElement('div'); d.id='__out'; d.textContent=s; document.body.appendChild(d); }
  var R=[]; function ok(n,c){ R.push({name:n,pass:!!c}); }
  window.confirm=function(){return true;};
  try{
    ok('首页有模拟考试入口', !!document.getElementById('goExam'));
    ok('首页有配置页view-exam', !!document.getElementById('view-exam'));

    // ===== 练习模式 =====
    renderExamSetup();
    ok('配置页渲染表单', document.querySelectorAll('#examSetup input').length>6);
    document.getElementById('cj').value=2; document.getElementById('cs').value=2; document.getElementById('cm').value=1;
    document.querySelector('#modeSeg button[data-m="practice"]').click();
    startExam();
    ok('练习模式: session启动', !!cur.session && cur.session.mode==='practice');
    ok('练习模式: 题量=5', cur.session.list.length===5);
    // 练习模式走 renderQuestion，可即时答题
    var u0=cur.session.list[0], q0=QMAP[u0];
    var sel0 = q0.type==='multi' ? ('.opt[data-key="'+q0.answer[0]+'"]') : (q0.type==='judge' ? '.jbtn[data-v="'+q0.answer+'"]' : '.opt[data-key="'+q0.answer+'"]');
    document.querySelector('#qBody '+sel0).click();
    ok('练习模式: 答题有即时反馈', document.getElementById('qFb').className.indexOf('show')>=0);
    ok('练习模式: 答题后解析显示', document.getElementById('qFb').innerHTML.indexOf('解析')>=0);
    endSession();

    // ===== 考试模式 =====
    renderExamSetup();
    document.getElementById('cj').value=4; document.getElementById('cs').value=3; document.getElementById('cm').value=0;
    document.querySelector('#modeSeg button[data-m="exam"]').click();
    startExam();
    ok('考试模式: session启动', !!cur.session && cur.session.mode==='exam');
    ok('考试模式: 有answers对象', typeof cur.session.answers==='object');
    ok('考试模式: 初始无即时反馈', document.getElementById('qFb').className.indexOf('show')<0);
    ok('考试模式: 收藏按钮隐藏', document.getElementById('btnFav').style.display==='none');

    // 答第一题(判断)
    var eu=cur.session.list[0], eq=QMAP[eu];
    var jq = eq.type==='judge' ? '.jbtn[data-v="'+eq.answer+'"]' : '.opt[data-key="'+eq.answer+'"]';
    document.querySelector('#qBody '+jq).click();
    ok('考试模式: 记录答案', cur.session.answers[eu]!==undefined);
    ok('考试模式: 选项高亮(sel)', !!document.querySelector('#qBody .sel'));

    // 下一题
    document.querySelector('#qCard .qfoot .btn.primary').click();
    ok('考试模式: 下一题(idx=1)', cur.session.idx===1);
    // 上一题
    var footBtns=document.querySelectorAll('#qCard .qfoot button');
    footBtns[0].click(); // 上一题
    ok('考试模式: 上一题(idx=0)', cur.session.idx===0);
    // 回到第1题，答案仍保留
    ok('考试模式: 答案保留', cur.session.answers[eu]!==undefined);

    // 全部答对后交卷
    var L=cur.session.list;
    for(var i=0;i<L.length;i++){
      cur.session.idx=i; renderExamQuestion();
      var u=L[i], q=QMAP[u];
      if(q.type==='multi'){ q.answer.forEach(function(k){ document.querySelector('#qBody .opt[data-key="'+k+'"]').click(); }); }
      else if(q.type==='judge'){ document.querySelector('#qBody .jbtn[data-v="'+q.answer+'"]').click(); }
      else { document.querySelector('#qBody .opt[data-key="'+q.answer+'"]').click(); }
    }
    ok('考试模式: 全部已答', Object.keys(cur.session.answers).length===L.length);
    submitExam();
    ok('考试模式: 交卷后显示报告', document.getElementById('examReport').innerHTML.length>0);
    ok('考试模式: 报告含得分', document.getElementById('examReport').innerHTML.indexOf('%')>=0);
    ok('考试模式: 报告含知识点统计', document.getElementById('examReport').innerHTML.indexOf('知识点')>=0);
    ok('考试模式: 全对得100%', document.getElementById('examReport').innerHTML.indexOf('100%')>=0);
    ok('考试模式: 交卷后session清空', !cur.session);
    ok('考试模式: 全对不进错题本', Object.keys(S.wrong).length===0);
    ok('考试模式: 统计已更新(答题数增加)', S.totalAns>=20+L.length);

    out(JSON.stringify(R));
  }catch(e){ out('ERROR: '+(e&&e.stack||e)); }
})();
`;

let html = SRC.slice(0, SRC.lastIndexOf('</script>')) + HARNESS + '\n</script>';
const dom = new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true,
  beforeParse(window){ window.localStorage.setItem('aitrainer_lv3_v1', JSON.stringify(OLD_DATA)); } });
dom.window.scrollTo = ()=>{};
dom.window.addEventListener('load', ()=>{
  setTimeout(()=>{
    const el=dom.window.document.getElementById('__out'); const txt=el?el.textContent:'(no output)';
    try{
      const R=JSON.parse(txt); let pass=0;
      R.forEach(r=>{ if(r.pass){pass++;console.log('✓',r.name)} else {console.error('✗',r.name)} });
      console.log('\n'+pass+'/'+R.length+' 通过'); process.exit(pass===R.length?0:1);
    }catch(e){ console.error('解析失败:',txt); process.exit(1); }
  },400);
});
