# 多阶段构建：先构建前端，再打包运行时
# 说明：服务端仅依赖 Node 内置模块（http/fs/node:sqlite），无需生产依赖
FROM node:24-alpine AS build
WORKDIR /app
COPY client/package*.json ./client/
RUN npm --prefix client install
COPY client ./client
RUN npm --prefix client run build

# 运行时镜像
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
# PORT 由平台注入；PUBLIC_URL/RENDER_EXTERNAL_URL 等由平台自动注入
COPY package.json ./
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
EXPOSE 3001
CMD ["node", "server/index.js"]
