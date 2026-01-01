# 📖 文档导航

## 你在这里是因为...

### 🔄 想要更新已部署的项目?

**推荐阅读顺序:**

1. **[QUICKSTART.md](./QUICKSTART.md)** ⚡ - 3 步快速更新
   - 快速命令参考
   - 常见问题解决

2. **[DEPLOYMENT.md](./DEPLOYMENT.md)** 📦 - 完整部署指南
   - 详细的更新步骤
   - 环境变量配置
   - 故障排查指南
   - 监控和日志

3. **[UPGRADE.md](./UPGRADE.md)** 🔧 - 升级和安全配置
   - 环境变量详细说明
   - 速率限制配置
   - 安全最佳实践

### 🆕 首次部署新项目?

**推荐阅读顺序:**

1. **[README.md](./README.md)** 📚 - 项目概览和功能介绍
   - 功能特性
   - 技术栈
   - 本地开发设置

2. **[QUICKSTART.md](./QUICKSTART.md)** ⚡ - 快速开始
   - 新项目部署步骤
   - 常见问题

3. **[DEPLOYMENT.md](./DEPLOYMENT.md)** 📦 - 详细部署流程
   - 完整的配置说明
   - 生产环境优化

### 🔒 想要了解安全改进?

**推荐阅读:**

1. **[UPGRADE.md](./UPGRADE.md)** 🔐 - 安全升级详解
   - 环境变量管理
   - 速率限制配置
   - 输入验证说明
   - 性能优化索引

2. **[CHANGELOG.md](./CHANGELOG.md)** 📝 - 改进清单
   - 所有改进的详细列表
   - 代码变更位置
   - API 变更说明

### 🛠️ 想要参与开发?

**推荐阅读:**

1. **[README.md](./README.md)** - 项目结构和功能
2. **[CHANGELOG.md](./CHANGELOG.md)** - 最新改进内容
3. 源代码文件:
   - [src/index.ts](./src/index.ts) - 主应用逻辑
   - [src/utils/validators.ts](./src/utils/validators.ts) - 验证工具
   - [src/middleware/rateLimiter.ts](./src/middleware/rateLimiter.ts) - 速率限制

---

## 📑 文档索引

| 文档 | 用途 | 阅读时间 |
|------|------|----------|
| **[QUICKSTART.md](./QUICKSTART.md)** | 快速参考 | 2 分钟 |
| **[README.md](./README.md)** | 完整使用指南 | 10 分钟 |
| **[DEPLOYMENT.md](./DEPLOYMENT.md)** | 部署和更新 | 15 分钟 |
| **[UPGRADE.md](./UPGRADE.md)** | 升级和安全 | 10 分钟 |
| **[CHANGELOG.md](./CHANGELOG.md)** | 改进清单 | 5 分钟 |

---

## 🎯 根据场景快速导航

### 场景 1: "我已经部署了,现在怎么更新?"

➡️ **直接查看**: [DEPLOYMENT.md → 已有项目更新](./DEPLOYMENT.md#-部署步骤)

**命令**:
```bash
npx wrangler secret put SECRET_KEY
npm run migrate:remote
npm run deploy
```

### 场景 2: "部署后登录失败"

➡️ **直接查看**: [DEPLOYMENT.md → 常见问题](./DEPLOYMENT.md#-常见问题排查)

**原因**: SECRET_KEY 未设置或不匹配

**解决**:
```bash
npx wrangler secret put SECRET_KEY
```

### 场景 3: "想要启用速率限制"

➡️ **直接查看**: [UPGRADE.md → 步骤 2](./UPGRADE.md#步骤-2--创建-kv-命名空间-可选-用于速率限制)

**命令**:
```bash
npx wrangler kv:namespace create RATE_LIMIT_KV
```

### 场景 4: "想要了解有哪些改进"

➡️ **直接查看**: [CHANGELOG.md](./CHANGELOG.md) 或 [UPGRADE.md → 主要改进](./UPGRADE.md#-升级内容概览)

**主要改进**:
- ✅ 环境变量配置
- ✅ 请求速率限制
- ✅ 输入验证增强
- ✅ 数据库索引优化
- ✅ 改进的加载动画

### 场景 5: "想要本地开发"

➡️ **直接查看**: [README.md → 本地开发](./README.md#️-本地开发)

**命令**:
```bash
npm install
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 设置 SECRET_KEY
npm run migrate
npm run dev
```

---

## 💡 快速提示

### 密钥生成

```bash
# OpenSSL
openssl rand -base64 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 数据库迁移

```bash
# 本地
npm run migrate

# 生产
npm run migrate:remote
```

### 部署

```bash
# 开发
npm run dev

# 生产
npm run deploy
```

### 日志查看

```bash
# 实时日志
npx wrangler tail

# Analytics
# 访问 Cloudflare Dashboard → Workers → 你的 Worker → Analytics
```

---

## 📞 获取帮助

- 📖 **文档**: 查看上述相关文档
- 🐛 **问题**: 提交 [GitHub Issue](https://github.com/YOUR_USERNAME/web-bookmarks/issues)
- 💬 **讨论**: [GitHub Discussions](https://github.com/YOUR_USERNAME/web-bookmarks/discussions)

---

## 🎉 开始使用

选择你的入口:

- **快速更新** → [QUICKSTART.md](./QUICKSTART.md)
- **完整指南** → [README.md](./README.md)
- **部署详解** → [DEPLOYMENT.md](./DEPLOYMENT.md)
- **安全配置** → [UPGRADE.md](./UPGRADE.md)

---

**祝你使用愉快!** 🚀
