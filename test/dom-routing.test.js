#!/usr/bin/env node
/**
 * 路由测试：所有 show() 的视图名必须在 views 数组中注册，
 * 否则对应 section 永远不会拿到 active 类（页面显示空白）。
 * 回归场景：点击首页"模拟考试"入口后页面无任何内容。
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf-8');

const HARNESS = `
;(function(){
  function out(s){ var d=document.createElement('div'); d.id='__out'; d.textContent=s; document.body.appendChild(d); }
  var R=[]; function ok(n,c){ R.push({name:n,pass:!!c}); }
  window.confirm=function(){return true;};
  try{
    // views 数组应覆盖所有 view-* section
    var sections=[].slice.call(document.querySelectorAll('section.view')).map(function(s){return s.id.replace(/^view-/,'')});
    sections.forEach(function(v){
      ok('路由表包含视图 '+v, views.indexOf(v)>=0);
    });

    // 点击首页入口应激活 view-exam
    document.getElementById('goExam').click();
    ok('点击模拟考试后 view-exam 激活', document.getElementById('view-exam').classList.contains('active'));
    ok('点击模拟考试后 view-home 失活', !document.getElementById('view-home').classList.contains('active'));

    // 考试记录视图
    show('exam-history');
    ok('show(exam-history) 激活 view-exam-history', document.getElementById('view-exam-history').classList.contains('active'));

    // 考试结果视图
    show('exam-report');
    ok('show(exam-report) 激活 view-exam-report', document.getElementById('view-exam-report').classList.contains('active'));

    out(JSON.stringify(R));
  }catch(e){ out('ERROR: '+(e&&e.stack||e)); }
})();
`;

let html = SRC.slice(0, SRC.lastIndexOf('</script>')) + HARNESS + '\n</script>';
const dom = new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true });
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
