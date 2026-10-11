# ==========================================
# 阶段 1: 前端静态构建与依赖安装 (Builder)
# ==========================================
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# 复制依赖配置
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# 安装所有依赖（含前端构建所需的 devDependencies）
RUN npm install
RUN npm --prefix frontend install

# 复制全量源代码
COPY . .

# 执行前端生产构建，生成静态打包产物 /app/dist
RUN npm run build

# ==========================================
# 阶段 2: 极简生产运行镜像 (Runner)
# ==========================================
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# 设置时区与生产环境变量
ENV NODE_ENV=production \
    PORT=3000 \
    TZ=Asia/Shanghai

# 安装 tzdata 保证时区对齐
RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

# 从构建器中复制运行时核心文件与静态资源
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# 创建持久化数据库目录
RUN mkdir -p /app/data

# 挂载卷与端口暴露
VOLUME ["/app/data"]
EXPOSE 3000

# 启动服务
CMD ["node", "server.js"]
