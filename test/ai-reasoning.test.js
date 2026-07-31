#!/usr/bin/env node
/* reasoning_content（GLM-4.7 / DeepSeek-R1 等思考模型）处理：
   模型把内容放 delta.reasoning_content 而 content 为空时，仍应作为文本显示与保存。 */
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

  // 模拟 GLM-4.7：reasoning_content 带完整回答，content 全空，最后 finish=stop
  const queue=[ sseOf([
    {reasoning:'## 错题薄弱知识点总结\n\n'},
    {reasoning:'数据处理流程是核心薄弱点。'},
    {content:''},
    {content:'', finish:'stop'}
  ]) ];
  const evs=[];
  const out = await A.runAgentLoop({ messages:[{role:'user',content:'总结错题'}], config, adapter, fetchFn: async()=>queue.shift(), onEvent:e=>evs.push(e) });

  ok('reasoning 触发 text_delta', evs.some(e=>e.type==='text_delta' && /总结/.test(e.text)));
  ok('reasoning 内容进入 assistant.content', /数据处理流程/.test(out[out.length-1].content || ''));
  ok('触发 done', evs.some(e=>e.type==='done'));

  console.log('\n'+pass+'/'+(pass+fail)+' 通过');
  process.exit(fail ? 1 : 0);
})();
