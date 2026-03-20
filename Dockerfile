# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
# version.json – niezależnie od prebuild, zawsze tworzony w dist/ (git w kontekście)
RUN GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown") && \
    echo "{\"sha\":\"$GIT_SHA\",\"date\":\"$(date -Iseconds)\"}" > dist/version.json
RUN test -f dist/version.json || (echo "ERROR: dist/version.json missing" && exit 1)

# Stage 2: Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
