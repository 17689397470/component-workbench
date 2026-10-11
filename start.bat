@echo off
chcp 65001 >nul
title BOM Pro - 元器件与BOM工程工作台
echo ========================================================
echo  ⚡ 正在启动 BOM Pro 元器件库存管理与 BOM 查重工作台...
echo ========================================================

:: 检查 Node.js 环境
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js 环境，请先安装 Node.js (https://nodejs.org/)
    pause
    exit /b 1
)

:: 检查依赖是否存在
if not exist "node_modules\" (
    echo [提示] 首次运行，正在自动安装项目依赖...
    call npm install
)

echo [1/2] 正在拉起本地核心服务 (端口 3000)...
timeout /t 1 >nul

echo [2/2] 正在打开默认浏览器访问工作台...
start "" http://localhost:3000

:: 启动后台服务进程
npm start
