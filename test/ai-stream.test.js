#!/usr/bin/env node
/* streamChat 流式客户端单测（async） */
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

function sseResponse(sseText){
  const body = new ReadableStream({ start(c){ c.enqueue(new TextEncoder().encode(sseText)); c.close(); } });
  return { ok:true, status:200, body };
}

(async ()=>{
  const sse = 'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n'
            + 'data: {"choices":[{"delta":{"content":"!"},"finish_reason":null}]}\n\n'
            + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
            + 'data: [DONE]\n\n';
  let calls = 0;
  const fetchFn = async (url, opts)=>{
    calls++;
    ok('URL 正确', url === 'https://api.x/v1/chat/completions');
    ok('方法 POST', opts.method === 'POST');
    ok('带 Authorization', opts.headers['Authorization'] === 'Bearer sk-1');
    ok('body stream:true', JSON.parse(opts.body).stream === true);
    ok('带 tools', Array.isArray(JSON.parse(opts.body).tools));
    ok('透传 signal', opts.signal === 'sig-token');
    return sseResponse(sse);
  };
  const chunks = [];
  for await (const c of A.streamChat({
    baseUrl:'https://api.x/v1', apiKey:'sk-1', model:'m',
    messages:[{role:'user',content:'hi'}], tools:[{type:'function',function:{name:'x'}}],
    signal:'sig-token', fetchFn
  })){ chunks.push(c); }
  ok('yield chunk 数量=3', chunks.length === 3);
  ok('首个 chunk 含 content Hi', chunks[0].choices[0].delta.content === 'Hi');

  const errFetch = async ()=>({ ok:false, status:401, body:new ReadableStream({start(c){c.close();}}) });
  let threw = false;
  try{ for await (const _ of A.streamChat({baseUrl:'https://api.x/v1',apiKey:'k',model:'m',messages:[],fetchFn:errFetch})){} }
  catch(e){ threw = true; ok('HTTP 错误含状态码', /401/.test(e.message)); }
  ok('HTTP 错误抛异常', threw);

  const noAuthFetch = async (url,opts)=>{ ok('无 key 无 Authorization', !opts.headers['Authorization']); return sseResponse('data: [DONE]\n\n'); };
  for await (const _ of A.streamChat({baseUrl:'https://api.x/v1',apiKey:'',model:'m',messages:[],fetchFn:noAuthFetch})){}

  console.log('\n'+pass+'/'+(pass+fail)+' 通过');
  process.exit(fail ? 1 : 0);
})();
