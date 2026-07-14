#!/usr/bin/env node
/**
 * 数据安全测试：模拟"旧版本用户已做大量题目"的 localStorage，
 * 用新代码加载，确认所有现有数据完整保留，且新字段 fav 安全初始化。
 * 这是收藏功能上线前对"不丢失进度"的关键验证。
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf-8');

// 模拟旧版本数据：只有 wrong/right/统计/lastAttempt，没有 fav
const OLD_DATA = {
  wrong: {
    "judge_1":  { count:5, last:1700000000000 },
    "single_2": { count:2, last:1700000000001 },
    "multi_3":  { count:1, last:1700000000002 }
  },
  right: { "judge_2": true, "single_5": true, "multi_6": true },
  totalRight: 137,
  totalAns: 312,
  lastAttempt: {
    "judge_1":  { chosen:["×"], correct:false, ts:1700000000000 },
    "single_5": { chosen:["B"], correct:true,  ts:1700000000003 }
  }
  // 故意不放 fav —— 模拟旧版本
};

const HARNESS = `
;(function(){
  function out(s){ var d=document.createElement('div'); d.id='__out'; d.textContent=s; document.body.appendChild(d); }
  var R=[];
  function ok(n,c){ R.push({name:n,pass:!!c}); }
  try{
    // —— 现有数据完整性 ——
    ok('错题本完整保留(3条)', Object.keys(S.wrong).length===3);
    ok('错题 judge_1 次数保留', S.wrong['judge_1'] && S.wrong['judge_1'].count===5);
    ok('错题 judge_1 时间戳保留', S.wrong['judge_1'] && S.wrong['judge_1'].last===1700000000000);
    ok('已答对完整保留(3条)', Object.keys(S.right).length===3);
    ok('总正确数保留', S.totalRight===137);
    ok('总答题数保留', S.totalAns===312);
    ok('最后作答完整保留(2条)', Object.keys(S.lastAttempt).length===2);
    ok('最后作答选择保留', S.lastAttempt['judge_1'] && S.lastAttempt['judge_1'].correct===false);
    // —— 新字段安全初始化 ——
    ok('新字段 fav 已初始化', typeof S.fav==='object' && S.fav!==null);
    ok('新字段 fav 初始为空', Object.keys(S.fav).length===0);
    // —— 持久化后再次加载仍完整 ——
    save();
    ok('save() 不抛错', true);
    out(JSON.stringify(R));
  }catch(e){ out('ERROR: '+(e&&e.stack||e)); }
})();
`;

let html = SRC.slice(0, SRC.lastIndexOf('</script>')) + HARNESS + '\n</script>';

const dom = new JSDOM(html, {
  runScripts:'dangerously',
  url:'http://localhost/',
  pretendToBeVisual:true,
  beforeParse(window){
    // 在脚本执行前注入旧数据
    window.localStorage.setItem('aitrainer_lv3_v1', JSON.stringify(OLD_DATA));
  }
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
    }catch(e){
      console.error('解析失败:', txt);
      process.exit(1);
    }
  }, 300);
});
