#!/bin/bash

# Web Bookmarks Manager - 初始化脚本

set -e

echo "🚀 Web Bookmarks Manager - 初始化脚本"
echo "======================================"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未安装 Node.js"
    echo "请访问 https://nodejs.org/ 下载安装"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"

# 安装依赖
echo ""
echo "📦 安装依赖..."
npm install

# 检查 wrangler
if ! command -v wrangler &> /dev/null; then
    echo ""
    echo "⚠️  未检测到 Wrangler CLI,正在安装..."
    npm install -g wrangler
fi

echo "✅ Wrangler 版本: $(wrangler --version)"

# 检查 .dev.vars
if [ ! -f .dev.vars ]; then
    echo ""
    echo "🔐 配置环境变量..."
    cp .dev.vars.example .dev.vars

    # 生成密钥
    if command -v openssl &> /dev/null; then
        SECRET_KEY=$(openssl rand -base64 32)
        sed -i "s/your-secret-key-replace-me-in-production/$SECRET_KEY/" .dev.vars
        echo "✅ 已生成 SECRET_KEY 并保存到 .dev.vars"
    else
        echo "⚠️  警告: 未找到 openssl,请手动编辑 .dev.vars 设置 SECRET_KEY"
    fi
else
    echo "✅ .dev.vars 已存在"
fi

# 检查数据库
echo ""
echo "💾 配置数据库..."

# 读取 wrangler.toml 中的 database_id
if grep -q "database_id = \"\"" wrangler.toml || grep -q "database_id = \"your-actual-database-id\"" wrangler.toml; then
    echo ""
    echo "⚠️  需要创建 D1 数据库"
    read -p "是否现在创建? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "正在创建数据库..."
        wrangler d1 create bookmarks-db
        echo ""
        echo "请将输出的 database_id 更新到 wrangler.toml 文件中"
        echo "然后重新运行此脚本"
        exit 0
    fi
else
    echo "✅ database_id 已配置"
fi

echo ""
echo "🎉 初始化完成!"
echo ""
echo "下一步:"
echo "1. 运行数据库迁移: npm run migrate"
echo "2. 启动开发服务器: npm run dev"
echo ""
echo "查看文档:"
echo "- README.md - 完整使用指南"
echo "- UPGRADE.md - 升级和部署指南"
