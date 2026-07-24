#!/bin/bash

# Cloudflare Pages 状态检查脚本

echo "🔍 Cloudflare Pages 状态检查"
echo "================================"
echo ""

# 检查 wrangler 是否安装
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler 未安装"
    echo "请运行: npm install -g wrangler"
    exit 1
fi

# 检查是否已登录
echo "📝 检查登录状态..."
if ! wrangler whoami &> /dev/null; then
    echo "⚠️  未登录 Cloudflare"
    echo "请先运行: wrangler login"
    echo ""
    echo "这将打开浏览器进行授权..."
    exit 1
fi

echo "✅ 已登录"
echo ""

# 显示账户信息
echo "👤 账户信息:"
wrangler whoami
echo ""

# 列出所有 Pages 项目
echo "📚 Pages 项目列表:"
wrangler pages project list
echo ""

# 检查特定项目（如果存在）
if wrangler pages deployment list --project-name=ai-quiz3-app &> /dev/null; then
    echo "📦 ai-quiz3-app 项目部署历史:"
    wrangler pages deployment list --project-name=ai-quiz3-app
    echo ""

    echo "🌊 最新部署状态:"
    latest=$(wrangler pages deployment list --project-name=ai-quiz3-app | head -5)
    echo "$latest"
else
    echo "⚠️  未找到 ai-quiz3-app 项目"
    echo "可能的原因:"
    echo "  1. 项目名称不同"
    echo "  2. 项目尚未创建"
    echo "  3. 没有访问权限"
fi

echo ""
echo "💡 如需查看特定项目详情，运行:"
echo "   wrangler pages deployment list --project-name=<项目名>"
