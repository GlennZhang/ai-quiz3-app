# -*- coding: utf-8 -*-
import json, os, re

html = open('index.html', encoding='utf-8').read()
newbank = json.load(open('questions_new.json', encoding='utf-8'))

def rep(old, new, html, required=True):
    if required:
        assert old in html, '未匹配: '+old[:70]
    return html.replace(old, new)

# 1) 内联 DATA
i = html.find('const DATA = {'); brace0 = html.find('{', i); depth=0; j=brace0
while j < len(html):
    if html[j]=='{':depth+=1
    elif html[j]=='}':
        depth-=1
        if depth==0:break
    j+=1
html = html[:i] + 'const DATA = ' + json.dumps(newbank, ensure_ascii=False) + html[j+1:]

# 2) localStorage 键隔离
for a,b in {"'aitrainer_lv3_v1'":"'aitrainer_newbank_v1'",
            "'aitrainer_lv3_session'":"'aitrainer_newbank_session'",
            "'aitrainer_exam_cfg'":"'aitrainer_newbank_exam'",
            "'aitrainer_cfg'":"'aitrainer_newbank_cfg'"}.items():
    html = rep(a, b, html)

# 3) 组卷结构：去判断
html = rep("structure:{judge:6,single:8,multi:6},  // 各题型题量（共20题）",
           "structure:{judge:0,single:12,multi:8},  // 各题型题量（共20题，本卷无判断题）", html)
html = rep("structure:{judge:40,single:60,multi:20},          // 各题型题量（≈120题）",
           "structure:{judge:0,single:80,multi:40},          // 各题型题量（≈120题，本卷无判断题）", html)

# 4) 文案
html = rep("<title>人工智能训练师（三级）· 理论刷题</title>",
           "<title>人工智能训练师（三级）· 模拟卷（机构）</title>", html)
html = rep("<p>理论知识复习题 · 判断 + 单选 + 多选 共 900 题</p>",
           "<p>某机构模拟卷 · 单选 + 多选 共 610 题（与主题库/记录完全独立）</p>", html)
html = rep('<span data-def="300 道四选一">300 道四选一</span>',
           '<span data-def="450 道四选一">450 道四选一</span>', html)
html = rep('<span data-def="300 道多选">300 道多选</span>',
           '<span data-def="160 道多选">160 道多选</span>', html)
# 全部练习 data-def + stat 初值 + 底部总题数（done=0 时会显示这些原文，须改 610）
html = rep('<span data-def="900 道题，顺序刷">900 道题，顺序刷</span>',
           '<span data-def="610 道题，顺序刷">610 道题，顺序刷</span>', html)
html = rep('<b id="hsTotal">900</b>', '<b id="hsTotal">610</b>', html)
html = rep('数据保存在本地浏览器，无需联网 · 共 900 题含答案与解析',
           '数据保存在本地浏览器，无需联网 · 共 610 题含答案与解析', html)

# 5) 删除判断题入口按钮
judge_btn = '''        <button class="card mode" data-start="judge">
          <div class="ico j">√</div><div class="meta"><b>判断题</b><span data-def="300 道对错题">300 道对错题</span></div><div class="arr">›</div>
        </button>
'''
html = rep(judge_btn, '', html)

# 6) 清除 UI 中残留的"判断"显示（本卷无判断题）
# 6a 题目浏览 tab + 默认类型
html = rep("const TYPES=[['judge','判断题'],['single','单选题'],['multi','多选题']];",
           "const TYPES=[['single','单选题'],['multi','多选题']];", html)
html = rep("let browseType='judge';", "let browseType='single';", html)
# 6b 首页统计 题型正确率
html = rep("tsBox.innerHTML=['judge','single','multi'].map(t=>{",
           "tsBox.innerHTML=['single','multi'].map(t=>{", html)
# 6c 考试报告 各题型
html = rep("const byType={judge:{c:0,n:0,g:0,t:0},single:{c:0,n:0,g:0,t:0},multi:{c:0,n:0,g:0,t:0}};",
           "const byType={single:{c:0,n:0,g:0,t:0},multi:{c:0,n:0,g:0,t:0}};", html)
# 6d 考试配置 删判断输入框
html = rep("      +'<label>判断<input type=\"number\" id=\"cj\" min=\"0\" max=\"300\" value=\"'+c.structure.judge+'\"></label>'\n", "", html)
html = rep("      +'<label>判断<input type=\"number\" id=\"sj\" step=\"0.5\" min=\"0\" value=\"'+c.scores.judge+'\"></label>'\n", "", html)
# 6e 考试配置 保存：判断恒为0（cj/sj 已删）
html = rep("  c.structure={judge:Math.min(300,+document.getElementById('cj').value||0), single:Math.min(300,+document.getElementById('cs').value||0), multi:Math.min(300,+document.getElementById('cm').value||0)};",
           "  c.structure={judge:0, single:Math.min(300,+document.getElementById('cs').value||0), multi:Math.min(300,+document.getElementById('cm').value||0)};", html)
html = rep("  c.scores={judge:+document.getElementById('sj').value||0, single:+document.getElementById('ss').value||0, multi:+document.getElementById('sm').value||0};",
           "  c.scores={judge:0, single:+document.getElementById('ss').value||0, multi:+document.getElementById('sm').value||0};", html)

os.makedirs('mock', exist_ok=True)
open('mock/index.html','w',encoding='utf-8').write(html)
print('生成 mock/index.html,', len(html), '字节')
print('残留判断题相关:', '判断' if ('判断' in html and '判断题' in html) else '需人工看')
