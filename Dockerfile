# ────────────────────────────────────────────────────────────────
# YTGrab – Production Dockerfile
# Build:  docker build -t ytgrab .
# Run:    docker run -p 3001:3001 --env-file backend/.env ytgrab
# ────────────────────────────────────────────────────────────────

# Stage 1: base image with Node + Python + yt-dlp + ffmpeg
FROM node:22-slim AS base

# Install Python, pip, ffmpeg, and yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip ffmpeg curl ca-certificates \
    && pip3 install --no-cache-dir yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# ── Stage 2: install dependencies ───────────────────────────────
FROM base AS deps
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm ci --only=production

# ── Stage 3: production image ───────────────────────────────────
FROM base AS production

WORKDIR /app

# Copy production node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules

# Copy application source
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Create logs directory
RUN mkdir -p backend/logs

# Non-root user for security
RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs
RUN chown -R nodejs:nodejs /app
USER nodejs

# Environment
ENV NODE_ENV=production
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Start
CMD ["node", "backend/server.js"]
