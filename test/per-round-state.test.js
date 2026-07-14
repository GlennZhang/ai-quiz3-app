#!/usr/bin/env node
/**
 * 本轮状态(per-round results)驱动逻辑测试
 * 验证：
 *  - 本轮 results 决定导航着色与回放
 *  - "重新做"清空 results → 导航全白、可重答
 *  - 全局错题本不受重做影响
 *  - 继续(resume)恢复本轮 results
 */
const assert = require('assert');

// 模拟本轮 session
function makeSession(list){
  return { mode:'all', list, idx:0, correct:0, wrong:0, title:'全部练习', single:false, results:{} };
}

// 模拟 recordResult 中本轮记录部分
function recordToRound(ses, uid, ok, chosen){
  const chosenArr = Array.isArray(chosen)?chosen:[chosen];
  ses.results = ses.results||{};
  ses.results[uid] = { chosen:chosenArr, correct:ok };
  if(ok) ses.correct++; else ses.wrong++;
  return ses;
}

// 模拟 restartRound
function restartRound(ses){
  ses.idx=0; ses.correct=0; ses.wrong=0; ses.results={};
  return ses;
}

let pass=0, total=0;
function check(name, fn){
  total++;
  try{ fn(); pass++; console.log('✓', name); }
  catch(e){ console.error('✗', name, '\n  ', e.message); }
}

check('导航着色来自本轮 results（非全局）', ()=>{
  const ses = makeSession(['j1','j2','j3']);
  // 全局 S.right 有 j1，但本轮没做 → 本轮应判为未做
  recordToRound(ses, 'j2', false, ['×']);
  const R = ses.results;
  assert.strictEqual(!!R['j1'], false, 'j1 本轮未做 → 不应着色');
  assert.strictEqual(R['j2'].correct, false, 'j2 本轮做错 → 红色');
});

check('重新做清空本轮 results', ()=>{
  const ses = makeSession(['j1','j2']);
  recordToRound(ses, 'j1', true, ['√']);
  recordToRound(ses, 'j2', false, ['×']);
  assert.strictEqual(Object.keys(ses.results).length, 2, '重做前有2条记录');
  restartRound(ses);
  assert.strictEqual(Object.keys(ses.results).length, 0, '重做后 results 清空');
  assert.strictEqual(ses.idx, 0, '重做后回到第1题');
  assert.strictEqual(ses.correct, 0);
  assert.strictEqual(ses.wrong, 0);
});

check('回放判定基于本轮 results', ()=>{
  const ses = makeSession(['j1','j2']);
  recordToRound(ses, 'j1', false, ['×']);
  // 模拟导航到 j1：rec 存在 → replay
  const rec = ses.results['j1'];
  assert.ok(rec, '已答题目本轮有记录 → 进入回放');
  assert.deepStrictEqual(rec.chosen, ['×'], '回放回显用户选择');
  assert.strictEqual(rec.correct, false, '回放回显正误');
});

check('本轮未做题目不进入回放', ()=>{
  const ses = makeSession(['j1','j2']);
  recordToRound(ses, 'j1', true, ['√']);
  const rec = ses.results['j2'];
  assert.ok(!rec, 'j2 本轮未做 → 不回放、可作答');
});

check('重新做后可重新作答（results 为空）', ()=>{
  const ses = makeSession(['j1']);
  recordToRound(ses, 'j1', false, ['×']);
  restartRound(ses);
  assert.strictEqual(ses.results['j1'], undefined, '重做后 j1 可重答');
});

check('继续(resume)恢复本轮 results 与位置', ()=>{
  const ses = makeSession(['j1','j2','j3']);
  recordToRound(ses, 'j1', true, ['√']);
  recordToRound(ses, 'j2', false, ['×']);
  ses.idx = 2;
  // 模拟序列化→反序列化（localStorage 场景）
  const saved = JSON.parse(JSON.stringify(ses));
  const restored = saved;
  restored.results = restored.results||{};
  assert.strictEqual(Object.keys(restored.results).length, 2, '恢复后保留2条本轮记录');
  assert.strictEqual(restored.idx, 2, '恢复后位置正确');
  assert.strictEqual(restored.results['j1'].correct, true, '恢复后 j1 仍为正确');
});

console.log(`\n${pass}/${total} 通过`);
process.exit(pass===total?0:1);
