# Tiflis Code Tunnel Server
# Multi-stage, multi-architecture Dockerfile for production deployment
# Supports: linux/amd64, linux/arm64
#
# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the MIT License. See LICENSE file for details.

# ============================================================================
# Stage 1: Builder
# ============================================================================
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

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
# Stage 2: Production Dependencies
# ============================================================================
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy root package files for monorepo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy tunnel package.json
COPY packages/tunnel/package.json ./packages/tunnel/

# Install production dependencies only
# This stage is separate to optimize caching
RUN pnpm install --frozen-lockfile --prod --filter @tiflis/tiflis-code-tunnel

# ============================================================================
# Stage 3: Production Runner
# ============================================================================
FROM node:22-alpine AS runner

# Labels for GitHub Container Registry
LABEL org.opencontainers.image.source="https://github.com/tiflis-io/tiflis-code"
LABEL org.opencontainers.image.description="Tiflis Code Tunnel Server - WebSocket reverse proxy for workstation connections"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="Tiflis"

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 tiflis

# Copy production dependencies from deps stage
# In pnpm workspace, all dependencies are in root node_modules
COPY --from=deps /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder /app/packages/tunnel/dist ./dist
COPY --from=builder /app/packages/tunnel/VERSION ./VERSION

# Copy package.json for runtime (needed for module resolution)
COPY --from=builder /app/packages/tunnel/package.json ./package.json

# Set ownership to non-root user
RUN chown -R tiflis:nodejs /app

# Switch to non-root user
USER tiflis

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# Expose the port
EXPOSE 3001

# Health check using Node.js instead of wget (smaller image, more reliable)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the server
CMD ["node", "dist/main.js"]
