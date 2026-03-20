# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# prebuild generuje public/version.json, vite build kopiuje public/ → dist/
RUN npm run build
# Walidacja: build failuje, gdy brak dist/version.json (nie wdrożymy bez wersji)
RUN test -f dist/version.json || (echo "ERROR: dist/version.json missing after build" && exit 1)

# Stage 2: Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
