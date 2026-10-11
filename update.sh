#!/bin/bash
# ========================================================
# BOM Workbench (元器件与BOM工程工作台) 自动化更新与重启脚本
# 适用目录: /root/bom
# ========================================================

set -e

echo "========================================================"
echo " 🔄 正在更新并重启 BOM Workbench..."
echo "========================================================"

# 1. 如果存在 Git 仓库，自动拉取最新代码
if [ -d ".git" ]; then
    echo "⬇️ 检测到 Git 仓库，正在拉取最新代码..."
    git pull || echo "⚠️ Git 拉取跳过或有未提交冲突，直接继续本地构建"
fi

# 2. 检查 Docker Compose 命令兼容性
if docker compose version &> /dev/null; then
    COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE="docker-compose"
else
    echo "❌ 未检测到 docker compose 命令"
    exit 1
fi

# 3. 重新编译前端与构建镜像并拉起
echo "🚀 正在重构镜像并重新部署容器..."
$COMPOSE up -d --build

echo ""
echo "✔ 容器运行状态:"
$COMPOSE ps

echo ""
echo "========================================================"
echo "🎉 BOM Workbench 已成功更新并重启完成！"
echo "🌐 访问地址: http://106.55.36.231:3000"
echo "📜 查看实时日志: $COMPOSE logs -f bom-workbench"
echo "========================================================"
