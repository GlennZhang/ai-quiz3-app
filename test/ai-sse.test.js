#!/usr/bin/env node
/* SSE delta 累积单测 */
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

const acc = A.newAccumulator();
A.applyDelta(acc, { choices:[{ delta:{ content:'你好' }, finish_reason:null }] });
A.applyDelta(acc, { choices:[{ delta:{ content:'，世界' }, finish_reason:null }] });
A.applyDelta(acc, { choices:[{ delta:{}, finish_reason:'stop' }] });
const m1 = A.finalizeAssistant(acc);
ok('文本累积', m1.content === '你好，世界');
ok('finish_reason=stop', m1.finish_reason === 'stop');
ok('无 tool_calls 时为 undefined', m1.tool_calls === undefined);
ok('role=assistant', m1.role === 'assistant');

const acc2 = A.newAccumulator();
A.applyDelta(acc2, { choices:[{ delta:{ tool_calls:[{ index:0, id:'call_1', type:'function', function:{ name:'get_wrong_questions', arguments:'' } }] }, finish_reason:null }] });
A.applyDelta(acc2, { choices:[{ delta:{ tool_calls:[{ index:0, function:{ arguments:'{"limit":' } }] }, finish_reason:null }] });
A.applyDelta(acc2, { choices:[{ delta:{ tool_calls:[{ index:0, function:{ arguments: '5}' } }] }, finish_reason:null }] });
A.applyDelta(acc2, { choices:[{ delta:{}, finish_reason:'tool_calls' }] });
const m2 = A.finalizeAssistant(acc2);
ok('tool_calls 存在', !!m2.tool_calls && m2.tool_calls.length === 1);
ok('tool_call.name', m2.tool_calls[0].function.name === 'get_wrong_questions');
ok('tool_call.arguments 拼接', m2.tool_calls[0].function.arguments === '{"limit":5}');
ok('tool_call.id', m2.tool_calls[0].id === 'call_1');
ok('finish_reason=tool_calls', m2.finish_reason === 'tool_calls');
ok('有 tool_calls 时 content 为 null', m2.content === null);

const acc3 = A.newAccumulator();
A.applyDelta(acc3, { choices:[{ delta:{ tool_calls:[{ index:0, id:'c', type:'function', function:{ name:'get_question', arguments:'{"uid' } }] }, finish_reason:'length' }] });
const m3 = A.finalizeAssistant(acc3);
ok('length 截断 finish_reason', m3.finish_reason === 'length');

console.log('\n'+pass+'/'+(pass+fail)+' 通过');
process.exit(fail ? 1 : 0);
