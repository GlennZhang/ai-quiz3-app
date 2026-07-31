#!/usr/bin/env node
/* renderMarkdown 单测：各 markdown 语法 + XSS 安全 */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const AI_SRC = fs.readFileSync(path.resolve(__dirname,'../ai-tutor.js'),'utf-8');
function makeDOM(){
  const html = `<!DOCTYPE html><html><body><script>${AI_SRC}</script></body></html>`;
  return new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true });
}
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('✓',n);} else {fail++;console.error('✗',n);} }
const has = (s, sub) => String(s).indexOf(sub) >= 0;
const A = makeDOM().window.AiTutor;
const R = s => A.renderMarkdown(s);

ok('标题 ## → <h2>', has(R('## 标题'), '<h2>标题</h2>'));
ok('标题 ### → <h3>', has(R('### 小标题'), '<h3>'));
ok('粗体 ** → <strong>', has(R('**重点**'), '<strong>重点</strong>'));
ok('无序列表 - → <ul><li>', has(R('- 苹果\n- 香蕉'), '<ul>') && has(R('- 苹果\n- 香蕉'), '<li>苹果</li>') && has(R('- 苹果\n- 香蕉'), '<li>香蕉</li>'));
ok('有序列表 1. → <ol><li>', has(R('1. 第一\n2. 第二'), '<ol>') && has(R('1. 第一\n2. 第二'), '<li>第一</li>'));
ok('引用 > → <blockquote>', has(R('> 引用文本'), '<blockquote>') && has(R('> 引用文本'), '引用文本'));
ok('行内代码 ` → <code>', has(R('用 `code` 函数'), '<code>code</code>'));
ok('代码块 ``` → <pre><code>', has(R('```\nlet x=1\n```'), '<pre><code>') && has(R('```\nlet x=1\n```'), 'let x=1'));
ok('表格 → <table><th><td>', has(R('| 甲 | 乙 |\n|---|---|\n| 1 | 2 |'), '<table>') && has(R('| 甲 | 乙 |\n|---|---|\n| 1 | 2 |'), '<th>甲</th>') && has(R('| 甲 | 乙 |\n|---|---|\n| 1 | 2 |'), '<td>1</td>'));
ok('段落 → <p>', has(R('一段文字'), '<p>'));
ok('混合：标题+列表+粗体', has(R('## 题\n- **重点** 项'), '<h2>') && has(R('## 题\n- **重点** 项'), '<li>') && has(R('## 题\n- **重点** 项'), '<strong>重点</strong>'));

// XSS：renderMarkdown 必须先 escapeHtml，所有原文 < > 被转义，无活标签
const xss1 = R('<script>alert(1)</script>');
ok('XSS: <script> 被转义(无活标签)', !has(xss1, '<script>'));
const xss2 = R('<img src=x onerror=alert(1)>');
ok('XSS: <img 标签被转义(不活)', !has(xss2, '<img>'));
ok('XSS: 代码块内的 <script> 也转义', !has(R('```\n<script>x</script>\n```'), '<script>'));

console.log('\n'+pass+'/'+(pass+fail)+' 通过');
process.exit(fail ? 1 : 0);
