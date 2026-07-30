#!/usr/bin/env node
/* runAgentLoop 核心循环单测（async） */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const AI_SRC = fs.readFileSync(path.resolve(__dirname,'../ai-tutor.js'),'utf-8');
function makeDOM(){
  const html = `<!DOCTYPE html><html><body><script>${AI_SRC}</script></body></html>`;
  return new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true,
    beforeParse(window){ window.TextDecoder = TextDecoder; } });
}
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('✓',n);} else {fail++;console.error('✗',n);} }
const A = makeDOM().window.AiTutor;

function sseOf(events){
  const lines = events.map(ev=>{
    const delta = {};
    if(ev.content != null) delta.content = ev.content;
    if(ev.toolCalls) delta.tool_calls = ev.toolCalls;
    return 'data: ' + JSON.stringify({ choices:[{ delta, finish_reason: ev.finish || null }] }) + '\n\n';
  }).join('') + 'data: [DONE]\n\n';
  return { ok:true, status:200, body:new ReadableStream({ start(c){ c.enqueue(new TextEncoder().encode(lines)); c.close(); } }) };
}

(async ()=>{
  const Q=[{uid:'judge_1',type:'judge',typeLabel:'判断题',stem:'s',options:{},answer:'√',explanation:'e'}];
  const QMAP={judge_1:Q[0]};
  const baseAdapter = ()=>A.makeAdapter({wrong:{judge_1:{count:1,streak:0}},right:{},totalAns:1,totalRight:0},Q,QMAP);
  const baseConfig = { baseUrl:'https://api.x/v1', apiKey:'sk', model:'m' };

  let queue=[ sseOf([{content:'你好'},{finish:'stop'}]) ];
  let ev1=[];
  const out1 = await A.runAgentLoop({ messages:[{role:'system',content:'sys'},{role:'user',content:'hi'}], config:baseConfig, adapter:baseAdapter(), fetchFn: async()=>queue.shift(), onEvent:e=>ev1.push(e) });
  ok('单轮：1 次调用后队列空', queue.length===0);
  ok('单轮：末消息 assistant 文本', out1[out1.length-1].role==='assistant' && out1[out1.length-1].content==='你好');
  ok('单轮：触发 done', ev1.some(e=>e.type==='done'));
  ok('单轮：触发 text_delta', ev1.some(e=>e.type==='text_delta'));

  queue=[
    sseOf([{toolCalls:[{index:0,id:'c1',type:'function',function:{name:'get_wrong_questions',arguments:'{"limit":5}'}}],finish:'tool_calls'}]),
    sseOf([{content:'总结完成'},{finish:'stop'}])
  ];
  let ev2=[];
  const out2 = await A.runAgentLoop({ messages:[{role:'user',content:'总结错题'}], config:baseConfig, adapter:baseAdapter(), fetchFn: async()=>queue.shift(), onEvent:e=>ev2.push(e) });
  ok('多轮：2 次调用后队列空', queue.length===0);
  ok('多轮：消息含 tool 回灌', out2.some(m=>m.role==='tool' && m.tool_call_id==='c1'));
  ok('多轮：触发 tool_call 事件', ev2.some(e=>e.type==='tool_call'&&e.name==='get_wrong_questions'));
  ok('多轮：触发 tool_result 事件', ev2.some(e=>e.type==='tool_result'));

  queue=[
    sseOf([{toolCalls:[{index:0,id:'c2',type:'function',function:{name:'get_question',arguments:'{"uid":"judge_1"}'}}],finish:'length'}]),
    sseOf([{content:'重试成功'},{finish:'stop'}])
  ];
  let ev3=[];
  const out3 = await A.runAgentLoop({ messages:[{role:'user',content:'q'}], config:baseConfig, adapter:baseAdapter(), fetchFn: async()=>queue.shift(), onEvent:e=>ev3.push(e) });
  ok('length：触发 length_truncated', ev3.some(e=>e.type==='length_truncated'));
  ok('length：tool 消息含截断提示', /截断/.test(out3.find(m=>m.role==='tool').content));

  const loopSse = ()=> sseOf([{toolCalls:[{index:0,id:'cx',type:'function',function:{name:'get_progress_stats',arguments:'{}'}}],finish:'tool_calls'}]);
  let ev4=[];
  await A.runAgentLoop({ messages:[{role:'user',content:'x'}], config:baseConfig, adapter:baseAdapter(), fetchFn: async()=>loopSse(), onEvent:e=>ev4.push(e), maxTurns:3 });
  ok('MAX_TURNS：触发 max_turns', ev4.some(e=>e.type==='max_turns'));

  let ev5=[];
  const ac = new AbortController(); ac.abort();
  await A.runAgentLoop({ messages:[{role:'user',content:'x'}], config:baseConfig, adapter:baseAdapter(), signal:ac.signal, fetchFn: async()=>{ const e=new Error('aborted'); e.name='AbortError'; throw e; }, onEvent:e=>ev5.push(e) });
  ok('abort：触发 aborted', ev5.some(e=>e.type==='aborted'));

  console.log('\n'+pass+'/'+(pass+fail)+' 通过');
  process.exit(fail ? 1 : 0);
})();
