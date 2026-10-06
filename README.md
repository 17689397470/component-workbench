# component-workbench

> 个人电子元器件库存管理 & BOM 查重工作台

一个专为电子爱好者 / 创客 / 工程师打造的本地 Web 应用，帮你管理元器件库存、导入淘宝订单、核查 BOM 缺料、管理制作项目套料，支持手机扫码访问。

---

## ✨ 功能亮点

| 模块 | 说明 |
|------|------|
| 📦 **库存管理** | 元器件 CRUD、快速增减库存、按分类/位置搜索、低库存告警 |
| 📋 **BOM 核查** | 上传 EasyEDA / 嘉立创导出的 BOM 文件，自动与库存比对，生成拣货清单 & 缺料清单，一键出库扣减 |
| 🛒 **淘宝订单导入** | 解析淘宝电商订单 Excel，智能识别元器件规格并合并入库，支持批次回滚 |
| 🗂️ **项目套料管理** | 创建制作项目、预锁库存、完工消库、导出项目缺料采购清单 |
| 📦 **收纳盒管理** | 按存放盒生成二维码标签，手机扫码即可查看盒内物料 |
| 🔍 **立创官方查询** | 在线查询嘉立创商城物料规格，快速录入 |
| 📱 **局域网访问** | 启动时自动输出局域网二维码，手机可直接扫码访问 |

---

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org) >= 16

### 安装 & 启动

```bash
# 克隆仓库
git clone https://github.com/你的用户名/component-workbench.git
cd component-workbench

# 安装依赖
npm install

# 启动服务
npm start
# 或 Windows 双击 start.bat
```

浏览器访问 [http://localhost:3000](http://localhost:3000)

---

## 📁 项目结构

```
component-workbench/
├── server.js            # Express 后端入口（35+ RESTful API）
├── start.bat            # Windows 一键启动脚本
├── lib/
│   ├── db.js            # SQLite 数据库操作层
│   ├── parser.js        # 元器件文本智能解析
│   ├── bomMatcher.js    # BOM 文件解析与库存比对
│   ├── lcscService.js   # 嘉立创商城在线查询
│   ├── taobaoParser.js  # 淘宝/电商订单 Excel 解析
│   └── taobaoRules.js   # 淘宝解析规则 / 黑白名单
├── public/
│   ├── index.html       # 前端单页应用入口
│   ├── css/style.css    # 样式
│   └── js/
│       ├── app.js           # 主应用逻辑
│       ├── bomView.js       # BOM 核查视图
│       ├── boxesView.js     # 收纳盒视图
│       ├── projectsView.js  # 项目管理视图
│       └── scanner.js       # 二维码扫描
├── test/                # 测试脚本
└── data/                # SQLite 数据库（本地存储，不提交）
```

---

## 🛠️ 技术栈

- **后端**：Node.js + Express
- **数据库**：SQLite（`sqlite3`）
- **前端**：原生 HTML / CSS / JavaScript（无框架依赖）
- **文件处理**：xlsx（Excel 读写）、multer（文件上传）
- **工具**：qrcode（二维码生成）

---

## 📄 License

ISC
