# 🎬 YTGrab – YouTube Video Downloader

A premium, full-stack YouTube video downloader with a beautiful dark-mode UI.
Download videos in 1080p, 720p, 480p, 360p, or extract MP3 audio.

## Project Structure

```
yt-downloader/
├── backend/
│   ├── server.js          # Express entry point (port 3001)
│   ├── package.json
│   └── routes/
│       └── video.js       # /api/info and /api/download endpoints
└── frontend/
    ├── index.html
    ├── css/
    │   └── style.css      # Premium dark theme
    └── js/
        └── app.js         # All UI logic
```

## Prerequisites

| Tool | Install |
|---|---|
| **Node.js** ≥ 18 | https://nodejs.org |
| **yt-dlp** | `pip install yt-dlp` or `winget install yt-dlp.yt-dlp` |
| **ffmpeg** | https://ffmpeg.org/download.html (add to PATH) |

> ⚠️ `ffmpeg` is required for merging video+audio streams (1080p/720p) and MP3 extraction.

## Quick Start

```bash
# 1. Install backend dependencies
cd backend
npm install

# 2. Start the server
npm start
# → Server running at http://localhost:3001

# 3. Open your browser
# → http://localhost:3001
```

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/info?url=<yt-url>` | Returns video metadata + format list |
| `GET` | `/api/download?url=<yt-url>&format=<id>&ext=<mp4\|mp3>&title=<name>` | Streams file to client |

## Updating yt-dlp

YouTube changes frequently. Keep yt-dlp updated:
```bash
pip install -U yt-dlp
# or
yt-dlp -U
```

## Features

- ✅ Paste YouTube URL → instant metadata fetch
- ✅ All available qualities (240p → 4K)
- ✅ MP3 audio extraction
- ✅ Streaming download (no temp files on server)
- ✅ YouTube Shorts support
- ✅ Dark premium UI with animated backgrounds
- ✅ Mobile responsive
- ✅ FAQ section, how-it-works guide
- ✅ No login required

## License

For personal/educational use only. Respect YouTube's Terms of Service and copyright law.
