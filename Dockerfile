# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY frontend ./frontend
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Native build tools needed for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend ./frontend

# Litestream binary (Phase 6 — harmless if not configured)
ARG LITESTREAM_VERSION=v0.3.13
RUN wget -qO /tmp/litestream.tar.gz \
      https://github.com/benbjohnson/litestream/releases/download/${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-amd64.tar.gz \
    && tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz \
    && rm /tmp/litestream.tar.gz

COPY litestream.yml /etc/litestream.yml
COPY start.sh /start.sh
RUN chmod +x /start.sh

VOLUME ["/data"]
EXPOSE 3000
ENV NODE_ENV=production

CMD ["/start.sh"]
