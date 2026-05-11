# ── Dev stage (used by docker-compose.yml) ────────────────────────────────────
FROM node:20-alpine AS dev

WORKDIR /app

COPY package*.json ./
# Retry npm ci once on a 10s back-off — transient ECONNRESET / network
# aborts from the registry are common enough on GitHub Actions runners
# to take down a clean PR. --fetch-retries bumps npm's internal retry
# count too, which catches most blips before the outer fallback fires.
RUN npm ci --prefer-offline --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000 \
    || (sleep 10 && npm ci --prefer-offline --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000)

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
# Retry npm ci once on a 10s back-off — transient ECONNRESET / network
# aborts from the registry are common enough on GitHub Actions runners
# to take down a clean PR. --fetch-retries bumps npm's internal retry
# count too, which catches most blips before the outer fallback fires.
RUN npm ci --prefer-offline --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000 \
    || (sleep 10 && npm ci --prefer-offline --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000)

COPY . .

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

ARG VITE_MAPBOX_TOKEN
ENV VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN}

RUN npm run build

# ── Production stage ───────────────────────────────────────────────────────────
FROM nginx:alpine AS production

RUN apk add --no-cache curl

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
