// PM2 Ecosystem Configuration
// Usage:
//   pm2 start ecosystem.config.js             # start in cluster mode
//   pm2 start ecosystem.config.js --env dev   # development mode
//   pm2 stop ytgrab
//   pm2 restart ytgrab
//   pm2 logs ytgrab
//   pm2 monit

module.exports = {
  apps: [
    {
      // ── Identity ────────────────────────────────────────────
      name:        'ytgrab',
      script:      './backend/server.js',
      cwd:         __dirname,

      // ── Clustering ──────────────────────────────────────────
      instances:   'max',          // use all CPU cores
      exec_mode:   'cluster',

      // ── Environment ─────────────────────────────────────────
      env: {
        NODE_ENV:  'development',
        PORT:      3001,
      },
      env_production: {
        NODE_ENV:  'production',
        PORT:      3001,
      },

      // ── Logging ─────────────────────────────────────────────
      out_file:    './backend/logs/pm2-out.log',
      error_file:  './backend/logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs:  true,

      // ── Restart Policy ───────────────────────────────────────
      max_restarts:      10,
      min_uptime:        '10s',   // must stay up at least 10s to count as started
      restart_delay:     3000,    // 3s between restarts
      exp_backoff_restart_delay: 100,

      // ── Watch (dev only) ────────────────────────────────────
      watch:       false,          // set to true for dev hot-reload
      ignore_watch: ['node_modules', 'logs', '*.log'],

      // ── Memory limit ────────────────────────────────────────
      max_memory_restart: '512M',

      // ── Graceful shutdown ───────────────────────────────────
      kill_timeout:  5000,         // wait 5s before SIGKILL
      wait_ready:    true,
      listen_timeout: 8000,
    },
  ],
};
