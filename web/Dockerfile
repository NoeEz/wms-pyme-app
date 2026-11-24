# Builds the portal and serves it with Caddy, which also terminates HTTPS
# and proxies /api and /health to the API (see deploy/Caddyfile).
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
