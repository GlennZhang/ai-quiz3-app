#!/usr/bin/env node
/**
 * 每日一练抽样测试（端到端，加载真实 index.html）
 * 验证：错题加权（概率更高）但不垄断，每次组合不同。
 *  - dailyWeight 权重：错题5 / 收藏3 / 未做2 / 已做对1
 *  - weightedSample 加权有效：高权重项被抽中频率显著更高
 *  - buildDaily 结构：判断6 + 单选8 + 多选6 = 20
 *  - buildDaily 多样性：多次抽样结果不全部相同
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
    var pool9=Q.slice(0,9);
    var wrongUids=[pool9[0].uid,pool9[1].uid,pool9[2].uid];
    var favUid=pool9[3].uid, rightUid=pool9[4].uid, undoneUid=pool9[5].uid;
    wrongUids.forEach(function(u){ S.wrong[u]={count:1,last:1,streak:0}; });
    S.fav[favUid]={ts:1}; S.right[rightUid]=true;

    // 1) dailyWeight 权重
    ok('错题权重5', dailyWeight(QMAP[wrongUids[0]])===5);
    ok('收藏权重3', dailyWeight(QMAP[favUid])===3);
    ok('未做权重2', dailyWeight(QMAP[undoneUid])===2);
    ok('已做对权重1', dailyWeight(QMAP[rightUid])===1);

    // 2) weightedSample 加权：H 权重9 vs L 权重1，抽 200 次单题，H 应明显更多
    var wp=[{uid:'H'},{uid:'L1'},{uid:'L2'}];
    var wf=function(q){ return q.uid==='H'?9:1; };
    var hCount=0; for(var i=0;i<200;i++){ if(weightedSample(wp,wf,1)[0]==='H') hCount++; }
    ok('高权重项出现率>70%(加权有效，实际 '+hCount+'/200)', hCount>140);

    // 3) buildDaily 结构：6+8+6=20
    var d=buildDaily();
    ok('每日一练共20题', d.length===20);
    var jc=d.filter(function(u){return QMAP[u]&&QMAP[u].type==='judge';}).length;
    var sc=d.filter(function(u){return QMAP[u]&&QMAP[u].type==='single';}).length;
    var mc=d.filter(function(u){return QMAP[u]&&QMAP[u].type==='multi';}).length;
    ok('题型分布 判断'+jc+'/单选'+sc+'/多选'+mc, jc===6&&sc===8&&mc===6);

    // 4) buildDaily 多样性：跑5次，至少出现2种不同组合
    var seen={}; for(var k=0;k<5;k++){ seen[buildDaily().join(',')]=1; }
    ok('5次抽样出现>=2种组合(每次不一样)', Object.keys(seen).length>=2);

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
