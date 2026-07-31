#!/usr/bin/env node
/* reasoning_content（GLM-4.7 / DeepSeek-R1 等思考模型）：reasoning 单独走 reasoning_delta 事件，
   存入 assistant.reasoning；content 为空时 reasoning 仍保留（UI 层兜底为回答）。 */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const AI_SRC = fs.readFileSync(path.resolve(__dirname,'../ai-tutor.js'),'utf-8');
function makeDOM(){
  const html = `<!DOCTYPE html><html><body><script>${AI_SRC}</script></body></html>`;
  return new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true,
    beforeParse(w){ w.TextDecoder = TextDecoder; } });
}
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('✓',n);} else {fail++;console.error('✗',n);} }
const A = makeDOM().window.AiTutor;

function sseOf(events){
  const lines = events.map(ev=>{
    const delta = {};
    if(ev.content != null) delta.content = ev.content;
    if(ev.reasoning != null) delta.reasoning_content = ev.reasoning;
    return 'data: ' + JSON.stringify({ choices:[{ delta, finish_reason: ev.finish || null }] }) + '\n\n';
  }).join('') + 'data: [DONE]\n\n';
  return { ok:true, status:200, body:new ReadableStream({ start(c){ c.enqueue(new TextEncoder().encode(lines)); c.close(); } }) };
}

(async ()=>{
  const Q=[{uid:'judge_1',type:'judge',typeLabel:'判断题',stem:'s',options:{},answer:'√',explanation:'e'}];
  const QMAP={judge_1:Q[0]};
  const adapter = A.makeAdapter({wrong:{judge_1:{count:1,streak:0}},right:{},totalAns:1,totalRight:0},Q,QMAP);
  const config = { baseUrl:'https://open.bigmodel.cn/api/paas/v4', apiKey:'sk', model:'glm-4.7' };

  // GLM-4.7：reasoning 有完整思考、content 为空
  const queue=[ sseOf([{reasoning:'## 总结\n数据处理流程是薄弱点。'},{content:''},{content:'',finish:'stop'}]) ];
  const evs=[];
  const out = await A.runAgentLoop({ messages:[{role:'user',content:'总结'}], config, adapter, fetchFn: async()=>queue.shift(), onEvent:e=>evs.push(e) });

  ok('reasoning 走 reasoning_delta 事件', evs.some(e=>e.type==='reasoning_delta' && /数据处理/.test(e.text)));
  ok('reasoning 不混入 text_delta', !evs.some(e=>e.type==='text_delta'));
  ok('assistant.reasoning 保留思考内容', /数据处理/.test(out[out.length-1].reasoning || ''));
  ok('content 空时 assistant.content 为 null', out[out.length-1].content === null);
  ok('触发 done', evs.some(e=>e.type==='done'));

  console.log('\n'+pass+'/'+(pass+fail)+' 通过');
  process.exit(fail ? 1 : 0);
})();
