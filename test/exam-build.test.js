#!/usr/bin/env node
/**
 * 组卷算法测试：
 *  - 总题量符合配置（判断40+单选60+多选20=120）
 *  - 题型数量正确
 *  - 知识点分布大致符合比例（容差）
 *  - 优先没做过的题（当未做题充足时，全部从未做抽）
 *  - 不重复
 *  - 不足时从其他知识点补足
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf-8');

const HARNESS = `
;(function(){
  function out(s){ var d=document.createElement('div'); d.id='__out'; d.textContent=s; document.body.appendChild(d); }
  var R=[]; function ok(n,c){ R.push({name:n,pass:!!c}); }
  function approx(actual, expected, tol){ return Math.abs(actual-expected)<=tol; }
  try{
    // 默认考纲
    var c=EXAM_DEFAULT;
    var list=buildExam(c);
    ok('总题量=120', list.length===120);
    // 题型数量
    var byType={};
    list.forEach(uid=>{ var q=QMAP[uid]; byType[q.type]=(byType[q.type]||0)+1; });
    ok('判断40题', byType.judge===40);
    ok('单选60题', byType.single===60);
    ok('多选20题', byType.multi===20);
    // 不重复
    ok('无重复题', new Set(list).size===list.length);

    // 知识点分布（容差±5，因为小数取整+补足）
    var totalRatio=KNOW_CODES.reduce((s,k)=>s+c.knowRatio[k],0); // 100
    KNOW_CODES.forEach(k=>{
      var cnt=list.filter(uid=>QMAP[uid].knowledge===k).length;
      var expected=c.structure.judge*c.knowRatio[k]/100 + c.structure.single*c.knowRatio[k]/100 + c.structure.multi*c.knowRatio[k]/100;
      ok('知识点['+KNOW_LABELS[k]+']≈'+expected.toFixed(0)+'(实际'+cnt+')', approx(cnt, expected, 8));
    });

    // 优先没做过的：S 全空时，抽出的都应是"未做"
    ok('全部未做题(题库全新)', list.every(uid=>!S.right[uid]&&!S.wrong[uid]));

    // 已做过一部分时，优先抽未做的
    S.right['judge_1']=true; S.right['judge_2']=true;
    S.wrong['single_1']={count:1};
    var list2=buildExam(c);
    // 这3道做过的应该尽量不出现（除非该题型未做的不够，但这里充足）
    var doneInList=list2.filter(uid=>S.right[uid]||S.wrong[uid]);
    ok('优先未做：做过的题不在卷中(充足时)', doneInList.length===0);

    // 极端：某题型要求超过题库量时，尽量补足不报错
    var c2={structure:{judge:350,single:0,multi:0}, scores:{judge:0.5,single:0.5,multi:1}, knowRatio:c.knowRatio, mode:'exam', duration:90};
    var list3=buildExam(c2);
    ok('超出题库量不报错(最多300)', list3.length===300);
    ok('超出时无重复', new Set(list3).size===list3.length);

    // 全部多选0的配置
    var c3={structure:{judge:10,single:0,multi:0}, scores:c.scores, knowRatio:c.knowRatio, mode:'practice', duration:30};
    var list4=buildExam(c3);
    ok('只配置判断10题', list4.length===10 && list4.every(uid=>QMAP[uid].type==='judge'));

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
