# 🔍 Cloudflare Pages 状态检查指南

如果你无法访问 `https://ai-quiz3-app.pages.dev`，可以使用以下方法检查部署状态。

## 方法一：使用 Wrangler CLI（推荐）

### 步骤：

1. **安装 Wrangler**（如果还没安装）:
   ```bash
   npm install -g wrangler
   ```

2. **登录 Cloudflare**:
   ```bash
   wrangler login
   ```
   这会打开浏览器进行授权。

3. **运行状态检查**:
   ```bash
   ./check-pages-status.sh
   ```

### 或直接使用命令：

```bash
# 查看账户信息
wrangler whoami

# 列出所有 Pages 项目
wrangler pages project list

# 查看 ai-quiz3-app 部署历史
wrangler pages deployment list --project-name=ai-quiz3-app
```

## 方法二：使用 Cloudflare API

### 1. 获取 API Token

1. 访问: https://dash.cloudflare.com/profile/api-tokens
2. 点击 "Create Token"
3. 选择以下权限：
   - Account - Cloudflare Pages - Edit
   - Account - Account Settings - Read
4. 设置 Token 有效期和 IP 限制（可选）
5. 创建后复制 token

### 2. 获取 Account ID

1. 访问: https://dash.cloudflare.com/
2. 点击任意域名进入详情页
3. 在右侧边栏找到 "Account ID" 并复制

### 3. 设置环境变量并运行检查

```bash
# 设置环境变量
export CLOUDFLARE_API_TOKEN=your_token_here
export CLOUDFLARE_ACCOUNT_ID=your_account_id_here

# 运行检查脚本
./check-pages-api.sh
```

## 方法三：直接使用 curl（高级用户）

```bash
# 设置环境变量
export CLOUDFLARE_API_TOKEN=your_token
export CLOUDFLARE_ACCOUNT_ID=your_account_id

# 获取所有项目
curl -X GET \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json"

# 获取特定项目部署历史
curl -X GET \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/ai-quiz3-app/deployments" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json"
```

## 📋 状态检查清单

运行检查脚本后，查看以下信息：

### ✅ 成功部署的标志：
- 项目列表中包含 `ai-quiz3-app`
- 最新部署状态显示 `success`
- 部署触发方式为 `git`
- 域名显示为 `https://ai-quiz3-app.pages.dev`

### ❌ 部署失败的标志：
- 项目不存在
- 最新部署状态显示 `failure`
- 部署日志显示错误信息

### 🟡 仍在部署中：
- 最新部署状态显示 `uploading`、`building` 或 `deploying`
- 需要等待几分钟

## 🆘 常见问题

### 1. Wrangler 登录失败
**解决**: 确保你有 Cloudflare 账户，并且在浏览器中完成了授权流程。

### 2. API Token 权限不足
**解决**: 重新创建 Token，确保包含 Cloudflare Pages 的读写权限。

### 3. 找不到 ai-quiz3-app 项目
**解决**:
- 检查项目名称是否正确
- 在 Dashboard 中查看实际的项目名称
- 可能需要重新创建项目

### 4. 部署成功但仍无法访问
**解决**:
- 等待 2-5 分钟让 CDN 传播
- 检查域名是否正确
- 尝试清除浏览器缓存

## 📱 下一步

根据检查结果：

1. **如果项目不存在**: 按照 [DEPLOY-GUIDE.md](DEPLOY-GUIDE.md) 重新部署
2. **如果部署失败**: 查看部署日志，修复错误后重新部署
3. **如果部署成功但无法访问**: 等待 CDN 传播或检查网络

## 📞 获取帮助

- 查看 [完整部署指南](DEPLOYMENT.md)
- 访问 [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- 在 Cloudflare Dashboard 中查看实时日志
