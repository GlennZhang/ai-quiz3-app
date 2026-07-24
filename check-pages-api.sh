#!/bin/bash

# Cloudflare Pages API 检查脚本
# 使用 API token 直接查询，无需 wrangler login

echo "🔍 Cloudflare Pages API 状态检查"
echo "================================"
echo ""

# 检查 API token
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "⚠️  需要设置 Cloudflare API Token"
    echo ""
    echo "获取步骤:"
    echo "1. 访问: https://dash.cloudflare.com/profile/api-tokens"
    echo "2. 点击 'Create Token'"
    echo "3. 选择 'Cloudflare Pages' 模板或自定义权限"
    echo "4. 创建后复制 token"
    echo ""
    echo "然后运行:"
    echo "  export CLOUDFLARE_API_TOKEN=your_token_here"
    echo "  ./check-pages-api.sh"
    echo ""
    exit 1
fi

# 检查 Account ID
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo "⚠️  需要设置 Cloudflare Account ID"
    echo ""
    echo "获取步骤:"
    echo "1. 访问: https://dash.cloudflare.com/"
    echo "2. 点击任意域名进入详情页"
    echo "3. 在右侧边栏找到 'Account ID' 并复制"
    echo ""
    echo "然后运行:"
    echo "  export CLOUDFLARE_ACCOUNT_ID=your_account_id_here"
    echo "  ./check-pages-api.sh"
    echo ""
    exit 1
fi

API_TOKEN="$CLOUDFLARE_API_TOKEN"
ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"

echo "🔑 使用 API Token 查询..."
echo ""

# 获取所有 Pages 项目
echo "📚 获取 Pages 项目列表..."
PROJECTS_RESPONSE=$(curl -s -X GET \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json")

# 检查 API 错误
if echo "$PROJECTS_RESPONSE" | grep -q '"success":false'; then
    echo "❌ API 请求失败:"
    echo "$PROJECTS_RESPONSE" | grep -o '"message":"[^"]*"'
    exit 1
fi

# 解析项目列表
PROJECT_COUNT=$(echo "$PROJECTS_RESPONSE" | grep -o '"result":\[[^]]*\]' | grep -o '"name":"[^"]*"' | wc -l | tr -d ' ')

if [ "$PROJECT_COUNT" -eq 0 ]; then
    echo "⚠️  未找到任何 Pages 项目"
    echo "你还没有创建任何项目"
else
    echo "✅ 找到 $PROJECT_COUNT 个项目:"
    echo ""

    # 显示项目列表
    echo "$PROJECTS_RESPONSE" | grep -o '"name":"[^"]*"' | sed 's/"name"://' | tr -d '"' | nl
    echo ""

    # 查找 ai-quiz3-app 项目
    if echo "$PROJECTS_RESPONSE" | grep -q '"name":"ai-quiz3-app"'; then
        echo "🎯 找到 ai-quiz3-app 项目"
        echo ""

        # 获取项目部署历史
        echo "📦 获取最新部署状态..."
        DEPLOYMENTS_RESPONSE=$(curl -s -X GET \
          "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/ai-quiz3-app/deployments" \
          -H "Authorization: Bearer $API_TOKEN" \
          -H "Content-Type: application/json")

        # 显示最新部署
        if echo "$DEPLOYMENTS_RESPONSE" | grep -q '"success":true'; then
            echo "✅ 部署历史:"
            echo ""
            echo "$DEPLOYMENTS_RESPONSE" | grep -o '"latest_stage":"[^"]*"' | head -5
            echo "$DEPLOYMENTS_RESPONSE" | grep -o '"created_on":"[^"]*"' | head -1
            echo ""

            # 获取最新部署详情
            LATEST_DEPLOYMENT=$(echo "$DEPLOYMENTS_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
            if [ -n "$LATEST_DEPLOYMENT" ]; then
                echo "🔍 最新部署详情: $LATEST_DEPLOYMENT"

                DEPLOYMENT_DETAIL=$(curl -s -X GET \
                  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/ai-quiz3-app/deployments/$LATEST_DEPLOYMENT" \
                  -H "Authorization: Bearer $API_TOKEN" \
                  -H "Content-Type: application/json")

                echo ""
                echo "状态:"
                echo "$DEPLOYMENT_DETAIL" | grep -o '"latest_stage":"[^"]*"'
                echo "$DEPLOYMENT_DETAIL" | grep -o '"deployment_trigger":{"metadata":{"commit_message":"[^"]*"'
                echo "$DEPLOYMENT_DETAIL" | grep -o '"production_branch":"[^"]*"'
            fi
        else
            echo "❌ 无法获取部署历史"
        fi
    else
        echo "⚠️  未找到 ai-quiz3-app 项目"
        echo ""
        echo "项目可能使用了其他名称，请检查上面的项目列表"
    fi
fi

echo ""
echo "💡 访问 https://dash.cloudflare.com/ 查看完整信息"
