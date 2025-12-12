# Dockerfile for tiflis-code-workstation
# Multi-architecture build supporting linux/amd64 and linux/arm64

# ─────────────────────────────────────────────────────────────
# Build Stage
# ─────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

# Build arguments for multi-arch
ARG TARGETPLATFORM
ARG BUILDPLATFORM

WORKDIR /app

# Install build dependencies for node-pty
RUN apk add --no-cache python3 make g++ 

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build the application
RUN pnpm build

# ─────────────────────────────────────────────────────────────
# Production Stage
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Labels for GitHub Container Registry
LABEL org.opencontainers.image.source="https://github.com/tiflis-io/tiflis-code"
LABEL org.opencontainers.image.description="Tiflis Code Workstation Server"
LABEL org.opencontainers.image.licenses="FSL-1.1-NC"

WORKDIR /app

# Install runtime dependencies for node-pty
RUN apk add --no-cache python3 make g++

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 tiflis

# Create data directory
RUN mkdir -p /data && chown tiflis:nodejs /data

# Copy built artifacts
COPY --from=builder --chown=tiflis:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=tiflis:nodejs /app/dist ./dist
COPY --chown=tiflis:nodejs package.json ./

USER tiflis

# Environment defaults
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3002
ENV HOST=0.0.0.0

# Expose ports
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3002/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the server
CMD ["node", "dist/main.js"]

