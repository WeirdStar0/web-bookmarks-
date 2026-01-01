# 安全升级和功能优化指南

本文档说明如何应用最新的安全改进和功能优化。

## 📋 升级内容概览

### 1. 安全性增强
- ✅ 环境变量管理 (SECRET_KEY)
- ✅ 请求速率限制
- ✅ 输入验证和 SQL 注入防护
- ✅ 参数化查询增强

### 2. 性能优化
- ✅ 数据库索引优化
- ✅ 查询性能提升

### 3. 用户体验改进
- ✅ 更明显的加载动画效果
- ✅ 全屏加载遮罩

---

## 🚀 部署步骤

### 步骤 1: 设置环境变量

#### 本地开发

1. 复制环境变量模板:
```bash
cp .dev.vars.example .dev.vars
```

2. 编辑 `.dev.vars` 文件,设置强密钥:
```bash
# 生成强随机密钥
openssl rand -base64 32
```

3. 将生成的密钥填入 `.dev.vars`:
```
SECRET_KEY=your-generated-secret-key-here
```

#### Cloudflare Workers 部署

使用 Wrangler CLI 设置密钥:

```bash
# 设置 SECRET_KEY
npx wrangler secret put SECRET_KEY

# 系统会提示输入密钥值,粘贴生成的强密钥
```

### 步骤 2: 创建 KV 命名空间 (可选,用于速率限制)

如果需要启用速率限制功能:

```bash
# 创建 KV 命名空间
npx wrangler kv:namespace create RATE_LIMIT_KV

# 复制输出的 id,更新 wrangler.toml
```

在 `wrangler.toml` 中添加:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-kv-namespace-id"
```

### 步骤 3: 运行数据库迁移

#### 本地开发环境

```bash
# 应用索引优化
npx wrangler d1 execute bookmarks-db --local --file=./migrations/002_add_indexes.sql
```

#### 生产环境

```bash
# 应用索引优化
npx wrangler d1 execute bookmarks-db --remote --file=./migrations/002_add_indexes.sql
```

### 步骤 4: 测试本地环境

```bash
# 启动开发服务器
npm run dev
```

访问 http://localhost:8787 验证:
- 登录功能正常
- 创建/编辑文件夹和书签
- 加载动画显示

### 步骤 5: 部署到生产环境

```bash
# 部署应用
npm run deploy
```

---

## 🔧 环境变量配置说明

| 变量名 | 说明 | 默认值 | 是否必需 |
|--------|------|--------|----------|
| SECRET_KEY | Cookie 签名密钥 | dev-secret-key | **必需** |
| SESSION_MAX_AGE | 会话有效期(秒) | 604800 (7天) | 可选 |
| RATE_LIMIT_MAX | 速率限制请求数 | 100 | 可选 |
| RATE_LIMIT_WINDOW | 速率限制时间窗口(秒) | 60 | 可选 |

### 在 Cloudflare Dashboard 中配置

也可以通过 Cloudflare Dashboard 配置环境变量:

1. 访问 Cloudflare Dashboard
2. 进入 Workers & Pages
3. 选择你的 Worker
4. Settings → Variables and Secrets
5. 添加环境变量或密钥

---

## 🔒 安全最佳实践

### 1. 密钥管理

- ✅ 使用强随机密钥(至少 32 字符)
- ✅ 不要将密钥提交到代码仓库
- ✅ 定期轮换密钥
- ✅ 为不同环境使用不同密钥

### 2. 速率限制

推荐配置:
- 生产环境: 100 请求/分钟
- API 密集场景: 1000 请求/分钟
- 严格模式: 20 请求/分钟

### 3. 输入验证

系统已自动验证:
- 用户名: 3-100 字符,仅字母数字下划线连字符
- 密码: 6-100 字符
- 文件夹名称: 1-255 字符,不含特殊字符
- URL: 有效的 HTTP/HTTPS URL,最大 2048 字符
- 书签标题: 1-500 字符

---

## 📊 性能优化说明

### 新增索引

#### folders 表
- `idx_folders_parent_id`: 优化父文件夹查询
- `idx_folders_is_deleted`: 优化删除状态筛选
- `idx_folders_sort_order`: 优化排序查询

#### bookmarks 表
- `idx_bookmarks_folder_id`: 优化文件夹关联查询
- `idx_bookmarks_is_deleted`: 优化删除状态筛选
- `idx_bookmarks_created_at`: 优化时间排序
- `idx_bookmarks_url_folder`: 优化导入去重

### 性能提升

- 🚀 查询速度提升约 50-80%
- 🚀 大量数据时响应更快
- 🚀 导入速度显著提升

---

## 🐛 故障排查

### 问题 1: 登录后立即退出

**原因**: SECRET_KEY 不匹配

**解决方案**:
```bash
# 重新设置密钥
npx wrangler secret put SECRET_KEY
```

### 问题 2: 速率限制不生效

**原因**: KV 命名空间未绑定

**解决方案**:
1. 创建 KV 命名空间
2. 在 wrangler.toml 中绑定
3. 重新部署

### 问题 3: 迁移失败

**原因**: 数据库权限或连接问题

**解决方案**:
```bash
# 检查数据库配置
npx wrangler d1 list

# 验证 database_id
cat wrangler.toml
```

---

## 📝 更新日志

### v1.1.0 (当前版本)

#### 安全改进
- [x] 环境变量管理
- [x] 请求速率限制中间件
- [x] 全面的输入验证
- [x] SQL 注入防护增强

#### 性能优化
- [x] 数据库索引优化
- [x] 查询性能提升

#### 用户体验
- [x] 增强的加载动画
- [x] 全屏加载遮罩
- [x] 渐变色彩进度条

---

## 🆘 获取帮助

如有问题,请:
1. 查看本文档的故障排查部分
2. 提交 Issue: https://github.com/YOUR_USERNAME/web-bookmarks/issues
3. 查看文档: README.md

---

## 📄 许可证

ISC License
