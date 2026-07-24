#!/bin/bash

# Cloudflare Pages 部署脚本
# 需要先安装 wrangler: npm install -g wrangler

set -e

echo "🚀 Cloudflare Pages 部署脚本"
echo "================================"

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
    echo "请运行: wrangler login"
    exit 1
fi

# 项目配置
PROJECT_NAME="ai-quiz3-app"
PRODUCTION_BRANCH="main"

echo "📦 项目名称: $PROJECT_NAME"
echo "🌿 分支: $PRODUCTION_BRANCH"
echo ""

# 部署到 Cloudflare Pages
echo "🚀 开始部署..."
wrangler pages deploy . --project-name=$PROJECT_NAME

echo ""
echo "✅ 部署完成！"
echo "🌐 访问: https://$PROJECT_NAME.pages.dev"
