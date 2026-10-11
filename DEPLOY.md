# 📦 BOM Workbench (元器件与BOM工程工作台) 部署与运维指南

本项目专为硬件工程师、创客与实验室打造，基于 Node.js + SQLite WAL + Docker Compose 构建，支持公网多端同步访问、手机拍标签扫码、物理收纳盒网格透视及 BOM 智能比对。

---

## 📍 服务器与路径信息

| 配置项 | 详细信息 | 说明 |
| :--- | :--- | :--- |
| **公网 IP** | `106.55.36.231` | 腾讯云服务器 |
| **服务器部署目录** | `/root/bom` | 独立目录，与现有的 `/root/wifi` 物理隔离 |
| **运行方式** | Docker Compose 容器化（后台常驻守护） | 容器名：`bom-workbench` |
| **外部通信端口** | `3000` | 避开 80 端口与 6099 端口，无缝并存 |

---

## 🌐 服务访问入口与端口规划

同一台服务器上多项目共存端口规划：

| 服务名称 | 访问地址 | 所属项目 | 说明 |
| :--- | :--- | :--- | :--- |
| **校园网系统 / 管理台** | `http://106.55.36.231` / `/admin` | `/root/wifi` | 占用默认 80 端口，正常保持运行 |
| **QQ 机器人控制台** | `http://106.55.36.231:6099/webui` | `/root/wifi` | 占用 6099 端口 (NapCat) |
| **⚡ BOM 元器件工作台** | **`http://106.55.36.231:3000`** | **`/root/bom`** | **元器件管理、收纳盒透视、BOM比对** |

> 🔒 **访问安全**：BOM 工作台部署于公网，内置 `ACCESS_PASSWORD` 访问密码保护。首次打开网页输入密码后，浏览器将自动持久化登录令牌，手机与电脑无需反复输密。

---

## 🚀 首次快速部署（只需 3 步）

### 1. 将项目上传至服务器 `/root/bom`

在服务器上创建目录并进入：
```bash
mkdir -p /root/bom
cd /root/bom
```

**上传方式选其一：**
- **方式 A（推荐，Git 拉取）**：
  ```bash
  git clone <你的Git仓库地址> .
  ```
- **方式 B（本地一键打包 SCP 上传）**：
  在本地终端执行：
  ```bash
  # 将本地代码打包上传到服务器
  scp -r * root@106.55.36.231:/root/bom/
  ```

### 2. 赋予执行权限并一键拉起

在服务器 `/root/bom` 目录下执行：
```bash
chmod +x deploy.sh update.sh
./deploy.sh
```

脚本将自动完成：
- 检测 Docker 与 Compose 环境；
- 从 `.env.example` 自动生成生产 `.env` 配置文件与安全初始访问密码；
- 编译前端静态资源，构建轻量 Node.js 镜像并启动容器；
- 在终端打印公网访问网址与访问密码。

### 3. 腾讯云安全组放行 3000 端口

登录 **腾讯云控制台** $\to$ **云服务器** $\to$ **安全组** $\to$ **修改规则**：
- **方向**：入站规则
- **协议端口**：`TCP: 3000`
- **来源**：`0.0.0.0/0`
- **策略**：允许

---

## 🛠️ 服务器常用维护命令（登录服务器终端后）

进入 BOM 项目目录：
```bash
cd /root/bom
```

### 1. 查看容器运行状态
```bash
docker compose ps
```

### 2. 查看工作台运行日志（实时流）
```bash
docker compose logs -f bom-workbench
```

### 3. 一键更新或平滑重启（修改代码后执行）
```bash
./update.sh
```

### 4. 修改访问安全密码
编辑配置文件：
```bash
nano .env   # 或 vim .env
```
修改 `ACCESS_PASSWORD=你的新强密码`，保存后执行重启：
```bash
./update.sh
```

### 5. 停止与启动容器
```bash
# 临时停止
docker compose stop

# 启动已停止的服务
docker compose start

# 完全下线容器
docker compose down
```

---

## 💾 数据持久化与定期备份

系统数据全部保存在宿主机目录 **`/root/bom/data/`** 中，容器销毁、重构镜像或系统重启数据均绝对安全。

- **数据库主文件**：`/root/bom/data/components.db`
- **本地历史快照**：`/root/bom/data/backups/`

### 手动一键备份到宿主机归档：
```bash
cd /root/bom
tar -czvf bom_backup_$(date +%Y%m%d).tar.gz data/
```
通过网页端顶部 **“设置 / 备份中心”** 亦可随时一键下载全量 JSON 备份包。
