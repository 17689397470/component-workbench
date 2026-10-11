#!/bin/bash
# ========================================================
# BOM Workbench (元器件与BOM工程工作台) 自动化生产部署脚本
# 适用环境: Linux (Ubuntu / Debian / CentOS / Rocky 等)
# ========================================================

set -e

echo "========================================================"
echo " ⚡ 开始部署 BOM Workbench 生产环境..."
echo "========================================================"

# 1. 检测 Docker 环境
if ! command -v docker &> /dev/null; then
    echo "❌ 未检测到 Docker，请先安装 Docker 环境:"
    echo "   curl -fsSL https://get.docker.com | bash"
    exit 1
fi

# 2. 检测 Docker Compose 命令 (支持 docker compose 与 docker-compose)
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo "❌ 未检测到 Docker Compose 插件，请先安装 docker compose"
    exit 1
fi

echo "✔ 检测到 Docker 环境: $($DOCKER_COMPOSE_CMD version)"

# 3. 初始化 .env 配置文件
if [ ! -f ".env" ]; then
    echo "ℹ 未检测到 .env 配置文件，正在从 .env.example 自动生成..."
    cp .env.example .env
    # 生成一个随机 8 位初始密码建议
    RANDOM_PASS="bom_$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 8 ; echo '')"
    sed -i "s/ChangeThisPassword_123456/${RANDOM_PASS}/g" .env
    echo "🔑 已自动为你生成初始访问密码: ${RANDOM_PASS}"
    echo "   （若需修改，可在 .env 文件中编辑 ACCESS_PASSWORD）"
else
    echo "✔ 载入现有 .env 配置文件"
fi

# 4. 创建持久化数据目录
mkdir -p data/backups
chmod -R 755 data

# 5. 构建并启动容器
echo "🚀 正在构建并拉起 Docker 容器..."
$DOCKER_COMPOSE_CMD up -d --build

# 6. 读取配置端口与公网 IP 提示
PORT=$(grep -E '^PORT=' .env | cut -d '=' -f 2 || echo "3000")
[ -z "$PORT" ] && PORT="3000"

# 尝试获取本机公网 IP (备选 106.55.36.231)
PUBLIC_IP=$(curl -s --connect-timeout 2 http://ifconfig.me || echo "106.55.36.231")

echo ""
echo "========================================================"
echo "🎉 部署完成！服务已在后台常驻运行！"
echo "========================================================"
echo "🌐 访问地址: http://${PUBLIC_IP}:${PORT}"
echo "📁 数据持久化路径: $(pwd)/data"
echo "📜 查看实时日志: $DOCKER_COMPOSE_CMD logs -f bom-workbench"
echo "🔄 一键更新重启: ./update.sh"
echo "🛑 停止容器:     $DOCKER_COMPOSE_CMD down"
echo "========================================================"
