# ⚡ BOM Workbench (元器件与BOM工程工作台)

> 专为电子工程师、硬件创客与实验室打造的现代化元器件库存管理、物理收纳盒透视与 BOM 智能配料系统。

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57.svg)](https://www.sqlite.org/)

---

## 📖 核心文档导航

- 📘 **[全功能使用手册 (USER_GUIDE.md)](./USER_GUIDE.md)**：包含盲打速记规则、物理收纳盒 2.0 网格投射、BOM 四色查重、手机扫码 OCR 拍标签的深度图文操作指南。
- 🚀 **[生产部署指南 (DEPLOY.md)](./DEPLOY.md)**：包含 Docker Compose 容器化编排、腾讯云多项目共存端口规划与一键部署脚本。

---

## ✨ 核心特性

- 🗄️ **物理收纳空间 2.0 (Boxes 2.0)**：
  - 1:1 投射 3×4、4×6 零件柜等二维网格矩阵（绿色占用、灰白空格）；
  - 支持贴片阻容样品本分页与散料随手盒，点击空格位即可将未分配散料一键绑定入格。
- ⚡ **硬件级参数智能解构引擎**：
  - **中置单位法识别**：输入 `4u7` $\to$ 4.7µF，`2R2` $\to$ 2.2Ω；
  - **工业容差字母代码转译**：准确识别 `104K` 中的 `K` 是 $\pm10\%$ 而非千欧；
  - **介质材质自动剥离**：自动抽离 `X7R`、`C0G`、`金属膜` 为固有规格；
  - **半导体知识图谱补全**：输入 `AO3400` 或 `AMS1117-3.3` 自动补齐极性与耐压电流。
  - **工业防呆歧义拦截**：纯数字 `104` 主动拦截提示电容/电阻歧义，绝不盲目瞎猜。
- 🔍 **立创官方直连与在线校准**：
  - 录入立创 C 编号（如 `C2057`）秒级调取官方数据手册 PDF、原厂规格与高清元件图。
- 📋 **BOM 四色查重与智能拣料单**：
  - 导入 EasyEDA / KiCad / Altium 导出的 BOM 表格，自动计算四色状态：
    🟩 完全现货（免买）｜ 🟦 建议替代（耐压/封装兼容复用）｜ 🟨 需补库存（差额）｜ 🟥 必须采购；
  - **物理拣料清单 (Pick List)**：按收纳柜真实物理抽屉位置自动分组，照单取料效率提升 5 倍；
  - **工程套料预扣**：支持制作项目开工锁库 (Lock) 与焊接完工核销 (Complete)。
- 📱 **多模态移动端交互**：
  - 手机扫立创元器件塑料袋二维码秒级录入；
  - 拍贴片胶带剪切条/芯片微距标签 OCR 智能识别。
- 🔒 **公网安全与数据无忧**：
  - 支持通过环境变量 `ACCESS_PASSWORD` 开启访问密码保护，初次验证后浏览器自动保持令牌；
  - SQLite WAL 并发与抗掉电保护，支持本地自动快照保存与一键秒级回滚。

---

## 🚀 本地快速启动

### 方式 A：Windows 一键启动
双击项目根目录下的 **`start.bat`**，脚本将自动检测依赖并在浏览器中打开：
👉 `http://localhost:3000`

### 方式 B：命令行启动
```bash
# 1. 安装依赖
npm install
npm --prefix frontend install

# 2. 构建前端
npm run build

# 3. 启动服务
npm start
```

---

## 🌐 服务器生产环境部署 (Docker)

在服务器（如腾讯云 Linux）上直接执行：
```bash
# 1. 克隆代码
git clone https://gitee.com/yan-chaoyong/component-workbench.git /root/bom
cd /root/bom

# 2. 一键启动
chmod +x deploy.sh update.sh
./deploy.sh
```
*更多生产配置、端口避让与日常运维命令，详见 [DEPLOY.md](./DEPLOY.md)。*

---

## 📁 目录结构

```
bom/
├── frontend/             # 现代现代化前端 (React 18 + Tailwind CSS + Lucide)
├── lib/
│   ├── db.js             # SQLite WAL 存储持久层与备份快照引擎
│   ├── parser.js         # 硬件参数深度解构与防呆状态机
│   ├── bomMatcher.js     # BOM 四色比对与按盒子分组拣料引擎
│   ├── lcscService.js    # 立创官方元器件查询与混合兜底网关
│   └── taobaoParser.js   # 电商订单表格批量解构
├── public/               # 轻量级原生回退页面与静态资源
├── test/                 # 自动化全链路集成与单元测试 (100% 绿灯)
├── Dockerfile            # 生产级多阶段容器镜像定义
├── docker-compose.yml    # 容器编排与宿主机数据卷映射
├── deploy.sh             # 服务器首次自动化安装拉起脚本
├── update.sh             # 服务器日常一键拉取代码与平滑重启脚本
├── USER_GUIDE.md         # 详细全功能使用手册
└── DEPLOY.md             # 生产运维部署指南
```

---

## 📄 开源许可

本项目遵循 [ISC License](LICENSE)。
