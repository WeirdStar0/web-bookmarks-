# Web Bookmarks Manager

一个基于 Cloudflare Workers 和 D1 数据库构建的现代化书签管理系统。

## ✨ 功能特性

- 📁 **文件夹管理** - 创建、编辑、删除文件夹,支持嵌套结构
- 🔖 **书签管理** - 添加、编辑、删除书签
- 🗑️ **回收站** - 软删除机制,可恢复已删除的书签和文件夹
- 📤 **导入/导出** - 支持 Netscape HTML 格式的书签导入导出
- 🔐 **身份验证** - 基于 Cookie 的安全认证系统
- 🔒 **安全增强** - 输入验证、速率限制、SQL 注入防护
- 🎯 **拖拽排序** - 拖拽文件夹和书签进行重新排序
- ⚡ **无服务器架构** - 部署在 Cloudflare Workers,全球边缘网络加速
- 💾 **D1 数据库** - 使用 Cloudflare D1 SQLite 数据库存储数据
- 🎨 **优化体验** - 流畅的加载动画和响应式设计

**新增功能**: 拖拽排序! 查看 [DRAG_DROP_GUIDE.md](./DRAG_DROP_GUIDE.md) 了解详情

## 🚀 技术栈

- **后端框架**: [Hono](https://hono.dev/) - 轻量级 Web 框架
- **运行时**: Cloudflare Workers
- **数据库**: Cloudflare D1 (SQLite)
- **前端**: 原生 HTML/CSS/JavaScript + Alpine.js
- **语言**: TypeScript

## 📋 前置要求

- Node.js 16.x 或更高版本
- npm 或 yarn
- Cloudflare 账号
- Wrangler CLI (Cloudflare 开发工具)

## 📢 重要提示

### 🔐 安全升级

如果你正在从旧版本升级,请查看 [UPGRADE.md](./UPGRADE.md) 了解最新的安全改进和部署步骤。

**主要改进:**
- ✅ 环境变量配置(不再硬编码密钥)
- ✅ 请求速率限制(防止 DDoS 攻击)
- ✅ 输入验证和 SQL 注入防护
- ✅ 数据库索引优化

## 🛠️ 本地开发

### 1. 克隆项目

```bash
git clone https://github.com/YOUR_USERNAME/web-bookmarks.git
cd web-bookmarks
```

### 2. 安装依赖

```bash
npm install
```

### 3. 创建本地数据库

```bash
# 创建本地 D1 数据库
npx wrangler d1 create bookmarks-db

# 复制输出的 database_id 并更新 wrangler.toml 中的 database_id
```

### 4. 配置环境变量

```bash
# 复制环境变量模板
cp .dev.vars.example .dev.vars

# 生成密钥
openssl rand -base64 32

# 将生成的密钥添加到 .dev.vars 文件
```

编辑 `.dev.vars`:
```
SECRET_KEY=your-generated-secret-key-here
```

### 5. 初始化数据库表结构

```bash
# 本地开发环境
npx wrangler d1 execute bookmarks-db --local --file=./schema.sql

# 应用索引优化(可选但推荐)
npx wrangler d1 execute bookmarks-db --local --file=./migrations/002_add_indexes.sql
```

### 6. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:8787` 即可看到应用。

默认登录凭据:
- 用户名: `admin`
- 密码: `12345`

## 📦 部署到 Cloudflare Workers

### 🆕 已有项目更新?

如果你已经在 Cloudflare Workers 上部署了此项目,请查看 **[DEPLOYMENT.md](./DEPLOYMENT.md)** 了解详细的更新步骤。

**快速更新命令:**
```bash
# 1. 设置 SECRET_KEY (首次部署必需)
npx wrangler secret put SECRET_KEY

# 2. 运行数据库迁移(添加索引优化)
npm run migrate:remote

# 3. 部署
npm run deploy
```

### 新项目部署

#### 方法一: 使用 Wrangler CLI (推荐)

1. **登录 Cloudflare**

```bash
npx wrangler login
```

2. **创建生产环境数据库**

```bash
# 创建 D1 数据库
npx wrangler d1 create bookmarks-db

# 记录输出的 database_id,更新 wrangler.toml
```

3. **更新 wrangler.toml**

编辑 `wrangler.toml`,将 `database_id` 替换为实际的数据库 ID:

```toml
[[d1_databases]]
binding = "DB"
database_name = "bookmarks-db"
database_id = "your-actual-database-id"  # 替换这里
```

4. **设置 SECRET_KEY**

```bash
# 生成密钥
openssl rand -base64 32

# 设置密钥
npx wrangler secret put SECRET_KEY
```

5. **初始化生产数据库**

```bash
# 创建表结构
npx wrangler d1 execute bookmarks-db --remote --file=./schema.sql

# 添加索引优化(推荐)
npx wrangler d1 execute bookmarks-db --remote --file=./migrations/002_add_indexes.sql
```

6. **部署应用**

```bash
npm run deploy
```

部署成功后,Wrangler 会输出你的应用 URL,类似:
```
https://web-bookmarks.YOUR_SUBDOMAIN.workers.dev
```

7. **(可选) 启用速率限制**

```bash
# 创建 KV 命名空间
npx wrangler kv:namespace create RATE_LIMIT_KV

# 将输出的配置添加到 wrangler.toml
# 重新部署
npm run deploy
```

#### 方法二: 使用 GitHub Actions 自动部署

1. **设置 GitHub Secrets**

在 GitHub 仓库的 Settings > Secrets and variables > Actions 中添加:

- `CLOUDFLARE_API_TOKEN`: Cloudflare API Token
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID

2. **创建 GitHub Actions 工作流**

项目已包含 `.github/workflows/deploy.yml`,每次推送到 `main` 分支时自动部署。

## 🔧 配置说明

### wrangler.toml

主要配置文件,包含:
- Worker 名称
- D1 数据库绑定
- 兼容性日期

### 环境变量

如需使用环境变量,创建 `.dev.vars` 文件(本地开发):

```
# .dev.vars
SECRET_KEY=your-secret-key
```

## 📖 API 文档

### 认证相关

- `POST /api/login` - 用户登录
- `POST /api/logout` - 用户登出
- `PUT /api/settings` - 更新用户名和密码

### 数据管理

- `GET /api/data` - 获取所有文件夹和书签
- `GET /api/trash` - 获取回收站内容

### 文件夹操作

- `POST /api/folders` - 创建文件夹
- `PUT /api/folders/:id` - 更新文件夹
- `DELETE /api/folders/:id` - 删除文件夹(软删除)
- `POST /api/restore/folders/:id` - 恢复文件夹
- `DELETE /api/trash/folders/:id` - 永久删除文件夹

### 书签操作

- `POST /api/bookmarks` - 创建书签
- `PUT /api/bookmarks/:id` - 更新书签
- `DELETE /api/bookmarks/:id` - 删除书签(软删除)
- `POST /api/restore/bookmarks/:id` - 恢复书签
- `DELETE /api/trash/bookmarks/:id` - 永久删除书签

### 导入导出

- `GET /api/export` - 导出书签为 HTML 格式
- `POST /api/import` - 导入 Netscape HTML 格式书签

## 🗄️ 数据库结构

### folders 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| name | TEXT | 文件夹名称 |
| parent_id | INTEGER | 父文件夹 ID |
| is_deleted | INTEGER | 是否已删除 (0/1) |
| created_at | TIMESTAMP | 创建时间 |

### bookmarks 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| title | TEXT | 书签标题 |
| url | TEXT | 书签 URL |
| description | TEXT | 描述 |
| folder_id | INTEGER | 所属文件夹 ID |
| is_deleted | INTEGER | 是否已删除 (0/1) |
| created_at | TIMESTAMP | 创建时间 |

### settings 表

| 字段 | 类型 | 说明 |
|------|------|------|
| key | TEXT | 设置键 (主键) |
| value | TEXT | 设置值 |

## 🔒 安全建议

1. **修改默认密码**: 部署后立即登录并修改默认的用户名和密码
2. **使用 HTTPS**: Cloudflare Workers 默认提供 HTTPS
3. **定期备份**: 定期导出书签数据作为备份
4. **API Token 安全**: 不要将 Cloudflare API Token 提交到代码库

## 🤝 贡献

欢迎提交 Issue 和 Pull Request!

## 📄 许可证

ISC License

## 🙋 常见问题

### 如何重置密码?

如果忘记密码,可以通过 Wrangler CLI 直接修改数据库:

```bash
npx wrangler d1 execute bookmarks-db --remote --command="UPDATE settings SET value='newpassword' WHERE key='password'"
```

### 如何备份数据?

1. 使用应用内的导出功能导出 HTML 格式书签
2. 或使用 Wrangler 导出整个数据库:

```bash
npx wrangler d1 export bookmarks-db --remote --output=backup.sql
```

### 如何查看数据库内容?

```bash
# 查看所有书签
npx wrangler d1 execute bookmarks-db --remote --command="SELECT * FROM bookmarks"

# 查看所有文件夹
npx wrangler d1 execute bookmarks-db --remote --command="SELECT * FROM folders"
```

## 📞 支持

如有问题,请提交 [Issue](https://github.com/YOUR_USERNAME/web-bookmarks/issues)

---

⭐ 如果这个项目对你有帮助,请给个 Star!
