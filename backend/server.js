'use strict';

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const videoRoutes = require('./routes/video');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security headers ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
      styleSrc:    ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdnjs.cloudflare.com"],
      fontSrc:     ["'self'", "fonts.gstatic.com", "cdnjs.cloudflare.com", "data:"],
      imgSrc:      ["'self'", "data:", "https:", "i.ytimg.com", "img.youtube.com"],
      connectSrc:  ["'self'"],
      mediaSrc:    ["'self'"],
      objectSrc:   ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // allow thumbnail images from YouTube
}));

// ── CORS ─────────────────────────────────────────────────────
app.use(cors({
  origin: [`http://localhost:${PORT}`, 'http://127.0.0.1:3001'],
  methods: ['GET'],
  allowedHeaders: ['Content-Type'],
}));

// ── Rate limiting ─────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
  skip: (req) => req.path === '/health', // health check bypass
});

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());

// ── Serve static frontend ─────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend'), {
  etag:         true,
  lastModified: true,
  maxAge:       '1d',
  setHeaders(res, filePath) {
    // Don't cache HTML so updates are instant
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api', apiLimiter, videoRoutes);

// ── Fallback: serve SPA ───────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Global Error]', err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 YTGrab v2.0 running at \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`📁 Serving frontend: ${path.join(__dirname, '../frontend')}`);
  console.log(`🔒 Security: helmet + rate-limit (100 req/15min) active`);
  console.log(`\nPress \x1b[33mCtrl+C\x1b[0m to stop.\n`);
});
