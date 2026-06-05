'use strict';

const express       = require('express');
const router        = express.Router();
const { execFile, spawn, execFileSync } = require('child_process');
const fs            = require('fs');
const path          = require('path');

// ─────────────────────────────────────────────────────────────
// Resolve yt-dlp executable path
// ─────────────────────────────────────────────────────────────
function resolveYtDlp() {
  // 1. Check if it's directly on PATH
  try {
    execFileSync('yt-dlp', ['--version'], { stdio: 'pipe' });
    return 'yt-dlp';
  } catch {}

  // 2. Common Windows user install locations
  const candidates = [
    `C:\\Users\\${process.env.USERNAME}\\AppData\\Roaming\\Python\\Python312\\Scripts\\yt-dlp.exe`,
    `C:\\Users\\${process.env.USERNAME}\\AppData\\Roaming\\Python\\Python311\\Scripts\\yt-dlp.exe`,
    `C:\\Users\\${process.env.USERNAME}\\AppData\\Roaming\\Python\\Python310\\Scripts\\yt-dlp.exe`,
    `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Programs\\Python\\Python312\\Scripts\\yt-dlp.exe`,
    `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Programs\\Python\\Python311\\Scripts\\yt-dlp.exe`,
    // Anaconda / Miniconda
    'C:\\ProgramData\\anaconda3\\Scripts\\yt-dlp.exe',
    `C:\\Users\\${process.env.USERNAME}\\Anaconda3\\Scripts\\yt-dlp.exe`,
    `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\anaconda3\\Scripts\\yt-dlp.exe`,
    `C:\\Users\\${process.env.USERNAME}\\miniconda3\\Scripts\\yt-dlp.exe`,
    // Known path for this machine
    'C:\\Users\\core3\\AppData\\Roaming\\Python\\Python312\\Scripts\\yt-dlp.exe',
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.log(`[yt-dlp] ✅ Found at: ${c}`);
      return c;
    }
  }

  console.warn('[yt-dlp] ⚠️  Not found as executable, falling back to: python -m yt_dlp');
  return null;
}

const YT_DLP_PATH = resolveYtDlp();

/** Spawn yt-dlp (or python -m yt_dlp) process */
function spawnYtDlp(args) {
  if (YT_DLP_PATH) return spawn(YT_DLP_PATH, args);
  return spawn('python', ['-m', 'yt_dlp', ...args]);
}

