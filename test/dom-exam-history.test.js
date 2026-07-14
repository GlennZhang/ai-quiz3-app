#!/usr/bin/env node
/**
 * 考试历史记录端到端测试：
 *  - 交卷后记录持久化到 S.exams
 *  - 历史记录列表页（次数/平均/最高）
 *  - 详情页显示分数 + 每题你的选项/正确答案/对错
 *  - 首页卡片显示考试次数
 *  - 多次考试按最新在前
 *  - 旧数据兼容（无 exams 字段安全）
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf-8');

const OLD_DATA = { wrong:{judge_1:{count:1,last:1}}, right:{}, totalRight:5, totalAns:10, lastAttempt:{} };

const HARNESS = `
;(function(){
  function out(s){ var d=document.createElement('div'); d.id='__out'; d.textContent=s; document.body.appendChild(d); }
  var R=[]; function ok(n,c){ R.push({name:n,pass:!!c}); }
  window.confirm=function(){return true;};
  try{
    ok('首页有考试记录入口', !!document.getElementById('goExamHistory'));
    ok('首页初始:暂无考试记录', document.getElementById('examHistSub').textContent.indexOf('暂无')>=0);
    ok('旧数据兼容:错题本保留', !!S.wrong['judge_1']);
    ok('旧数据兼容:exams字段已初始化', Array.isArray(S.exams) && S.exams.length===0);

    function runExam(){
      renderExamSetup();
      document.getElementById('cj').value=3; document.getElementById('cs').value=2; document.getElementById('cm').value=0;
      document.querySelector('#modeSeg button[data-m="exam"]').click();
      startExam();
      var L=cur.session.list;
      for(var i=0;i<L.length;i++){
        cur.session.idx=i; renderExamQuestion();
        var u=L[i], q=QMAP[u];
        if(q.type==='multi'){ q.answer.forEach(function(k){document.querySelector('#qBody .opt[data-key="'+k+'"]').click();}); }
        else if(q.type==='judge'){ document.querySelector('#qBody .jbtn[data-v="'+q.answer+'"]').click(); }
        else { document.querySelector('#qBody .opt[data-key="'+q.answer+'"]').click(); }
      }
      submitExam();
      return L;
    }

    // 第一次考试（全对）
    var L1=runExam();
    ok('第1次交卷后S.exams有1条', S.exams.length===1);
    ok('记录含detail', !!S.exams[0].detail && S.exams[0].detail.length===L1.length);
    ok('记录含每题chosen', S.exams[0].detail.every(function(d){return d.chosen!==undefined;}));
    ok('记录含时间戳', typeof S.exams[0].ts==='number');
    ok('记录含用时', typeof S.exams[0].usedSec==='number');
    ok('记录含配置快照', !!S.exams[0].cfg && !!S.exams[0].cfg.scores);

    // 第二次考试（故意答错判断题）
    renderExamSetup();
    document.getElementById('cj').value=2; document.getElementById('cs').value=0; document.getElementById('cm').value=0;
    document.querySelector('#modeSeg button[data-m="exam"]').click();
    startExam();
    var L2=cur.session.list;
    for(var j=0;j<L2.length;j++){
      cur.session.idx=j; renderExamQuestion();
      var u2=L2[j], q2=QMAP[u2];
      // 全答错：选相反
      var wrong = q2.answer==='√'?'×':'√';
      document.querySelector('#qBody .jbtn[data-v="'+wrong+'"]').click();
    }
    submitExam();
    ok('第2次交卷后S.exams有2条', S.exams.length===2);
    ok('最新在前(S.exams[0]是第2次)', S.exams[0].detail.length===2 && S.exams[0].pct===0);

    // 首页卡片更新
    renderHome();
    ok('首页卡片显示2次', document.getElementById('examHistSub').textContent.indexOf('2 次')>=0);

    // 历史记录列表页
    renderExamHistory();
    ok('列表页显示2条记录', document.querySelectorAll('#examHistory [data-idx]').length===2);
    ok('列表页显示统计(次数/平均/最高)', document.getElementById('examHistory').innerHTML.indexOf('考试次数')>=0);

    // 点开第1条（最新=第2次全错）详情
    renderExamReport(S.exams[0], false);
    var rep=document.getElementById('examReport').innerHTML;
    ok('详情页显示得分', rep.indexOf('%')>=0);
    ok('详情页显示时间', rep.indexOf(':')>=0);
    ok('详情页显示全部题(你的答案)', rep.indexOf('你：')>=0);
    ok('详情页显示正确答案', rep.indexOf('正确：')>=0);
    ok('详情页显示对错标记', rep.indexOf('✗')>=0);
    ok('详情页有解析按钮', rep.indexOf('解析')>=0);
    ok('详情页含返回记录列表按钮', !!document.getElementById('erHistory'));

    // 旧数据再加载验证：模拟刷新（重新加载S）
    save();
    var reloaded=JSON.parse(localStorage.getItem('aitrainer_lv3_v1'));
    ok('持久化:exams已存localStorage', !!reloaded.exams && reloaded.exams.length===2);
    ok('持久化:旧错题本仍在', !!reloaded.wrong['judge_1']);

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
  },500);
});
