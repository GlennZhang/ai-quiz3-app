#!/usr/bin/env node
/* TOOLS + dispatchTool 单测 */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const AI_SRC = fs.readFileSync(path.resolve(__dirname,'../ai-tutor.js'),'utf-8');
function makeDOM(){
  const html = `<!DOCTYPE html><html><body><script>${AI_SRC}</script></body></html>`;
  return new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true });
}
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('✓',n);} else {fail++;console.error('✗',n);} }
const A = makeDOM().window.AiTutor;

const Q = [{uid:'judge_1',type:'judge',typeLabel:'判断题',stem:'s',options:{},answer:'√',explanation:'e'}];
const QMAP = { judge_1:Q[0] };
const S = { wrong:{judge_1:{count:2,streak:1}}, right:{}, totalAns:3, totalRight:1 };
const adapter = A.makeAdapter(S, Q, QMAP);

ok('TOOLS 是数组且含 4 个', Array.isArray(A.TOOLS) && A.TOOLS.length === 4);
ok('TOOLS[0] 是 function 类型', A.TOOLS[0].type === 'function');
const names = A.TOOLS.map(t=>t.function.name);
ok('含 get_progress_stats', names.indexOf('get_progress_stats')>=0);
ok('含 get_wrong_questions', names.indexOf('get_wrong_questions')>=0);
ok('含 get_question', names.indexOf('get_question')>=0);
ok('含 search_questions', names.indexOf('search_questions')>=0);
ok('get_question 入参 schema 含 uid', !!A.TOOLS.find(t=>t.function.name==='get_question').function.parameters.properties.uid);

const r1 = A.dispatchTool({ function:{ name:'get_wrong_questions', arguments:'{"limit":5}' } }, adapter);
ok('dispatch get_wrong_questions 返回数组', Array.isArray(r1) && r1.length === 1 && r1[0].uid === 'judge_1');
const r2 = A.dispatchTool({ function:{ name:'get_question', arguments:'{"uid":"judge_1"}' } }, adapter);
ok('dispatch get_question 返回详情', r2 && r2.uid === 'judge_1');
const r3 = A.dispatchTool({ function:{ name:'get_progress_stats', arguments:'{}' } }, adapter);
ok('dispatch get_progress_stats 返回 total', r3 && r3.total === 1);
const r4 = A.dispatchTool({ function:{ name:'search_questions', arguments:'{"keyword":"s"}' } }, adapter);
ok('dispatch search_questions 命中', Array.isArray(r4) && r4.length === 1);
const r5 = A.dispatchTool({ function:{ name:'get_progress_stats', arguments:'{坏json' } }, adapter);
ok('坏 JSON 容错执行', r5 && r5.total === 1);
const r6 = A.dispatchTool({ function:{ name:'no_such_tool', arguments:'{}' } }, adapter);
ok('未知工具返回 error', r6 && r6.error && /未知工具/.test(r6.error));

console.log('\n'+pass+'/'+(pass+fail)+' 通过');
process.exit(fail ? 1 : 0);
