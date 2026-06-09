# ---- build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

# Copy manifests + npm config first for better layer caching + correct registry
COPY package.json package-lock.json* .npmrc* ./
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
# Use ci for reproducible install; --include=dev to override global omit=dev
RUN npm ci --include=dev

COPY . .
RUN npm run build

# ---- serve stage ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
