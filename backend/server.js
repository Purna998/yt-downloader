'use strict';

// ── Load environment variables first ─────────────────────────
require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const compression  = require('compression');
const morgan       = require('morgan');
const videoRoutes  = require('./routes/video');

// ── Config ────────────────────────────────────────────────────
const PORT        = parseInt(process.env.PORT, 10) || 3001;
const IS_PROD     = process.env.NODE_ENV === 'production';
const LOG_FORMAT  = process.env.LOG_FORMAT || (IS_PROD ? 'combined' : 'dev');
const RATE_MAX    = parseInt(process.env.RATE_LIMIT_MAX, 10) || 100;
const RATE_WIN    = parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 15;

// Parse allowed CORS origins from env
const allowedOrigins = (process.env.ALLOWED_ORIGINS || `http://localhost:${PORT}`)
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// ── App ───────────────────────────────────────────────────────
const app = express();

// Trust proxy if behind Nginx / load balancer
if (IS_PROD) app.set('trust proxy', 1);

// ── Logging ───────────────────────────────────────────────────
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// In production write to rotating log file; in dev just stream to console
if (IS_PROD) {
  const accessLog = fs.createWriteStream(
    path.join(logsDir, 'access.log'),
    { flags: 'a' }
  );
  app.use(morgan(LOG_FORMAT, { stream: accessLog }));
  // Also log errors to console
  app.use(morgan('dev', {
    skip: (req, res) => res.statusCode < 400,
  }));
} else {
  app.use(morgan(LOG_FORMAT));
}

// ── Compression ───────────────────────────────────────────────
// Skip compression for streaming download responses (already piped binary)
app.use(compression({
  filter: (req, res) => {
    if (req.path.startsWith('/api/download')) return false;
    return compression.filter(req, res);
  },
  level: 6,        // balanced speed/size
  threshold: 1024, // only compress responses > 1KB
}));

// ── Security headers ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com", "blob:"],
      styleSrc:       ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdnjs.cloudflare.com"],
      fontSrc:        ["'self'", "fonts.gstatic.com", "cdnjs.cloudflare.com", "data:"],
      imgSrc:         ["'self'", "data:", "https:", "i.ytimg.com", "img.youtube.com"],
      connectSrc:     ["'self'"],
      mediaSrc:       ["'self'", "blob:"],
      objectSrc:      ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: IS_PROD ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // allow YouTube thumbnail images
  hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

// ── CORS ─────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin requests (no Origin header, e.g. curl / form posts)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: Origin '${origin}' not allowed.`));
  },
  methods:      ['GET'],
  allowedHeaders: ['Content-Type', 'Accept'],
  credentials:  false,
}));

// ── Rate limiting ─────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: RATE_WIN * 60 * 1000,
  max:      RATE_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: `Too many requests. Please try again in ${RATE_WIN} minutes.` },
  skip: (req) => req.path === '/health',
});

// ── Body parser ───────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ── Static frontend ───────────────────────────────────────────
const FRONTEND_DIR = path.join(__dirname, '../frontend');
app.use(express.static(FRONTEND_DIR, {
  etag:        true,
  lastModified: true,
  maxAge:       IS_PROD ? '7d' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      // Never cache HTML — instant deploys
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (/\.(js|css)$/.test(filePath)) {
      // JS/CSS – cache with revalidation
      res.setHeader('Cache-Control', IS_PROD ? 'public, max-age=604800' : 'no-cache');
    } else if (/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/.test(filePath)) {
      // Fonts & images – long cache
      res.setHeader('Cache-Control', IS_PROD ? 'public, max-age=2592000, immutable' : 'no-cache');
    }
  },
}));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:    'ok',
    version:   '2.0.0',
    env:       process.env.NODE_ENV || 'development',
    uptime:    Math.floor(process.uptime()),
    memory:    process.memoryUsage().rss,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api', apiLimiter, videoRoutes);

// ── SPA Fallback ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ── Global error handler ──────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  // In production never leak stack traces to the client
  const message = IS_PROD && status === 500
    ? 'An internal error occurred. Please try again.'
    : err.message || 'Internal server error.';

  console.error(`[${new Date().toISOString()}] ERROR ${status}:`, err.message);
  if (!IS_PROD) console.error(err.stack);

  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

// ── Start server (local only — Vercel uses module.exports below) ─
if (require.main === module) {
  const server = app.listen(PORT, () => {
    const env    = process.env.NODE_ENV || 'development';
    const isProd = env === 'production';

    console.log(`\n${'─'.repeat(55)}`);
    console.log(`  \uD83D\uDE80 YTGrab v2.0  |  ${isProd ? '\uD83C\uDFED PRODUCTION' : '\uD83D\uDD27 DEVELOPMENT'}`);
    console.log(`${'─'.repeat(55)}`);
    console.log(`  \uD83D\uDCE1 URL      : http://localhost:${PORT}`);
    console.log(`  \uD83D\uDCC1 Frontend : ${FRONTEND_DIR}`);
    console.log(`  \uD83D\uDD12 Security : helmet + rate-limit (${RATE_MAX} req/${RATE_WIN}min)`);
    console.log(`  \uD83D\uDDDC\uFE0F  Compress : gzip enabled (threshold 1KB)`);
    console.log(`  \uD83D\uDCCB Logging  : ${LOG_FORMAT}`);
    console.log(`  \uD83C\uDF10 CORS     : ${allowedOrigins.join(', ')}`);
    console.log(`${'─'.repeat(55)}\n`);

    // Signal PM2 that the app is ready (wait_ready: true)
    if (process.send) process.send('ready');
  });

  // ── Graceful Shutdown ───────────────────────────────────────
  let shuttingDown = false;

  function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[${signal}] Graceful shutdown initiated…`);

    server.close(err => {
      if (err) {
        console.error('[shutdown] Server close error:', err.message);
        process.exit(1);
      }
      console.log('[shutdown] Server closed. Goodbye. \uD83D\uDC4B');
      process.exit(0);
    });

    // Force shutdown after 10s if connections are hanging
    setTimeout(() => {
      console.error('[shutdown] Forced exit after 10s timeout.');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

  // Catch unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });

  process.on('uncaughtException', err => {
    console.error('[uncaughtException]', err.message);
    console.error(err.stack);
    gracefulShutdown('uncaughtException');
  });
}

// ── Export for Vercel / serverless environments ───────────────
// Vercel calls this as a request handler instead of app.listen()
module.exports = app;
