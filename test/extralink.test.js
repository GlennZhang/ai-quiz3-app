#!/usr/bin/env node
/**
 * 延伸学习外部链接测试：
 *  - 首页「延伸学习」区块存在指向实操补充知识的外部链接
 *  - 新窗口打开（target=_blank）+ rel 含 noopener（安全，防 reverse tabnabbing）
 *  - 文案与区块标题正确
 * 纯静态 DOM 解析（不执行脚本），轻量快速。
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf-8');

const dom = new JSDOM(SRC, { url:'http://localhost/' });
const doc = dom.window.document;

let pass=0, total=0;
function check(name, fn){
  total++;
  try{ fn(); pass++; console.log('✓', name); }
  catch(e){ console.error('✗', name, '\n  ', e.message); }
}

const home = doc.querySelector('#view-home');
check('首页存在 #view-home', ()=>{ if(!home) throw new Error('找不到 #view-home'); });

const link = home && home.querySelector('a[href*="ai-trainer.nccloudservice.com"]');
check('首页存在实操补充知识外部链接', ()=>{ if(!link) throw new Error('找不到指向 ai-trainer.nccloudservice.com 的链接'); });
check('链接新窗口打开 target=_blank', ()=>{ if(!link || link.target!=='_blank') throw new Error('target 应为 _blank'); });
check('链接含 rel=noopener（安全）', ()=>{ if(!link || !(link.rel||'').includes('noopener')) throw new Error('rel 缺少 noopener'); });
check('链接文案含"实操补充知识"', ()=>{ if(!link || !link.textContent.includes('实操补充知识')) throw new Error('文案缺失'); });
check('链接位于"延伸学习"区块内', ()=>{
  if(!link) throw new Error('链接缺失');
  const sec = link.closest('.sec');
  if(!sec) throw new Error('链接不在 .sec 内');
  const h = sec.querySelector('.sec-h h2');
  if(!h || h.textContent.indexOf('延伸学习')<0) throw new Error('所属区块标题不是"延伸学习"');
});

console.log(`\n${pass}/${total} 通过`);
process.exit(pass===total?0:1);
