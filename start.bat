@echo off
chcp 65001 >nul
title BOM Pro - 元器件与BOM管理工作台
echo ========================================================
echo  ⚡ 正在启动 BOM Pro 元器件库存管理与 BOM 查重工作台...
echo ========================================================
timeout /t 1 >nul
start "" http://localhost:3000
npm start
