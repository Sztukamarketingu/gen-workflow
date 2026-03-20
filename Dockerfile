# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Generuj /version.json (commit SHA + data) – do weryfikacji deployu
RUN GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown") && \
    echo "{\"sha\":\"$GIT_SHA\",\"date\":\"$(date -Iseconds)\"}" > public/version.json
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
