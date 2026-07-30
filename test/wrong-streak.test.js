#!/usr/bin/env node
/**
 * 错题本"连续答对 N 次才移除"逻辑测试（端到端，加载真实 index.html）
 * 验证：
 *  - 错题连续答对 1~4 次：仍在错题本，streak 递增
 *  - 连续答对第 5 次：从错题本移除
 *  - 中途答错：streak 重置为 0（"连续"被打断），count 递增，仍留在错题本
 *  - 旧数据无 streak 字段：向后兼容，不报错、答对一次 streak=1 且不误删
 *  - 移除后再次答错：重新进入错题本，streak=0
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
    // 预置三道错题
    S.wrong['judge_1'] = {count:1, last:1, streak:0};   // 标准数据
    S.wrong['judge_2'] = {count:1, last:1, streak:0};   // 测中途答错重置
    S.wrong['judge_3'] = {count:3, last:1};             // 旧数据：无 streak 字段

    // —— 连续答对 1~4 次：仍留错题本，streak 递增 ——
    for(var i=1;i<=4;i++){ recordResult('judge_1', true, ['√']); }
    ok('答对4次后仍在错题本', !!S.wrong['judge_1']);
    ok('答对4次后 streak=4', S.wrong['judge_1'] && S.wrong['judge_1'].streak===4);

    // —— 第 5 次答对：移除 ——
    recordResult('judge_1', true, ['√']);
    ok('连续答对5次后移出错题本', !S.wrong['judge_1']);

    // —— 中途答错重置 streak ——
    recordResult('judge_2', true, ['√']);
    recordResult('judge_2', true, ['√']);
    ok('judge_2 连续答对2次 streak=2', S.wrong['judge_2'] && S.wrong['judge_2'].streak===2);
    recordResult('judge_2', false, ['×']);
    ok('judge_2 答错后仍留错题本', !!S.wrong['judge_2']);
    ok('judge_2 答错后 streak 重置为0', S.wrong['judge_2'] && S.wrong['judge_2'].streak===0);
    ok('judge_2 答错后 count 递增为2', S.wrong['judge_2'] && S.wrong['judge_2'].count===2);
    // 重置后再连续答对5次仍可移除
    for(var j=1;j<=5;j++){ recordResult('judge_2', true, ['√']); }
    ok('judge_2 重置后再连续答对5次移除', !S.wrong['judge_2']);

    // —— 旧数据无 streak 字段：向后兼容 ——
    recordResult('judge_3', true, ['√']);
    ok('旧数据无streak，答对1次后 streak=1', S.wrong['judge_3'] && S.wrong['judge_3'].streak===1);
    ok('旧数据答对1次未误删', !!S.wrong['judge_3']);

    // —— 移除后再次答错：重新进错题本 ——
    recordResult('judge_1', false, ['×']);
    ok('移除后再次答错重新进入错题本', !!S.wrong['judge_1']);
    ok('重新进入错题本 streak=0', S.wrong['judge_1'] && S.wrong['judge_1'].streak===0);

    out(JSON.stringify(R));
  }catch(e){ out('ERROR: '+(e&&e.stack||e)); }
})();
`;

let html = SRC.slice(0, SRC.lastIndexOf('</script>')) + HARNESS + '\n</script>';
const dom = new JSDOM(html, {
  runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true,
  beforeParse(window){ window.localStorage.setItem('aitrainer_lv3_v1', JSON.stringify({})); }
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
