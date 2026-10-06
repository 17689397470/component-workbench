@echo off
chcp 65001 >nul
title BOM Pro - 个人元器件库存管理与 BOM 查重工作台

echo ==========================================================
echo ⚡ 正在启动 BOM Pro 个人元器件库存管理工作台...
echo ==========================================================

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js 环境，请先安装 Node.js (https://nodejs.org)
    pause
    exit /b
)

if not exist "node_modules" (
    echo [提示] 首次运行，正在自动安装依赖包，请稍候...
    call npm install
)

echo [提示] 正在启动后端服务并打开浏览器...
start "" http://localhost:3000

node server.js
pause
