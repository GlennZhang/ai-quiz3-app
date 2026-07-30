#!/usr/bin/env node
/* makeAdapter 只读数据访问层单测 */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const AI_SRC = fs.readFileSync(path.resolve(__dirname,'../ai-tutor.js'),'utf-8');

function makeDOM(preSet={}){
  const html = `<!DOCTYPE html><html><body><script>${AI_SRC}</script></body></html>`;
  return new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true,
    beforeParse(window){ for(const [k,v] of Object.entries(preSet)) window.localStorage.setItem(k,v); } });
}
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('✓',n);} else {fail++;console.error('✗',n);} }

const A = makeDOM().window.AiTutor;
const Q = [
  {uid:'judge_1', type:'judge',  typeLabel:'判断题', stem:'题干甲', options:{}, answer:'√', explanation:'解甲'},
  {uid:'single_1',type:'single', typeLabel:'单选题', stem:'题干乙 contains KEYWORD', options:{A:'a',B:'b'}, answer:'A', explanation:'解乙'},
  {uid:'multi_1', type:'multi',  typeLabel:'多选题', stem:'题干丙', options:{A:'a',B:'b',C:'c'}, answer:'ABC', explanation:'解丙'}
];
const QMAP = {}; Q.forEach(q=>QMAP[q.uid]=q);
const S = {
  wrong: { judge_1:{count:3,last:1,streak:0}, single_1:{count:1,last:1,streak:2} },
  right: { multi_1:true },
  totalRight: 5, totalAns: 9
};
const a = A.makeAdapter(S, Q, QMAP);

const st = a.getProgressStats();
ok('stats.total=3', st.total === 3);
ok('stats.answered=totalAns', st.answered === 9);
ok('stats.correct=totalRight', st.correct === 5);
ok('stats.wrongCount=2', st.wrongCount === 2);
ok('stats.byType.judge.total=1', st.byType.judge.total === 1);
ok('stats.byType.single.done=1', st.byType.single.done === 1);
ok('stats.byType.multi.correct=1', st.byType.multi.correct === 1);

const w = a.getWrongQuestions({ limit: 10 });
ok('wrong 第一条是 judge_1(count3)', w[0].uid === 'judge_1');
ok('wrong 含 wrongCount', w[0].wrongCount === 3);
ok('wrong 含 stem', typeof w[0].stem === 'string');
ok('wrong 含 streak', w[0].streak === 0);
const wj = a.getWrongQuestions({ limit: 10, type: 'single' });
ok('type=single 只返回 single_1', wj.length === 1 && wj[0].uid === 'single_1');
const big = a.getWrongQuestions({ limit: 999 });
ok('limit 上限 30 生效', big.length <= 30);

const q1 = a.getQuestion('judge_1');
ok('getQuestion 返回详情', q1 && q1.stem === '题干甲' && q1.answer === '√');
ok('getQuestion 未知 uid 返回 null', a.getQuestion('nope') === null);

const s = a.searchQuestions('KEYWORD');
ok('search 命中关键词', s.length === 1 && s[0].uid === 'single_1');
ok('search 空关键词返回空数组', a.searchQuestions('').length === 0);

console.log('\n'+pass+'/'+(pass+fail)+' 通过');
process.exit(fail ? 1 : 0);
