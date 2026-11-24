# Builds the portal and serves it with Caddy, which also proxies /api and
# /health to the API (see deploy/Caddyfile). HTTPS is the host nginx's job.
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
