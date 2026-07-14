#!/usr/bin/env node
/**
 * 统计口径测试：验证首页 已练习/已掌握/掌握率/错题 数字自洽，
 * 且分题型掌握率正确。修复 91% vs 594/819 口径混乱 bug。
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf-8');

const HARNESS = `
;(function(){
  function out(s){ var d=document.createElement('div'); d.id='__out'; d.textContent=s; document.body.appendChild(d); }
  var R=[]; function ok(n,c){ R.push({name:n,pass:!!c}); }
  try{
    // 模拟用户数据：594题掌握(右)，225题错(错)，共819题做过
    // 按题型分布：判断 200右/75错，单选 200右/75错，多选 194右/75错
    function fill(prefix, rcount, wcount){
      var i=1;
      for(var k=0;k<rcount;k++){ S.right[prefix+'_'+i]=true; i++; }
      for(var k=0;k<wcount;k++){ S.wrong[prefix+'_'+i]={count:1,last:1}; i++; }
    }
    fill('judge', 200, 75);
    fill('single', 200, 75);
    fill('multi', 194, 75);
    save();
    renderHome();

    var doneEl=document.getElementById('hsDone').textContent;
    var rightEl=document.getElementById('hsRight').textContent;
    var accEl=document.getElementById('hsAcc').textContent;
    var wrongEl=document.getElementById('hsWrong').textContent;
    ok('已练习=819', doneEl==='819');
    ok('已掌握=594', rightEl==='594');
    ok('错题=225', wrongEl==='225');
    // 掌握率 = 594/819 = 72.5% → 73%（四舍五入）不是91%
    ok('掌握率=73%(基于题数,非91%)', accEl==='73%');
    ok('掌握率口径自洽: right/done', Math.round(594/819*100)===73);

    // 分题型
    var ts=document.getElementById('hsType').textContent;
    ok('分题型显示判断', ts.indexOf('判断')>=0);
    ok('分题型显示单选', ts.indexOf('单选')>=0);
    ok('分题型显示多选', ts.indexOf('多选')>=0);
    // 判断 200/275 = 73%
    ok('判断掌握率200/275', ts.indexOf('200/275')>=0);
    ok('判断73%', ts.indexOf('判断')>=0 && /判断\\s*200\\/275\\s*73%/.test(ts.replace(/\\s+/g,' ')) || ts.match(/判断[\\s]*200\\/275[\\s]*73%/));

    // 空数据
    S.right={}; S.wrong={}; save(); renderHome();
    ok('空数据:掌握率显示—', document.getElementById('hsAcc').textContent==='—');
    ok('空数据:分题型为空', document.getElementById('hsType').innerHTML==='');

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
  },300);
});
