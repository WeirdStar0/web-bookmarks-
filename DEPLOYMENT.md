# Cloudflare Workers 部署和更新指南

本文档说明如何将更新的代码部署到已运行的 Cloudflare Workers 项目。

---

## 📋 部署前检查清单

### 1. 本地测试

在部署到生产环境之前,务必先在本地测试:

```bash
# 1. 确保已安装最新依赖
npm install

# 2. 配置本地环境变量
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars,设置 SECRET_KEY

# 3. 运行数据库迁移(本地)
npm run migrate

# 4. 启动本地开发服务器
npm run dev

# 5. 访问 http://localhost:8787 测试功能
```

### 2. 检查文件状态

```bash
# 查看已修改的文件
git status
```

主要更新的文件:
- ✅ `src/index.ts` - 主应用文件(安全改进)
- ✅ `src/utils/validators.ts` - 输入验证工具(新增)
- ✅ `src/middleware/rateLimiter.ts` - 速率限制中间件(新增)
- ✅ `src/templates/main.ts` - 增强的加载动画
- ✅ `src/templates/scripts.ts` - 前端脚本更新
- ✅ `migrations/002_add_indexes.sql` - 数据库索引优化(新增)
- ✅ `wrangler.toml` - 配置文件更新

---

## 🚀 部署步骤

### 步骤 1: 设置 SECRET_KEY (必需)

**重要**: SECRET_KEY 现在是必需的环境变量,部署前必须设置!

```bash
# 设置 SECRET_KEY
npx wrangler secret put SECRET_KEY

# 系统会提示输入密钥值
# 粘贴生成的强密钥并回车
```

**生成强密钥的方法:**

```bash
# 方法1: 使用 OpenSSL
openssl rand -base64 32

# 方法2: 使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 方法3: 在线生成器
# https://generate-random.org/api-key-generator
```

### 步骤 2: (可选) 创建 KV 命名空间用于速率限制

如果你想启用速率限制功能:

```bash
# 创建 KV 命名空间
npx wrangler kv:namespace create RATE_LIMIT_KV

# 输出示例:
# 🌀 Creating namespace with title "web-bookmarks-RATE_LIMIT_KV"
# ✨ Success!
# Add the following to your configuration file in your kv_namespaces array:
# { binding = "RATE_LIMIT_KV", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

**更新 wrangler.toml:**

在 `wrangler.toml` 中添加 KV 命名空间配置:

```toml
name = "web-bookmarks"
compatibility_date = "2024-11-21"
main = "src/index.ts"

[[d1_databases]]
binding = "DB"
database_name = "bookmarks-db"
database_id = "56ba610f-f5f9-4771-8ac5-957d89fce6a4"

# 添加这部分配置
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-kv-namespace-id-here"
```

**如果不添加 KV 命名空间**:
- 应用仍然可以正常运行
- 速率限制功能会被跳过(降级模式)
- 不影响其他功能

### 步骤 3: 运行数据库迁移(生产环境)

**重要**: 这将为现有数据库添加优化索引!

```bash
# 方式1: 使用 npm script (推荐)
npm run migrate:remote

# 方式2: 手动执行
npx wrangler d1 execute bookmarks-db --remote --file=./schema.sql
npx wrangler d1 execute bookmarks-db --remote --file=./migrations/002_add_indexes.sql
```

**迁移说明:**
- ✅ `schema.sql` - 创建表结构(如果表已存在会跳过)
- ✅ `002_add_indexes.sql` - 添加索引优化(新增)

索引是幂等的,可以安全地重复运行。

### 步骤 4: 部署到 Cloudflare Workers

```bash
# 方式1: 使用 npm script (推荐)
npm run deploy

# 方式2: 直接使用 wrangler
npx wrangler deploy
```

**预期输出:**

```
✨ Successfully published your Worker to
  https://web-bookmarks.YOUR_SUBDOMAIN.workers.dev
- Current ID: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
- Preview URL: https://preview.xxx.workers.dev
```

---

## ✅ 部署后验证

### 1. 访问你的应用

```bash
# 打开浏览器访问
https://web-bookmarks.YOUR_SUBDOMAIN.workers.dev
```

### 2. 测试关键功能

- [ ] 登录功能(使用现有账号)
- [ ] 创建文件夹
- [ ] 创建书签
- [ ] 搜索功能
- [ ] 导入/导出功能
- [ ] 修改密码(设置菜单)

### 3. 检查浏览器控制台

打开浏览器开发者工具(F12),检查:
- Console 标签页是否有错误
- Network 标签页检查 API 响应
- Application 标签页检查 Cookie 设置

### 4. 验证速率限制(如果已启用 KV)

发送多个请求测试:

```bash
# 快速连续发送多个请求
for i in {1..110}; do
  curl -X POST https://your-worker.workers.dev/api/login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}'