/** Run yt-dlp and return stdout as a promise */
function execYtDlp(args) {
  return new Promise((resolve, reject) => {
    const cmd  = YT_DLP_PATH || 'python';
    const argv = YT_DLP_PATH ? args : ['-m', 'yt_dlp', ...args];
    execFile(cmd, argv, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout.trim());
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Convert bytes → human-readable string */
function fmtBytes(bytes) {
  if (!bytes || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

/** Convert total seconds → "m:ss" or "h:mm:ss" */
function fmtDuration(secs) {
  if (!secs) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** Classify error messages into user-friendly strings */
function classifyError(msg) {
  const m = msg.toLowerCase();
  if (m.includes('sign in') || m.includes('age') || m.includes('login'))
    return 'This video is age-restricted or requires sign-in and cannot be downloaded.';
  if (m.includes('private') || m.includes('members only'))
    return 'This video is private or members-only. Only public videos can be downloaded.';
  if (m.includes('not available') || m.includes('removed') || m.includes('deleted') || m.includes('does not exist'))
    return 'Video not found – it may have been removed or is unavailable in your region.';
  if (m.includes('copyright') || m.includes('blocked'))
    return 'This video is blocked due to copyright restrictions.';
  if (m.includes('network') || m.includes('connection') || m.includes('timeout'))
    return 'Network error – please check your connection and try again.';
  if (m.includes('geo') || m.includes('country') || m.includes('region'))
    return 'This video is not available in your region.';
  if (m.includes('no such format') || m.includes('requested format'))
    return 'The selected format is not available for this video.';
  return 'Could not process this video. Please check the URL and try again.';
}

/** Build clean format list from yt-dlp format array */
function buildFormats(fmts) {
  const results = [];
  const seen    = new Set();

  const videoQualities = [
    { label: '4K Ultra HD',  height: 2160 },
    { label: '1440p QHD',    height: 1440 },
    { label: '1080p Full HD',height: 1080 },
    { label: '720p HD',      height: 720  },
    { label: '480p SD',      height: 480  },
    { label: '360p',         height: 360  },
    { label: '240p',         height: 240  },
    { label: '144p',         height: 144  },
  ];

  for (const q of videoQualities) {
    // Prefer combined mp4 (video+audio in one stream)
    let match = fmts
      .filter(f =>
        f.height === q.height &&
        f.ext === 'mp4' &&
        f.vcodec && f.vcodec !== 'none' &&
        f.acodec && f.acodec !== 'none'
      )
      .sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0];

    // If no combined, accept video-only and merge later via ffmpeg
    if (!match) {
      match = fmts
        .filter(f => f.height === q.height && (f.ext === 'mp4' || f.ext === 'webm') && f.vcodec && f.vcodec !== 'none')
        .sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0];
    }

    if (match && !seen.has(q.label)) {
      seen.add(q.label);
      const needsMerge = !match.acodec || match.acodec === 'none';
      const filesizeRaw = match.filesize || match.filesize_approx || null;
      results.push({
        formatId: needsMerge
          ? `${match.format_id}+bestaudio[ext=m4a]/bestaudio`
          : match.format_id,
        label:    q.label,
        ext:      'mp4',
        type:     'video',
        filesize: fmtBytes(filesizeRaw),   // ← fixed: was "filesizeHuman" mismatch
        badge:    q.height >= 1080 ? 'HD' : (q.height >= 720 ? 'HD' : null),
        fps:      match.fps ? `${Math.round(match.fps)}fps` : null,
        vcodec:   match.vcodec ? match.vcodec.split('.')[0] : null,
      });
    }
  }

  // MP3 audio option with quality variants
  ['320', '192', '128'].forEach((kbps, i) => {
    results.push({
      formatId: 'bestaudio/best',
      label:    `MP3 Audio – ${kbps}kbps`,
      ext:      'mp3',
      type:     'audio',
      filesize: null,
      badge:    i === 0 ? 'BEST' : null,
      audioBitrate: kbps,
    });
  });

  return results;
}

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/info?url=...
 * Returns video metadata + clean format list
 */
router.get('/info', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing ?url= parameter.' });

  const ytPattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch|shorts|embed|live)|youtu\.be\/)/i;
  if (!ytPattern.test(url)) {
    return res.status(400).json({ error: 'Please enter a valid YouTube URL (youtube.com or youtu.be).' });
  }

    // Sanitize URL to prevent playlist/mix bot-triggers
    let cleanUrl = url;
    try {
      const parsed = new URL(url);
      if (parsed.searchParams.has('v')) {
        cleanUrl = `${parsed.origin}${parsed.pathname}?v=${parsed.searchParams.get('v')}`;
      } else {
        cleanUrl = `${parsed.origin}${parsed.pathname}`;
      }
    } catch (e) { /* ignore parse errors */ }

    const raw  = await execYtDlp([
      '--dump-json', 
      '--no-playlist', 
      '--no-warnings', 
      '--force-ipv4',
      cleanUrl
    ]);
    const data = JSON.parse(raw);

    res.json({
      title:        data.title        || 'Unknown Title',
      thumbnail:    data.thumbnail    || null,
      duration:     fmtDuration(data.duration),
      durationSecs: data.duration     || 0,
      channel:      data.channel      || data.uploader || 'Unknown',
      channelUrl:   data.channel_url  || data.uploader_url || null,
      viewCount:    data.view_count   ? Number(data.view_count).toLocaleString() : null,
      likeCount:    data.like_count   ? Number(data.like_count).toLocaleString() : null,
      uploadDate:   data.upload_date
        ? `${data.upload_date.slice(0, 4)}-${data.upload_date.slice(4, 6)}-${data.upload_date.slice(6, 8)}`
        : null,
      description:  data.description  ? data.description.slice(0, 200) : null,
      formats:      buildFormats(data.formats || []),
    });
  } catch (err) {
    console.error('[/api/info error]', err.message);
    res.status(500).json({ error: classifyError(err.message) });
  }
});

/**
 * GET /api/download?url=...&format=...&ext=...&title=...&audioBitrate=320
 * Streams the file directly to the client via yt-dlp pipe
 */
router.get('/download', (req, res) => {
  const { url, format, ext, title, audioBitrate = '192' } = req.query;
  if (!url || !format) return res.status(400).json({ error: 'Missing url or format.' });

  const safeTitle = (title || 'video')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')  // strip illegal filename chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'video';

  const filename = `${safeTitle}.${ext || 'mp4'}`;
  const isAudio  = ext === 'mp3';

  // Sanitize URL to prevent playlist/mix bot-triggers
  let cleanUrl = url;
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('v')) {
      cleanUrl = `${parsed.origin}${parsed.pathname}?v=${parsed.searchParams.get('v')}`;
    } else {
      cleanUrl = `${parsed.origin}${parsed.pathname}`;
    }
  } catch (e) { /* ignore parse errors */ }

  // Set response headers
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  const args = [
    '--no-playlist', 
    '--no-warnings', 
    '--force-ipv4',
    '-f', format
  ];

  if (isAudio) {
    const quality = ['128', '192', '256', '320'].includes(audioBitrate) ? audioBitrate : '192';
    args.push(
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', `${quality}k`,
      '-o', '-',
      cleanUrl,
    );
  } else {
    args.push('--merge-output-format', 'mp4', '-o', '-', cleanUrl);
  }

  console.log(`[download] ${isAudio ? '🎵' : '🎬'} ${safeTitle}.${ext} (${format})`);
  const proc = spawnYtDlp(args);

  proc.stdout.pipe(res);

  proc.stderr.on('data', d => {
    const line = d.toString().trim();
    if (line) process.stdout.write(`  ${line}\n`);
  });

  proc.on('error', err => {
    console.error('[spawn error]', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed. Is yt-dlp installed and up to date?' });
  });

  proc.on('close', code => {
    if (code !== 0) console.warn(`[yt-dlp] ⚠️  Exit code ${code} for: ${safeTitle}`);
    if (!res.writableEnded) res.end();
  });

  // Kill yt-dlp process if client disconnects
  req.on('close', () => {
    if (!proc.killed) proc.kill('SIGTERM');
  });
});

module.exports = router;
