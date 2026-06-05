/**
 * YTGrab v2.0 – Frontend Application Logic
 * Features: theme toggle, clipboard auto-paste, download history,
 *           shimmer skeleton, reveal animations, scroll-to-top FAB,
 *           copy-URL button, improved download overlay with progress bar.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const API_BASE      = window.location.origin;
const HISTORY_KEY   = 'ytgrab_history_v2';
const THEME_KEY     = 'ytgrab_theme';
const MAX_HISTORY   = 15;

// ─────────────────────────────────────────────────────────────
// DOM refs
// ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const searchForm        = $('searchForm');
const videoUrlInput     = $('videoUrl');
const clearBtn          = $('clearBtn');
const pasteBtn          = $('pasteBtn');
const fetchBtn          = $('fetchBtn');
const btnText           = fetchBtn.querySelector('.btn-text');
const btnLoading        = fetchBtn.querySelector('.btn-loading');

const errorBanner       = $('errorBanner');
const errorMsg          = $('errorMsg');
const retryBtn          = $('retryBtn');
const skeletonCard      = $('skeletonCard');
const resultCard        = $('resultCard');

const videoThumb        = $('videoThumb');
const videoDuration     = $('videoDuration');
const videoTitle        = $('videoTitle');
const channelName       = $('channelName');
const viewCount         = $('viewCount');
const uploadDate        = $('uploadDate');
const formatsGrid       = $('formatsGrid');
const copyLinkBtn       = $('copyLinkBtn');

const toast             = $('toast');
const toastMsg          = $('toastMsg');
const toastIcon         = $('toastIcon');

const downloadOverlay   = $('downloadOverlay');
const downloadOverlayTitle = $('downloadOverlayTitle');
const downloadOverlaySub   = $('downloadOverlaySub');
const cancelDownloadBtn = $('cancelDownloadBtn');

const navToggler        = $('navToggler');
const navLinks          = $('navLinks');
const faqList           = $('faqList');

const themeToggle       = $('themeToggle');
const themeIcon         = $('themeIcon');

const historyBtn        = $('historyBtn');
const historyBadge      = $('historyBadge');
const historyPanel      = $('historyPanel');
const historyBackdrop   = $('historyBackdrop');
const historyClose      = $('historyClose');
const historyBody       = $('historyBody');
const clearHistoryBtn   = $('clearHistoryBtn');

const scrollTopBtn      = $('scrollTopBtn');
const clipboardHint     = $('clipboardHint');
const clipboardPasteBtn = $('clipboardPasteBtn');
const footerYear        = $('footerYear');

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────
let currentVideoData  = null;
let lastUrl           = '';
let toastTimer        = null;
let downloadIframe    = null;

// ─────────────────────────────────────────────────────────────
// Initialise
// ─────────────────────────────────────────────────────────────
function init() {
  // Footer year
  if (footerYear) footerYear.textContent = new Date().getFullYear();

  // Theme
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

  // History badge
  refreshHistoryBadge();

  // Feature card reveal observer
  setupRevealObserver();

  // Keyboard shortcut: Ctrl+V → focus input
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'v' && document.activeElement !== videoUrlInput) {
      videoUrlInput.focus();
    }
  });
}

init();

// ─────────────────────────────────────────────────────────────
// Theme toggle
// ─────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  if (themeIcon) {
    themeIcon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  }
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
  showToast(current === 'dark' ? '☀️ Light mode on' : '🌙 Dark mode on', 'info');
});

// ─────────────────────────────────────────────────────────────
// Nav – mobile toggler
// ─────────────────────────────────────────────────────────────
navToggler.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  navToggler.classList.toggle('open', open);
  navToggler.setAttribute('aria-expanded', open);
});

navLinks.querySelectorAll('.nav__link').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggler.classList.remove('open');
    navToggler.setAttribute('aria-expanded', 'false');
  });
});

// ─────────────────────────────────────────────────────────────
// Input – clear + clipboard
// ─────────────────────────────────────────────────────────────
videoUrlInput.addEventListener('input', () => {
  const hasVal = videoUrlInput.value.length > 0;
  clearBtn.style.display = hasVal ? 'flex' : 'none';
  if (hasVal) clipboardHint.style.display = 'none';
});

clearBtn.addEventListener('click', () => {
  videoUrlInput.value = '';
  clearBtn.style.display = 'none';
  videoUrlInput.focus();
  hideResult();
  hideError();
  clipboardHint.style.display = 'none';
});

// Paste button
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      videoUrlInput.value = text.trim();
      clearBtn.style.display = 'flex';
      clipboardHint.style.display = 'none';
      videoUrlInput.focus();
    }
  } catch {
    showToast('Clipboard access denied – paste manually (Ctrl+V)', 'warn');
  }
});

// Clipboard hint on focus
videoUrlInput.addEventListener('focus', async () => {
  if (videoUrlInput.value) return;
  try {
    const text = await navigator.clipboard.readText();
    const isYt = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(text.trim());
    if (isYt && text.trim()) {
      clipboardHint.style.display = 'flex';
      clipboardPasteBtn.onclick = () => {
        videoUrlInput.value = text.trim();
        clearBtn.style.display = 'flex';
        clipboardHint.style.display = 'none';
        videoUrlInput.focus();
      };
    }
  } catch {
    // clipboard permission not granted — silent
  }
});

// ─────────────────────────────────────────────────────────────
// FAQ Accordion
// ─────────────────────────────────────────────────────────────
faqList.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    const answer   = document.getElementById(btn.getAttribute('aria-controls'));

    // Close all
    faqList.querySelectorAll('.faq-question').forEach(b => {
      b.setAttribute('aria-expanded', 'false');
      const a = document.getElementById(b.getAttribute('aria-controls'));
      if (a) a.classList.remove('open');
    });

    // Toggle clicked
    if (!expanded) {
      btn.setAttribute('aria-expanded', 'true');
      if (answer) answer.classList.add('open');
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Form submit – fetch video info
// ─────────────────────────────────────────────────────────────
searchForm.addEventListener('submit', async e => {
  e.preventDefault();
  const url = videoUrlInput.value.trim();
  if (!url) {
    showError('Please enter a YouTube URL first.');
    return;
  }
  await fetchVideoInfo(url);
});

// Retry button
retryBtn.addEventListener('click', () => {
  if (lastUrl) fetchVideoInfo(lastUrl);
});

async function fetchVideoInfo(url) {
  lastUrl = url;
  setLoading(true);
  hideError();
  hideResult();
  showSkeleton();
  clipboardHint.style.display = 'none';

  try {
    const res  = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    if (!res.ok || data.error) {
      showError(data.error || 'Failed to fetch video information.');
      return;
    }

    currentVideoData = { ...data, originalUrl: url };
    renderResult(data);
    showResult();

    // Save to history
    saveToHistory({
      title:     data.title,
      thumbnail: data.thumbnail,
      channel:   data.channel,
      duration:  data.duration,
      url,
      date:      new Date().toISOString(),
    });

    // Smooth scroll to result
    setTimeout(() => {
      resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 120);

  } catch (err) {
    console.error('[fetchVideoInfo]', err);
    showError('Network error – is the server running on port 3001?');
    retryBtn.style.display = 'inline-flex';
  } finally {
    setLoading(false);
    hideSkeleton();
  }
}

// ─────────────────────────────────────────────────────────────
// Render result card
// ─────────────────────────────────────────────────────────────
function renderResult(data) {
  // Thumbnail
  videoThumb.src = data.thumbnail || '';
  videoThumb.alt = data.title || 'Video thumbnail';
  videoDuration.textContent = data.duration || '';
  videoTitle.textContent    = data.title     || 'Unknown Title';
  channelName.textContent   = data.channel   || 'Unknown';
  viewCount.textContent     = data.viewCount ? `${data.viewCount} views` : 'N/A';
  uploadDate.textContent    = data.uploadDate || 'N/A';

  // Formats
  formatsGrid.innerHTML = '';

  if (!data.formats || data.formats.length === 0) {
    formatsGrid.innerHTML = '<p style="color:var(--c-text-muted);font-size:.85rem;">No downloadable formats found.</p>';
    return;
  }

  data.formats.forEach((fmt, idx) => {
    const isAudio = fmt.type === 'audio';
    const row     = document.createElement('div');
    row.className = 'format-row';
    row.setAttribute('role', 'listitem');
    row.style.animationDelay = `${idx * 45}ms`;

    // Badge
    let badgeHtml = '';
    if (fmt.badge === 'HD') {
      badgeHtml = `<span class="format-badge format-badge--hd">HD</span>`;
    } else if (fmt.badge === 'BEST') {
      badgeHtml = `<span class="format-badge format-badge--best">Best</span>`;
    } else if (fmt.badge === 'AUDIO' || isAudio) {
      badgeHtml = `<span class="format-badge format-badge--audio">Audio</span>`;
    }

    // Meta string
    const metaParts = [];
    if (fmt.filesize)  metaParts.push(fmt.filesize);
    if (fmt.fps)       metaParts.push(fmt.fps);
    if (fmt.vcodec && !isAudio) metaParts.push(fmt.vcodec.toUpperCase());
    if (fmt.ext)       metaParts.push(fmt.ext.toUpperCase());
    const metaStr = metaParts.join(' · ');

    row.innerHTML = `
      <div class="format-row__left">
        <div class="format-icon format-icon--${isAudio ? 'audio' : 'video'}" aria-hidden="true">
          <i class="fa-solid fa-${isAudio ? 'music' : 'film'}"></i>
        </div>
        <div class="format-details">
          <div class="format-label">${escHtml(fmt.label)}</div>
          <div class="format-meta">${escHtml(metaStr)}</div>
        </div>
      </div>
      <div class="format-row__right">
        ${badgeHtml}
        <button
          class="btn-dl ${isAudio ? 'audio' : ''}"
          data-format-id="${escHtml(fmt.formatId)}"
          data-ext="${escHtml(fmt.ext)}"
          data-label="${escHtml(fmt.label)}"
          data-audio-bitrate="${escHtml(fmt.audioBitrate || '192')}"
          aria-label="Download ${escHtml(fmt.label)}"
          type="button"
        >
          <i class="fa-solid fa-download" aria-hidden="true"></i>
          Download
        </button>
      </div>
    `;

    formatsGrid.appendChild(row);
  });

  // Attach download click handlers
  formatsGrid.querySelectorAll('.btn-dl').forEach(btn => {
    btn.addEventListener('click', handleDownload);
  });
}

// ─────────────────────────────────────────────────────────────
// Copy link button
// ─────────────────────────────────────────────────────────────
copyLinkBtn.addEventListener('click', async () => {
  const url = currentVideoData?.originalUrl;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    copyLinkBtn.classList.add('copied');
    copyLinkBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    showToast('Video URL copied to clipboard!');
    setTimeout(() => {
      copyLinkBtn.classList.remove('copied');
      copyLinkBtn.innerHTML = '<i class="fa-solid fa-link"></i>';
    }, 2000);
  } catch {
    showToast('Could not copy – try manually selecting the URL', 'warn');
  }
});

// ─────────────────────────────────────────────────────────────
// Download handler
// ─────────────────────────────────────────────────────────────
function handleDownload(e) {
  const btn          = e.currentTarget;
  const formatId     = btn.dataset.formatId;
  const ext          = btn.dataset.ext;
  const label        = btn.dataset.label;
  const audioBitrate = btn.dataset.audioBitrate || '192';
  const title        = currentVideoData?.title || 'video';
  const url          = currentVideoData?.originalUrl || '';

  if (!url || !formatId) {
    showError('Missing video URL or format. Please fetch the video again.');
    return;
  }

  showDownloadOverlay(label, ext);

  const dlUrl = `${API_BASE}/api/download?` + new URLSearchParams({
    url, format: formatId, ext, title, audioBitrate,
  });

  // Hidden iframe triggers browser download without navigating away
  if (downloadIframe) downloadIframe.remove();
  downloadIframe = document.createElement('iframe');
  downloadIframe.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;opacity:0;';
  downloadIframe.src = dlUrl;
  document.body.appendChild(downloadIframe);

  // Auto-dismiss overlay after a delay
  const overlayTimer = setTimeout(() => {
    hideDownloadOverlay();
    showToast(`✅ Download started: ${label}`);
  }, 5000);

  // Store timer so cancel can clear it
  downloadIframe._timer = overlayTimer;
}

// ─────────────────────────────────────────────────────────────
// Download overlay
// ─────────────────────────────────────────────────────────────
function showDownloadOverlay(label, ext) {
  downloadOverlayTitle.textContent = `Preparing "${label}"…`;
  downloadOverlaySub.textContent = ext === 'mp3'
    ? 'Extracting and encoding audio… Long videos may take a moment to start.'
    : 'Fetching and merging video stream… Large files take a few seconds to start.';
  downloadOverlay.style.display = 'flex';
}

function hideDownloadOverlay() {
  downloadOverlay.style.display = 'none';
}

cancelDownloadBtn.addEventListener('click', () => {
  hideDownloadOverlay();
  if (downloadIframe) {
    clearTimeout(downloadIframe._timer);
    downloadIframe.src = 'about:blank';
    downloadIframe.remove();
    downloadIframe = null;
  }
  showToast('Download cancelled.', 'warn');
});

// ─────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveToHistory(entry) {
  const history = getHistory();
  // Deduplicate by URL
  const filtered = history.filter(h => h.url !== entry.url);
  filtered.unshift(entry);
  if (filtered.length > MAX_HISTORY) filtered.length = MAX_HISTORY;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  refreshHistoryBadge();
  renderHistory();
}

function refreshHistoryBadge() {
  const count = getHistory().length;
  if (count > 0) {
    historyBadge.style.display = 'flex';
    historyBadge.textContent   = count > 9 ? '9+' : count;
  } else {
    historyBadge.style.display = 'none';
  }
}

function renderHistory() {
  const history = getHistory();
  historyBody.innerHTML = '';

  if (history.length === 0) {
    historyBody.innerHTML = `
      <div class="history-empty">
        <i class="fa-solid fa-clock-rotate-left"></i>
        <p>No downloads yet.<br>Your history will appear here.</p>
      </div>`;
    return;
  }

  history.forEach(item => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `Reload: ${item.title}`);
    el.title = 'Click to reload this video';

    const relDate = formatRelativeDate(item.date);

    el.innerHTML = `
      ${item.thumbnail
        ? `<img class="history-item__thumb" src="${escHtml(item.thumbnail)}" alt="" loading="lazy" />`
        : `<div class="history-item__thumb" style="display:flex;align-items:center;justify-content:center;color:var(--c-text-dim);font-size:1rem;"><i class="fa-solid fa-film"></i></div>`
      }
      <div class="history-item__info">
        <div class="history-item__title">${escHtml(item.title || 'Unknown')}</div>
        <div class="history-item__meta">${escHtml(item.channel || '')} · ${relDate} · ${item.duration || ''}</div>
      </div>
    `;

    const clickHandler = () => {
      videoUrlInput.value = item.url;
      clearBtn.style.display = 'flex';
      closeHistory();
      fetchVideoInfo(item.url);
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    };

    el.addEventListener('click', clickHandler);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickHandler(); }
    });

    historyBody.appendChild(el);
  });
}

function formatRelativeDate(isoStr) {
  if (!isoStr) return '';
  try {
    const diff  = Date.now() - new Date(isoStr).getTime();
    const mins  = Math.floor(diff / 60000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days  = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

// History panel open/close
function openHistory() {
  renderHistory();
  historyPanel.classList.add('open');
  historyBackdrop.classList.add('open');
  historyPanel.setAttribute('aria-hidden', 'false');
  historyClose.focus();
}
function closeHistory() {
  historyPanel.classList.remove('open');
  historyBackdrop.classList.remove('open');
  historyPanel.setAttribute('aria-hidden', 'true');
}

historyBtn.addEventListener('click', openHistory);
historyClose.addEventListener('click', closeHistory);
historyBackdrop.addEventListener('click', closeHistory);

clearHistoryBtn.addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  refreshHistoryBadge();
  renderHistory();
  showToast('History cleared.');
});

// Close history on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && historyPanel.classList.contains('open')) closeHistory();
});

// ─────────────────────────────────────────────────────────────
// Scroll to top FAB
// ─────────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  const shouldShow = window.scrollY > 400;
  scrollTopBtn.style.display = shouldShow ? 'flex' : 'none';
}, { passive: true });

scrollTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ─────────────────────────────────────────────────────────────
// Header shadow on scroll
// ─────────────────────────────────────────────────────────────
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  header.style.boxShadow = window.scrollY > 12
    ? '0 4px 30px rgba(0,0,0,.45)'
    : 'none';
}, { passive: true });

// ─────────────────────────────────────────────────────────────
// Feature card reveal observer
// ─────────────────────────────────────────────────────────────
function setupRevealObserver() {
  const cards = document.querySelectorAll('[data-reveal]');
  if (!cards.length) return;

  const obs = new IntersectionObserver(entries => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.classList.add('revealed');
        }, i * 80);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  cards.forEach(card => obs.observe(card));
}

// ─────────────────────────────────────────────────────────────
// Smooth scroll for anchor links
// ─────────────────────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ─────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────
function setLoading(active) {
  fetchBtn.disabled         = active;
  btnText.style.display     = active ? 'none'        : 'inline-flex';
  btnLoading.style.display  = active ? 'inline-flex' : 'none';
}

function showSkeleton() {
  skeletonCard.style.display = 'flex';
  // Apply shimmer to all skeleton elements
  skeletonCard.querySelectorAll('[class*="skeleton-"]').forEach(el => {
    if (!el.classList.contains('skeleton-info') && !el.classList.contains('skeleton-formats')) {
      el.classList.add('shimmer');
    }
  });
}
function hideSkeleton() {
  skeletonCard.style.display = 'none';
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorBanner.style.display = 'flex';
  retryBtn.style.display = lastUrl ? 'inline-flex' : 'none';
}
function hideError() {
  errorBanner.style.display = 'none';
  retryBtn.style.display    = 'none';
}

function showResult() {
  resultCard.style.display = 'block';
}
function hideResult() {
  resultCard.style.display = 'none';
  formatsGrid.innerHTML    = '';
  currentVideoData         = null;
}

function showToast(msg, type = 'success') {
  toastMsg.textContent = msg;
  if (type === 'warn') {
    toastIcon.className = 'fa-solid fa-triangle-exclamation toast-icon--warn';
    toastIcon.style.color = 'var(--c-orange)';
  } else if (type === 'info') {
    toastIcon.className = 'fa-solid fa-circle-info';
    toastIcon.style.color = 'var(--c-blue)';
  } else {
    toastIcon.className = 'fa-solid fa-circle-check toast-icon';
    toastIcon.style.color = 'var(--c-green)';
  }
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}