done
```

预期第 101+ 个请求返回 `429 Too Many Requests`。

---

## 🔄 持续更新

### 方式1: 手动更新

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 安装依赖(如果有更新)
npm install

# 3. 运行迁移(如果有新的迁移文件)
npm run migrate:remote

# 4. 部署
npm run deploy
```

### 方式2: 使用 GitHub Actions 自动部署

创建 `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          secret: |
            SECRET_KEY
          command: deploy
```

**配置 GitHub Secrets:**

1. 访问 GitHub 仓库 → Settings → Secrets and variables → Actions
2. 添加以下 secrets:
   - `CLOUDFLARE_API_TOKEN`: 你的 Cloudflare API Token
   - `CLOUDFLARE_ACCOUNT_ID`: 你的 Cloudflare Account ID
   - `SECRET_KEY`: 你的密钥

**获取 API Token:**

```bash
# 访问 https://dash.cloudflare.com/profile/api-tokens
# 创建 token,权限模板: "Edit Cloudflare Workers"
```

**获取 Account ID:**

```bash
# 在 Cloudflare Dashboard 的 URL 中
# 或使用: wrangler whoami
```

---

## 🐛 常见问题排查

### 问题1: 登录后立即退出

**原因**: SECRET_KEY 不匹配

**解决方案**:
```bash
# 重新设置密钥
npx wrangler secret put SECRET_KEY

# 确保使用与之前相同的密钥
# 或者清空浏览器 Cookie 重新登录
```

### 问题2: 部署失败提示 "SECRET_KEY is not defined"

**原因**: 未设置 SECRET_KEY 环境变量

**解决方案**:
```bash
# 设置 SECRET_KEY
npx wrangler secret put SECRET_KEY
```

### 问题3: 迁移失败

**原因**: 数据库权限或连接问题

**解决方案**:
```bash
# 检查数据库配置
npx wrangler d1 list

# 验证 database_id
cat wrangler.toml | grep database_id

# 确保使用正确的数据库
npx wrangler d1 info bookmarks-db
```

### 问题4: 速率限制不生效

**原因**: KV 命名空间未绑定

**解决方案**:
1. 创建 KV 命名空间: `wrangler kv:namespace create RATE_LIMIT_KV`
2. 在 wrangler.toml 中绑定
3. 重新部署: `npm run deploy`

### 问题5: 加载动画不显示

**原因**: 浏览器缓存了旧版本

**解决方案**:
- 硬刷新: Ctrl+Shift+R (Windows) 或 Cmd+Shift+R (Mac)
- 清空浏览器缓存
- 使用隐私模式测试

---

## 📊 监控和日志

### 查看 Worker 日志

```bash
# 实时查看日志
npx wrangler tail

# 或者访问 Cloudflare Dashboard
# Workers & Pages → 你的 Worker → Logs → Real-time logs
```

### 查看分析数据

访问 Cloudflare Dashboard:
```
Workers & Pages → 你的 Worker → Analytics
```

可以看到:
- 请求量
- 错误率
- 响应时间
- 地理分布

---

## 🔒 安全建议

### 1. 定期轮换 SECRET_KEY

```bash
# 生成新密钥
openssl rand -base64 32

# 更新密钥
npx wrangler secret put SECRET_KEY

# 注意: 用户需要重新登录
```

### 2. 启用速率限制

强烈建议创建 KV 命名空间以防止 DDoS 攻击。

### 3. 监控异常活动

定期检查 Worker 日志和 Analytics,发现异常及时处理。

### 4. 备份数据

```bash
# 导出数据
npx wrangler d1 export bookmarks-db --remote --output=backup.sql

# 或使用应用内的导出功能
```

---

## 📝 版本更新记录

### v1.1.0 (当前版本)

**部署注意事项:**
- ⚠️ **必须**设置 `SECRET_KEY` 环境变量
- ⚠️ **推荐**运行数据库索引迁移
- ⚠️ **可选**创建 KV 命名空间启用速率限制

**新增功能:**
- ✅ 环境变量配置
- ✅ 请求速率限制
- ✅ 输入验证增强
- ✅ 数据库索引优化
- ✅ 改进的加载动画

---

## 🆘 获取帮助

如有问题:

1. 查看 [README.md](./README.md) - 完整使用指南
2. 查看 [UPGRADE.md](./UPGRADE.md) - 升级详细说明
3. 查看 [CHANGELOG.md](./CHANGELOG.md) - 改进清单
4. 提交 Issue: https://github.com/YOUR_USERNAME/web-bookmarks/issues

---

## 🎯 快速部署命令

```bash
# 一键部署(确保已设置 SECRET_KEY)
npm run migrate:remote && npm run deploy

# 或者分步执行
npx wrangler secret put SECRET_KEY  # 首次部署必需
npm run migrate:remote              # 运行数据库迁移
npm run deploy                      # 部署应用
```

---

**祝你部署顺利!** 🚀
