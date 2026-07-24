# 🚀 Cloudflare Pages 快速部署指南

## 📋 Dashboard 部署配置

当你在 Cloudflare Pages Dashboard 中创建项目时，填写以下内容：

### 构建设置（Build Settings）

```
┌─────────────────────────────────────────────────────────┐
│ Project name:         ai-quiz3-app                       │
│ Production branch:   main                               │
├─────────────────────────────────────────────────────────┤
│ Build command:       (留空)                             │
│                      或输入: # Static HTML              │
│                      或输入: echo "No build"             │
├─────────────────────────────────────────────────────────┤
│ Build output dir:    /                                  │
│ Root directory:      /                                  │
├─────────────────────────────────────────────────────────┤
│ Environment vars:    (无需设置)                          │
└─────────────────────────────────────────────────────────┘
```

### 详细说明

| 字段 | 填写内容 | 原因 |
|------|---------|------|
| **Project name** | `ai-quiz3-app` | 会生成域名：https://ai-quiz3-app.pages.dev |
| **Production branch** | `main` | GitHub 主分支 |
| **Build command** | **留空** 或 `# Static HTML` | 纯静态 HTML，无需构建步骤 |
| **Build output directory** | `/` | index.html 在根目录 |
| **Root directory** | `/` | 项目根目录 |
| **Environment variables** | **留空** | 不需要任何环境变量 |

### ⚠️ 重要提示

**如果 Dashboard 强制要求填写 Build command：**

1. **完全留空**（推荐） - Cloudflare 会检测到静态文件
2. **输入注释**：`# Static HTML, no build required`
3. **输入 echo**：`echo "No build needed for static HTML"`

**千万不要填写：**
- ❌ `npm install` - 不需要
- ❌ `npm run build` - 不需要  
- ❌ `yarn build` - 不需要
- ❌ `make build` - 不需要

**原因：** 这是一个自包含的 HTML 文件，所有数据都嵌入在文件中，无需任何构建步骤！

## ✅ 部署检查清单

部署前确认：

- [ ] GitHub 仓库已推送最新代码
- [ ] `index.html` 在仓库根目录
- [ ] Build command 已留空或填写注释
- [ ] Build output directory 设置为 `/`
- [ ] Production branch 设置为 `main`

## 🌐 部署成功后

1. **访问你的网站**：`https://ai-quiz3-app.pages.dev`
2. **查看部署日志**：Dashboard → 你的项目 → Logs
3. **查看部署历史**：Dashboard → 你的项目 → Deployments

## 🔄 日常更新

部署完成后，每次推送代码到 GitHub `main` 分支会自动重新部署：

```bash
git add .
git commit -m "更新内容"
git push origin main
```

## 🆘 故障排除

### 构建失败？

**问题：** Build command 填写错误导致构建失败

**解决：** 确保 Build command 完全留空或只填注释

**错误示例：**
```
❌ npm run build
❌ yarn install
❌ make
```

**正确示例：**
```
✓ (留空)
✓ # Static HTML
✓ echo "No build"
```

### 404 错误？

**可能原因：**
1. 文件名不是 `index.html`（检查大小写）
2. Build output directory 设置错误
3. 文件未成功推送到 GitHub

**解决步骤：**
1. 确认文件名：`index.html`（不是 `Index.html`）
2. Build output directory 设置为：`/`
3. 重新推送代码：`git push origin main`
4. 在 Cloudflare Dashboard 重新部署

### 访问缓慢？

**原因：** Cloudflare CDN 需要几分钟同步到全球节点

**解决：** 等待 2-5 分钟后重试

## 📞 获取帮助

- 查看 [完整部署指南](DEPLOYMENT.md)
- 访问 [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- 查看 [项目 README](README.md)
