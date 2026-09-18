# ---- build stage ------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# deps first so the layer cache survives source edits
COPY package*.json ./
RUN (npm ci --no-audit --no-fund || npm install --no-audit --no-fund)

# config + sources
COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN npm run build

# ---- serve stage ------------------------------------------------------------
# pure static hosting: no backend, no runtime secrets, ~450 KB of assets
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://127.0.0.1/index.html || exit 1
