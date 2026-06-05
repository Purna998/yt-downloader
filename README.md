# 🎬 YTGrab – YouTube Video Downloader

A **production-ready**, full-stack YouTube video downloader.  
Download videos in 4K, 1080p, 720p, 480p, 360p, 240p, 144p — or extract MP3 audio at 128 / 192 / 320 kbps.

[![Node.js](https://img.shields.io/badge/Node.js-≥18-339933?logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express)](https://expressjs.com)
[![yt-dlp](https://img.shields.io/badge/yt--dlp-latest-FF0000)](https://github.com/yt-dlp/yt-dlp)

---

## ✨ Features

| Feature | Details |
|---------|---------|
| 🎬 **Video quality** | 144p → 4K Ultra HD |
| 🎵 **Audio extraction** | MP3 at 128 / 192 / 320 kbps |
| ⚡ **Streaming** | Files piped directly — no temp storage |
| 🔒 **Security** | `helmet` (12+ headers) + rate limiting |
| 🗜️ **Compression** | gzip via `compression` middleware |
| 📋 **Logging** | `morgan` — file in prod, console in dev |
| 🌙 **Dark / Light mode** | Persisted in localStorage |
| 📜 **Download history** | Last 15 downloads, click to reload |
| 📋 **Clipboard paste** | Auto-detects YouTube URLs |
| 🐳 **Docker ready** | Multi-stage Dockerfile included |
| 🔄 **PM2 cluster** | `ecosystem.config.js` for zero-downtime |

---

## 📁 Project Structure

```
yt-downloader/
├── backend/
│   ├── server.js           # Express entry point (port 3001)
│   ├── package.json
│   ├── .env.example        # Environment variable template
│   ├── .env                # Your local config (not committed)
│   ├── logs/               # HTTP access logs (production)
│   └── routes/
│       └── video.js        # /api/info + /api/download + /api/health
├── frontend/
│   ├── index.html
│   ├── manifest.json       # PWA manifest
│   ├── favicon.svg
│   ├── css/style.css
│   └── js/app.js
├── ecosystem.config.js     # PM2 cluster config
├── Dockerfile              # Docker multi-stage build
├── .dockerignore
└── .gitignore
```

---

## 🚀 Quick Start (Local)

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | ≥ 18 | https://nodejs.org |
| **yt-dlp** | latest | `pip install yt-dlp` |
| **ffmpeg** | any | https://ffmpeg.org *(required for 1080p+ and MP3)* |

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if needed (default PORT=3001 works out of the box)
```

### 3. Start the server

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

### 4. Open in browser

```
http://localhost:3001
```

---

## 🏭 Production Deployment

### Option A — PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start in cluster mode (uses all CPU cores)
pm2 start ecosystem.config.js --env production

# Save PM2 process list + auto-start on reboot
pm2 save
pm2 startup

# Monitor
pm2 monit
pm2 logs ytgrab
```

### Option B — Docker

```bash
# Build
docker build -t ytgrab .

# Run (pass your production .env)
docker run -d \
  --name ytgrab \
  -p 3001:3001 \
  --env-file backend/.env \
  --restart unless-stopped \
  ytgrab

# Logs
docker logs -f ytgrab
```

### Option C — Systemd Service (Linux)

Create `/etc/systemd/system/ytgrab.service`:

```ini
[Unit]
Description=YTGrab YouTube Downloader
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/yt-downloader/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production PORT=3001
EnvironmentFile=/var/www/yt-downloader/backend/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now ytgrab
sudo systemctl status ytgrab
```

### Nginx Reverse Proxy (with SSL)

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Increase timeout for large downloads
    proxy_read_timeout    600s;
    proxy_send_timeout    600s;
    proxy_connect_timeout 60s;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Buffer streaming downloads properly
        proxy_buffering    off;
        proxy_request_buffering off;
    }
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}
```

---

## 🔧 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server health check |
| `GET` | `/api/info?url=<yt-url>` | Fetch video metadata + format list |
| `GET` | `/api/download?url=&format=&ext=&title=&audioBitrate=` | Stream download |

### `/api/info` Response

```json
{
  "title": "Rick Astley - Never Gonna Give You Up",
  "thumbnail": "https://i.ytimg.com/vi/...",
  "duration": "3:33",
  "channel": "Rick Astley",
  "viewCount": "1,779,323,171",
  "uploadDate": "2009-10-25",
  "formats": [
    { "label": "4K Ultra HD", "ext": "mp4", "filesize": "342.0 MB", "badge": "HD", "fps": "25fps" },
    { "label": "MP3 Audio – 320kbps", "ext": "mp3", "badge": "BEST" }
  ]
}
```

### `/api/download` Parameters

| Param | Required | Example |
|-------|----------|---------|
| `url` | ✅ | `https://youtube.com/watch?v=...` |
| `format` | ✅ | `248+bestaudio` |
| `ext` | ✅ | `mp4` or `mp3` |
| `title` | ❌ | `My Video` (used as filename) |
| `audioBitrate` | ❌ | `320` (128/192/320, for MP3 only) |

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server listen port |
| `NODE_ENV` | `development` | `development` or `production` |
| `ALLOWED_ORIGINS` | `http://localhost:3001` | Comma-separated CORS origins |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |
| `RATE_LIMIT_WINDOW_MINUTES` | `15` | Rate limit window (minutes) |
| `LOG_FORMAT` | `dev` | Morgan format (`dev`, `combined`, `tiny`) |

---

## 🔄 Keeping yt-dlp Updated

YouTube changes frequently. Update yt-dlp regularly:

```bash
# pip
pip install -U yt-dlp

# winget (Windows)
winget upgrade yt-dlp.yt-dlp

# direct (Linux/macOS)
yt-dlp -U
```

---

## 📜 License

For **personal / educational use only**.  
Respect YouTube's [Terms of Service](https://www.youtube.com/t/terms) and applicable copyright law.  
This project is not affiliated with YouTube or Google LLC.
