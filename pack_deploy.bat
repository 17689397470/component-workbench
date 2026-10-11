@echo off
chcp 65001 >nul
echo ========================================================
echo  📦 正在打包 BOM 工作台源码 (自动排除大型依赖缓存)...
echo ========================================================

tar -czvf bom_deploy.tar.gz --exclude="node_modules" --exclude="frontend/node_modules" --exclude=".git" --exclude="data/backups" --exclude="*.log" .

echo.
echo ========================================================
echo  ✔ 打包成功: bom_deploy.tar.gz (大小仅数兆，秒级传输)
echo ========================================================
echo.
echo 【第 1 步】在本地命令行执行上传:
echo   scp bom_deploy.tar.gz root@106.55.36.231:/root/
echo.
echo 【第 2 步】在服务器终端执行解压并一键部署:
echo   mkdir -p /root/bom ^&^& cd /root/bom ^&^& tar -xzvf /root/bom_deploy.tar.gz ^&^& chmod +x deploy.sh update.sh ^&^& ./deploy.sh
echo.
echo ========================================================
pause
