# 🚀 快速部署指南

## 已有项目更新 (3 步)

```bash
# 1️⃣ 设置 SECRET_KEY (首次必须)
npx wrangler secret put SECRET_KEY
# 粘贴生成的密钥: openssl rand -base64 32

# 2️⃣ 运行数据库迁移
npm run migrate:remote

# 3️⃣ 部署
npm run deploy
```

## 新项目部署 (7 步)

```bash
# 1️⃣ 登录 Cloudflare
npx wrangler login

# 2️⃣ 创建数据库
npx wrangler d1 create bookmarks-db
# 复制 database_id 到 wrangler.toml

# 3️⃣ 设置 SECRET_KEY
npx wrangler secret put SECRET_KEY

# 4️⃣ 初始化数据库
npm run migrate:remote

# 5️⃣ 部署
npm run deploy

# 6️⃣ 访问应用
# https://web-bookmarks.YOUR_SUBDOMAIN.workers.dev

# 7️⃣ (可选) 启用速率限制
npx wrangler kv:namespace create RATE_LIMIT_KV
# 更新 wrangler.toml 后重新部署
```

## ⚠️ 重要提示

- ✅ SECRET_KEY 现在是**必需**的环境变量
- ✅ 数据库迁移会添加优化索引(安全可重复运行)
- ✅ 速率限制需要 KV 命名空间(可选)
- ✅ 部署后建议修改默认密码

## 🔗 详细文档

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - 完整部署和更新指南
- **[UPGRADE.md](./UPGRADE.md)** - 升级说明和安全配置
- **[README.md](./README.md)** - 完整使用指南

## 🐛 遇到问题?

### 登录后立即退出?
```bash
# 重新设置 SECRET_KEY(确保使用相同密钥)
npx wrangler secret put SECRET_KEY
# 或清空浏览器 Cookie
```

### 部署失败 "SECRET_KEY is not defined"?
```bash
# 设置 SECRET_KEY
npx wrangler secret put SECRET_KEY
```

### 迁移失败?
```bash
# 检查数据库配置
npx wrangler d1 list
npx wrangler d1 info bookmarks-db
```

### 速率限制不生效?
```bash
# 创建 KV 命名空间
npx wrangler kv:namespace create RATE_LIMIT_KV
# 在 wrangler.toml 中绑定
# 重新部署
```

---

**版本**: v1.1.0 | **更新**: 2025-12-28
