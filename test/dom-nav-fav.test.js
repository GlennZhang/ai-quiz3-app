#!/usr/bin/env node
/**
 * 右侧题号导航 收藏圆点角标 测试
 *  - 收藏题格子右上角有 .fav-dot
 *  - 未收藏题没有
 *  - toggleFav 后圆点即时更新
 *  - 图例含"收藏"说明
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
    var j1=Q.find(q=>q.type==='judge').uid;
    var j2=Q.filter(q=>q.type==='judge')[1].uid;
    var j3=Q.filter(q=>q.type==='judge')[2].uid;
    // 收藏 j2
    S.fav[j2]={ts:2}; save();

    startSession('all');
    cur.session.list=[j1,j2,j3]; cur.session.idx=0; cur.session.results={};
    renderQuestion();
    openNav();

    var grid=document.getElementById('npBody');
    var nums=grid.querySelectorAll('.nav-num');
    ok('导航有3个格子', nums.length===3);
    ok('收藏题 j2 有圆点', !!nums[1].querySelector('.fav-dot'));
    ok('未收藏 j1 无圆点', !nums[0].querySelector('.fav-dot'));
    ok('未收藏 j3 无圆点', !nums[2].querySelector('.fav-dot'));
    ok('圆点是黄色背景', nums[1].querySelector('.fav-dot').style.background==='' ); // style空=用CSS class
    ok('收藏题 title 含"已收藏"', (nums[1].title||'').indexOf('已收藏')>=0);

    // 图例含收藏
    ok('图例含"收藏"说明', grid.querySelector('.nav-legend').textContent.indexOf('收藏')>=0);

    // toggleFav 后即时更新：收藏 j1
    toggleFav(j1);
    var nums2=document.getElementById('npBody').querySelectorAll('.nav-num');
    ok('收藏 j1 后其格子出现圆点', !!nums2[0].querySelector('.fav-dot'));

    // 取消 j2 收藏
    toggleFav(j2);
    var nums3=document.getElementById('npBody').querySelectorAll('.nav-num');
    ok('取消 j2 后其圆点消失', !nums3[1].querySelector('.fav-dot'));

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
