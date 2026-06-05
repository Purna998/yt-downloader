# ────────────────────────────────────────────────────────────────
# YTGrab – Production Dockerfile
# Build:  docker build -t ytgrab .
# Run:    docker run -p 3001:3001 --env-file backend/.env ytgrab
# ────────────────────────────────────────────────────────────────

# ── Stage 1: base image with Node + ffmpeg + yt-dlp binary ──────
FROM node:22-slim AS base

# Install ffmpeg + curl only (no python3-pip / system Python needed).
# yt-dlp_linux / yt-dlp_linux_aarch64 are fully standalone binaries
# that bundle their own Python — no shebang dependency on system python3.
# NOTE: the bare "yt-dlp" release is a Python zipapp; always use yt-dlp_linux.
RUN ARCH="$(uname -m)" \
    && if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
         YTDLP_BIN="yt-dlp_linux_aarch64"; \
       elif [ "$ARCH" = "armv7l" ]; then \
         YTDLP_BIN="yt-dlp_linux_armv7l"; \
       else \
         YTDLP_BIN="yt-dlp_linux"; \
       fi \
    && apt-get update && apt-get install -y --no-install-recommends \
         ffmpeg curl ca-certificates \
    && curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_BIN}" \
       -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && yt-dlp --version \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Stage 2: install Node dependencies ──────────────────────────
FROM base AS deps
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm ci --only=production

# ── Stage 3: production image ────────────────────────────────────
FROM base AS production

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/backend/node_modules ./backend/node_modules

# Copy application source
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Create logs directory
RUN mkdir -p backend/logs

# Non-root user for security
RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs \
    && chown -R nodejs:nodejs /app
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
