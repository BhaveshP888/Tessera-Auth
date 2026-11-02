# ===================================================
# Stage 1: Builder
# ===================================================
FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

# Copy root configs and all workspace sources
COPY package.json turbo.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY server/ ./server/
COPY apps/ ./apps/
COPY extensions/ ./extensions/

# Install dependencies and build all packages
RUN bun install
RUN bun run build

# ===================================================
# Stage 2: Production Runner
# ===================================================
FROM oven/bun:1.2-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    WEB_DIST_PATH=/app/web-dist

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root system user and data directory
RUN addgroup -S tessera && adduser -S tessera -G tessera && \
    mkdir -p /app/data /app/web-dist && \
    chown -R tessera:tessera /app

# Copy complete built workspace and static web distribution from builder
COPY --from=builder --chown=tessera:tessera /app ./
COPY --from=builder --chown=tessera:tessera /app/apps/web/dist ./web-dist

USER tessera

EXPOSE 8787

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8787/api/health || exit 1

CMD ["bun", "server/src/index.ts"]
