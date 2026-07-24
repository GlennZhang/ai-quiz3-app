# Cloudflare Pages 部署指南

## 快速部署

### 1. 登录 Cloudflare Pages
访问 [Cloudflare Dashboard](https://dash.cloudflare.com/) 并登录你的账户（免费）

### 2. 创建新项目
1. 在左侧菜单点击 **Workers & Pages**
2. 点击 **Create application**
3. 选择 **Pages** 标签
4. 点击 **Connect to Git**

### 3. 连接 GitHub 仓库
1. 选择 **GitHub** 
2. 授权 Cloudflare 访问你的仓库
3. 选择 `GlennZhang/ai-quiz3-app` 仓库
4. 点击 **Begin setup**

### 4. 配置构建设置
由于这是一个纯静态 HTML 文件，配置非常简单：

```
Project name: ai-quiz3-app
Production branch: main
Build command: (留空，无需构建)
Build output directory: / (根目录)
```

### 5. 环境变量（可选）
无需设置任何环境变量

### 6. 部署
点击 **Save and Deploy**，Cloudflare 会自动：
- 克隆你的 GitHub 仓库
- 检测到静态网站
- 在全球 CDN 网络部署

### 7. 访问你的网站
部署完成后，你会获得一个免费域名：
```
https://ai-quiz3-app.pages.dev
```

## 免费计划特性

Cloudflare Pages 免费计划包含：
- ✅ **无限带宽** - 没有流量限制
- ✅ **无限请求** - 没有访问次数限制  
- ✅ **全球 CDN** - 200+ 节点加速
- ✅ **自动 HTTPS** - 免费 SSL 证书
- ✅ **自动部署** - Git 推送触发重新部署
- ✅ **自定义域名** - 可绑定自己的域名
- ✅ **每月 500 次构建** - 足够个人使用

## 自定义域名（可选）

### 绑定自己的域名：
1. 在 Cloudflare Pages 项目中点击 **Custom domains**
2. 点击 **Set up a custom domain**
3. 输入你的域名（如 `quiz.yourdomain.com`）
4. 按照提示配置 DNS 记录

## 更新部署

每次推送代码到 GitHub `main` 分支时，Cloudflare 会自动重新部署：

```bash
git add .
git commit -m "更新功能"
git push origin main
```

## 本地预览

在部署前，你可以直接在浏览器中打开 `index.html` 预览：

```bash
open index.html
```

## 故障排除

### 部署失败
- 检查 Build output directory 是否设置为 `/`
- 确认 index.html 在仓库根目录

### 404 错误
- 确认文件名是 `index.html`（不是 Index.html 或 INDEX.html）
- 检查文件是否成功推送到 GitHub

### 访问缓慢
- Cloudflare CDN 可能需要几分钟同步到全球节点
- 检查你的网络连接

## 成本

**完全免费！** - Cloudflare Pages 免费计划没有任何隐藏费用，适合个人项目和小型应用。

## 更多信息

- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Cloudflare Pages 定价](https://www.cloudflare.com/plans/)
