# Tiflis Code Tunnel Server
# Multi-stage, multi-architecture Dockerfile for production deployment
# Supports: linux/amd64, linux/arm64
#
# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC. See LICENSE file for details.

# ============================================================================
# Stage 1: Tunnel Builder
# ============================================================================
FROM --platform=$BUILDPLATFORM node:24-alpine AS tunnel-builder

# Build arguments
ARG TARGETPLATFORM
ARG BUILDPLATFORM
ARG VERSION=0.0.0

WORKDIR /app

# Install pnpm (use specific version for reproducibility)
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy root package files for monorepo (pnpm workspace)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy tunnel package.json
COPY packages/tunnel/package.json ./packages/tunnel/

# Install all dependencies (including dev dependencies for building)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/tunnel ./packages/tunnel

# Build the application
WORKDIR /app/packages/tunnel
RUN pnpm build

# Store version for runtime
RUN echo "$VERSION" > /app/packages/tunnel/VERSION

# ============================================================================
# Stage 2: Web Client Builder
# ============================================================================
FROM --platform=$BUILDPLATFORM node:24-alpine AS web-builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy root package files for monorepo (pnpm workspace)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy web package.json
COPY packages/web/package.json ./packages/web/

# Install all dependencies (including dev dependencies for building)
RUN pnpm install --frozen-lockfile

# Copy web source code
COPY packages/web ./packages/web

# Build the web client
WORKDIR /app/packages/web
RUN pnpm build

# ============================================================================
# Stage 3: Production Runner
# ============================================================================
FROM node:24-alpine AS runner

# Labels for GitHub Container Registry
LABEL org.opencontainers.image.source="https://github.com/tiflis-io/tiflis-code"
LABEL org.opencontainers.image.description="Tiflis Code Tunnel Server - WebSocket reverse proxy for workstation connections"
LABEL org.opencontainers.image.licenses="FSL-1.1-NC"
LABEL org.opencontainers.image.vendor="Tiflis"

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 tiflis

# Copy built tunnel application from builder stage
COPY --from=tunnel-builder /app/packages/tunnel/dist ./dist
COPY --from=tunnel-builder /app/packages/tunnel/VERSION ./VERSION
COPY --from=tunnel-builder /app/packages/tunnel/package.json ./package.json

# Copy built web client from web-builder stage
COPY --from=web-builder /app/packages/web/dist ./web

# Install production dependencies only (simpler than pnpm workspace filtering)
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate && \
    pnpm install --prod --ignore-scripts

# Set ownership to non-root user
RUN chown -R tiflis:nodejs /app

# Switch to non-root user
USER tiflis

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
# Enable web client serving from bundled static files
ENV WEB_CLIENT_PATH=./web

# Expose the port
EXPOSE 3001

# Health check using Node.js instead of wget (smaller image, more reliable)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the server
CMD ["node", "dist/main.js"]
