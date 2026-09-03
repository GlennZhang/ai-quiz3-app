#!/usr/bin/env node
/**
 * mock 页（机构模拟卷）回归测试：
 * 1. 路由：所有 view-* section 必须注册进 views 数组
 *    （回归场景：点击"模拟考试"后整页空白，与主应用 97bad1e 同款 bug）
 * 2. 判断题并入：题库含 300 道判断题，全部带 knowledge，uid 无重复
 * 3. 组卷：buildExam 能按考纲抽出判断题，且顺序为 judge→single→multi
 * 4. 考试配置 UI：判断题量/分值输入框（#cj/#sj）存在，upd() 不再因缺元素报错
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.resolve(__dirname, '../mock/index.html'), 'utf-8');

const HARNESS = `
;(function(){
  function out(s){ var d=document.createElement('div'); d.id='__out'; d.textContent=s; document.body.appendChild(d); }
  var R=[]; function ok(n,c){ R.push({name:n,pass:!!c}); }
  window.confirm=function(){return true;};
  try{
    // 1. 路由表覆盖所有 view-* section
    var sections=[].slice.call(document.querySelectorAll('section.view')).map(function(s){return s.id.replace(/^view-/,'')});
    sections.forEach(function(v){
      ok('路由表包含视图 '+v, views.indexOf(v)>=0);
    });
    document.getElementById('goExam').click();
    ok('点击模拟考试后 view-exam 激活', document.getElementById('view-exam').classList.contains('active'));
    ok('点击模拟考试后 view-home 失活', !document.getElementById('view-home').classList.contains('active'));

    // 2. 判断题并入题库
    var judges=Q.filter(function(q){return q.type==='judge'});
    ok('判断题共 300 道（实际 '+judges.length+'）', judges.length===300);
    ok('判断题全部带 knowledge', judges.every(function(q){return !!q.knowledge}));
    var uids=Q.map(function(q){return q.uid});
    ok('uid 无重复', uids.length===new Set(uids).size);
    ok('总题数 910（实际 '+Q.length+'）', Q.length===910);

    // 3. 组卷含判断题，且判断题排在最前
    var list=buildExam({structure:{judge:10,single:5,multi:5}, scores:{judge:0.5,single:0.5,multi:1}, knowRatio:{ethics:15,basics:25,analysis:15,training:30,design:10,guide:5}});
    ok('组卷返回 20 题（实际 '+list.length+'）', list.length===20);
    var first10=list.slice(0,10).every(function(u){return QMAP[u].type==='judge'});
    ok('前 10 题均为判断题（judge→single→multi 顺序）', first10);

    // 4. 考试配置 UI 含判断输入框
    document.getElementById('goExam').click();
    ok('考试配置含判断题量输入框 #cj', !!document.getElementById('cj'));
    ok('考试配置含判断分值输入框 #sj', !!document.getElementById('sj'));
    document.getElementById('cj').value='5';
    document.getElementById('cj').dispatchEvent(new Event('input'));
    ok('题量合计随判断输入更新', document.getElementById('cTotal').textContent==='85');

    out(JSON.stringify(R));
  }catch(e){ out('ERROR: '+(e&&e.stack||e)); }
})();
`;

let html = SRC.slice(0, SRC.lastIndexOf('</script>')) + HARNESS + '\n</script>';
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
dom.window.scrollTo = () => {};
dom.window.addEventListener('load', () => {
  setTimeout(() => {
    const el = dom.window.document.getElementById('__out'); const txt = el ? el.textContent : '(no output)';
    try {
      const R = JSON.parse(txt); let pass = 0;
      R.forEach(r => { if (r.pass) { pass++; console.log('✓', r.name); } else { console.error('✗', r.name); } });
      console.log('\n' + pass + '/' + R.length + ' 通过'); process.exit(pass === R.length ? 0 : 1);
    } catch (e) { console.error('解析失败:', txt); process.exit(1); }
  }, 400);
});
