/* ============================================================
   utils.js — utilitas umum, sanitasi HTML, teks, tanggal, file
   ============================================================ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const uid = () =>
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function debounce(fn, wait = 200) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  wrapped.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return wrapped;
}

export function throttle(fn, wait = 100) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      clearTimeout(timer);
      timer = null;
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const isApple = (() => {
  try {
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform || '') ||
      /Mac OS X/.test(navigator.userAgent || '');
  } catch (_) {
    return false;
  }
})();

export const modKey = isApple ? '⌘' : 'Ctrl';
export const altKey = isApple ? '⌥' : 'Alt';

export function haptic(pattern = 8) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (_) { /* noop */ }
}

export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  } catch (_) {
    return false;
  }
}

export function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/* ============================================================
   Tanggal & waktu
   ============================================================ */

const LOCALE = 'id-ID';

export const fmtDate = (ts) => new Date(ts).toLocaleDateString(LOCALE, {
  day: '2-digit', month: 'short', year: 'numeric'
});

export const fmtDateLong = (ts) => new Date(ts).toLocaleDateString(LOCALE, {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
});

export const fmtTime = (ts) => new Date(ts).toLocaleTimeString(LOCALE, {
  hour: '2-digit', minute: '2-digit'
}).replace(':', '.');

export const fmtDateTime = (ts) => `${fmtDate(ts)} · ${fmtTime(ts)}`;

export function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'Baru saja';
  if (min < 60) return `${min} mnt lalu`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Kemarin';
  if (days < 7) return `${days} hari lalu`;
  if (days < 30) return `${Math.floor(days / 7)} mgg lalu`;
  return fmtDate(ts);
}

export function noteTimeLabel(ts) {
  if (!ts) return '';
  const now = new Date();
  const d = new Date(ts);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return fmtTime(ts);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Kemarin';
  if (now.getFullYear() === d.getFullYear()) {
    return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  }
  return fmtDate(ts);
}

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dateGroupLabel(ts) {
  if (!ts) return 'Lebih lama';
  const now = new Date();
  const today = startOfDay(now.getTime());
  const day = startOfDay(ts);
  const diffDays = Math.round((today - day) / 86400000);
  if (diffDays <= 0) return 'Hari ini';
  if (diffDays === 1) return 'Kemarin';
  if (diffDays < 7) return '7 hari terakhir';
  if (diffDays < 30) return '30 hari terakhir';
  const d = new Date(ts);
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(LOCALE, { month: 'long' });
  }
  return d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
}

export function trashDaysLeft(deletedAt, days = 30) {
  if (!deletedAt) return days;
  const elapsed = Math.floor((Date.now() - deletedAt) / 86400000);
  return Math.max(0, days - elapsed);
}

/* ============================================================
   Teks & HTML
   ============================================================ */

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'FIELDSET',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4',
  'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'TABLE', 'TR', 'UL'
]);

/** Ubah HTML menjadi teks biasa dengan struktur baris yang wajar. */
export function htmlToText(html) {
  if (!html) return '';
  let doc;
  try {
    doc = new DOMParser().parseFromString(`<div id="__text_root">${html}</div>`, 'text/html');
  } catch (_) {
    return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const root = doc.getElementById('__text_root');
  if (!root) return '';
  const out = [];

  const walk = (node) => {
    if (node.nodeType === 3) {
      out.push(node.nodeValue || '');
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;

    if (tag === 'BR') { out.push('\n'); return; }
    if (tag === 'HR') { out.push('\n---\n'); return; }
    if (tag === 'IMG') { out.push(node.getAttribute('alt') || '[Gambar]'); return; }

    if (tag === 'INPUT') {
      const type = (node.getAttribute('type') || '').toLowerCase();
      if (type === 'checkbox') {
        out.push(node.hasAttribute('checked') ? '☑ ' : '☐ ');
      }
      return;
    }

    if (tag === 'LI') {
      out.push('\n• ');
    } else if (tag === 'TD' || tag === 'TH') {
      if (out.length && !/\n$/.test(out[out.length - 1])) out.push('  ');
    } else if (BLOCK_TAGS.has(tag) && !/^\n*$/.test(out.join('').slice(-15))) {
      out.push('\n');
    }

    for (const child of node.childNodes) walk(child);

    if (tag === 'TD' || tag === 'TH') out.push('  ');
    else if (BLOCK_TAGS.has(tag)) out.push('\n');
  };

  walk(root);
  return out.join('')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripHtml(html) {
  return htmlToText(html).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

let _segmenter = null;
const WORD_RE = /[\p{L}\p{N}]+(?:['\u2019-][\p{L}\p{N}]+)*/gu;

export function countWords(text) {
  const value = String(text || '').trim();
  if (!value) return 0;
  /* Teks besar (ribuan baris): Intl.Segmenter terlalu lambat, pakai regex. */
  if (value.length > 20000) {
    try { return (value.match(WORD_RE) || []).length; } catch (_) { /* fallback */ }
    return (value.match(/\S+/g) || []).length;
  }
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      if (!_segmenter) _segmenter = new Intl.Segmenter(LOCALE, { granularity: 'word' });
      let count = 0;
      for (const part of _segmenter.segment(value)) if (part.isWordLike) count++;
      return count;
    }
  } catch (_) { /* fallback */ }
  return (value.match(/\S+/g) || []).length;
}

export function readingMinutes(text) {
  return Math.max(1, Math.ceil(countWords(text) / 200));
}

export function hasChecklist(html) {
  return /<input[^>]+type=["']?checkbox/i.test(html || '');
}

export function countChecklist(html) {
  if (!html) return { total: 0, done: 0 };
  try {
    const doc = new DOMParser().parseFromString(`<div id="__check_root">${html}</div>`, 'text/html');
    const boxes = doc.querySelectorAll('#__check_root input[type="checkbox"]');
    let done = 0;
    boxes.forEach((cb) => { if (cb.hasAttribute('checked') || cb.checked) done++; });
    return { total: boxes.length, done };
  } catch (_) {
    return { total: 0, done: 0 };
  }
}

export function hasImage(html) {
  return /<img[\s>]/i.test(html || '');
}

export function firstImageSrc(html) {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(`<div id="__img_root">${html}</div>`, 'text/html');
    return doc.querySelector('#__img_root img')?.getAttribute('src') || '';
  } catch (_) {
    return '';
  }
}

export function extractHashtags(text) {
  const found = [];
  const re = /(?:^|[\s(])#([\p{L}\p{N}_-]{1,40})/gu;
  let match;
  while ((match = re.exec(String(text || '')))) {
    found.push(match[1].toLowerCase());
  }
  return [...new Set(found)];
}

export function noteTags(note) {
  const direct = (note?.tags || []).map((t) => String(t).trim().replace(/^#/, '').toLowerCase()).filter(Boolean);
  const inline = extractHashtags(note?.plainText || htmlToText(note?.content || ''));
  return [...new Set([...direct, ...inline])].slice(0, 30);
}

export function notePreview(note, max = 180) {
  const text = note?.plainText || htmlToText(note?.content || '');
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean) return clean.slice(0, max);
  if (hasImage(note?.content || '')) return 'Gambar';
  return '';
}

export function excerptAround(text, query, max = 170) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  const q = String(query || '').trim().toLowerCase();
  if (!q) return source.slice(0, max);
  const idx = source.toLowerCase().indexOf(q);
  if (idx < 0) return source.slice(0, max);
  const start = Math.max(0, idx - Math.floor((max - q.length) / 2));
  const slice = source.slice(start, start + max);
  return (start > 0 ? '…' : '') + slice + (start + max < source.length ? '…' : '');
}

export function highlightText(text, query) {
  const source = String(text || '');
  const q = String(query || '').trim();
  if (!q) return esc(source);
  const parts = source.split(new RegExp(`(${escapeRegExp(q)})`, 'ig'));
  return parts.map((part) => part.toLowerCase() === q.toLowerCase()
    ? `<mark>${esc(part)}</mark>`
    : esc(part)).join('');
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const value = n / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/* ============================================================
   Pencarian
   ============================================================ */

export function parseSearchQuery(raw) {
  const input = String(raw || '').trim();
  const tokens = [];
  // Pisahkan token dengan dukungan tanda kutip.
  const re = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(input))) tokens.push(m[1] !== undefined ? `"${m[1]}"` : m[2]);

  const textParts = [];
  const tags = [];
  const filters = { is: [], has: [], before: null, after: null };

  for (let token of tokens) {
    const quoted = token.startsWith('"') && token.endsWith('"');
    if (quoted) {
      textParts.push(token.slice(1, -1));
      continue;
    }
    if (token.startsWith('#') && token.length > 1) {
      tags.push(token.slice(1).toLowerCase());
      continue;
    }
    const isMatch = token.match(/^is:(pinned|favorite|archived|trash|locked)$/i);
    if (isMatch) { filters.is.push(isMatch[1].toLowerCase()); continue; }
    const hasMatch = token.match(/^has:(image|checklist|link|table|audio)$/i);
    if (hasMatch) { filters.has.push(hasMatch[1].toLowerCase()); continue; }
    const before = token.match(/^before:(\d{4}-\d{2}-\d{2})$/i);
    if (before) { filters.before = new Date(`${before[1]}T23:59:59`).getTime(); continue; }
    const after = token.match(/^after:(\d{4}-\d{2}-\d{2})$/i);
    if (after) { filters.after = new Date(`${after[1]}T00:00:00`).getTime(); continue; }
    textParts.push(token);
  }

  return { text: textParts.join(' ').trim(), tags, filters };
}

/* ============================================================
   Warna
   ============================================================ */

export function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return { r: 99, g: 102, b: 241 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function hexToRgba(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function darkenHex(hex, percent = 12) {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - percent / 100;
  return '#' + [r, g, b]
    .map((v) => clamp(Math.round(v * f), 0, 255).toString(16).padStart(2, '0'))
    .join('');
}

export function contrastColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111827' : '#ffffff';
}

/* ============================================================
   File & clipboard
   ============================================================ */

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 2000);
}

export function downloadText(text, filename, type = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type }), filename);
}

export function sanitizeFilename(name, fallback = 'catatan') {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca file.'));
    reader.readAsDataURL(file);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gambar tidak dapat dibuka.'));
    img.src = src;
  });
}

/**
 * Kompres gambar agar aman disimpan di IndexedDB.
 * PNG kecil dengan transparansi dipertahankan; foto dikonversi ke JPEG.
 */
export async function compressImage(file, { maxW = 1600, maxH = 1600, quality = 0.86 } = {}) {
  if (!file) throw new Error('Tidak ada gambar.');
  if (!/^image\//i.test(file.type || '')) throw new Error('File bukan gambar.');

  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return dataUrl;

  const scale = Math.min(1, maxW / w, maxH / h);
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const keepPng = file.type === 'image/png' && file.size <= 1.2 * 1024 * 1024;
  const outType = keepPng ? 'image/png' : 'image/jpeg';

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  if (outType === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);

  const result = canvas.toDataURL(outType, quality);
  return result.length < dataUrl.length ? result : dataUrl;
}

/* ============================================================
   SANITASI HTML
   ============================================================ */

const ALLOWED_TAGS = new Set([
  'A', 'ABBR', 'AUDIO', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'DIV',
  'EM', 'FIGCAPTION', 'FIGURE', 'H1', 'H2', 'H3', 'H4', 'HR', 'I', 'IMG',
  'INPUT', 'INS', 'LI', 'MARK', 'OL', 'P', 'PRE', 'S', 'SMALL', 'SPAN',
  'STRIKE', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD',
  'TR', 'U', 'UL'
]);

const REMOVE_TAGS = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE',
  'FORM', 'BUTTON', 'SELECT', 'TEXTAREA', 'VIDEO', 'SVG', 'MATH', 'TEMPLATE'
]);

const GLOBAL_ATTRS = new Set(['style', 'class']);
const ALLOWED_ATTRS = {
  A: new Set(['href', 'title', 'aria-label']),
  IMG: new Set(['src', 'alt', 'width', 'height']),
  INPUT: new Set(['type', 'checked']),
  AUDIO: new Set(['src', 'controls', 'preload']),
  TD: new Set(['colspan', 'rowspan']),
  TH: new Set(['colspan', 'rowspan', 'scope']),
  OL: new Set(['start']),
  TABLE: new Set([])
};

const ALLOWED_CLASSES = {
  DIV: new Set(['check-item', 'is-done', 'checklist']),
  P: new Set(['check-item', 'is-done', 'checklist']),
  LI: new Set(['check-item', 'is-done']),
  UL: new Set(['checklist']),
  SPAN: new Set(['check-item', 'is-done']),
  IMG: new Set(['note-image']),
  TABLE: new Set(['note-table']),
  BLOCKQUOTE: new Set(['note-quote']),
  PRE: new Set(['note-code'])
};

const COLOR_RE = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-z]{3,24}|transparent)$/i;
const SIZE_RE = /^(?:\d{1,2}(?:\.\d+)?(?:px|pt)|(?:0?\.\d+|[1-3](?:\.\d+)?)(?:em|rem))$/i;
const PERCENT_RE = /^\d{1,3}(?:\.\d+)?%$/;
const NUM_RE = /^\d{1,2}(?:\.\d+)?$/;

function sanitizeStyleValue(prop, value) {
  const v = String(value || '').trim();
  if (!v || /url\s*\(|expression|@import|javascript:/i.test(v)) return '';
  switch (prop) {
    case 'text-align':
      return /^(left|right|center|justify)$/i.test(v) ? v.toLowerCase() : '';
    case 'color':
    case 'background-color':
      return COLOR_RE.test(v) ? v : '';
    case 'font-size':
      return SIZE_RE.test(v) ? v : '';
    case 'font-weight':
      return /^(normal|bold|[1-9]00)$/i.test(v) ? v.toLowerCase() : '';
    case 'font-style':
      return /^(normal|italic)$/i.test(v) ? v : '';
    case 'text-decoration':
    case 'text-decoration-line':
      return /^(none|underline|line-through|underline line-through|line-through underline)$/i.test(v) ? v : '';
    case 'width':
    case 'max-width':
    case 'height':
      return PERCENT_RE.test(v) || /^\d{1,4}px$/i.test(v) ? v : '';
    case 'line-height':
      return NUM_RE.test(v) ? v : '';
    case 'border-radius':
      return /^(\d{1,3}(?:\.\d+)?(?:px|%))$/.test(v) ? v : '';
    default:
      return '';
  }
}

function sanitizeStyle(el, doc) {
  const raw = el.getAttribute('style');
  if (!raw) return;
  const tester = doc.createElement('span');
  tester.setAttribute('style', raw);
  const out = [];
  for (let i = 0; i < tester.style.length; i++) {
    const prop = tester.style[i];
    const value = tester.style.getPropertyValue(prop);
    const clean = sanitizeStyleValue(prop, value);
    if (clean) out.push(`${prop}:${clean}`);
  }
  if (out.length) el.setAttribute('style', out.join(';'));
  else el.removeAttribute('style');
}

function sanitizeClass(el, tag) {
  const raw = el.getAttribute('class');
  if (!raw) return;
  const allow = ALLOWED_CLASSES[tag];
  if (!allow) { el.removeAttribute('class'); return; }
  const kept = raw.split(/\s+/).filter((c) => allow.has(c));
  if (kept.length) el.setAttribute('class', kept.join(' '));
  else el.removeAttribute('class');
}

function isSafeUrl(value, { image = false, audio = false } = {}) {
  const url = String(value || '').trim();
  if (!url) return false;
  if (image) {
    return /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(url) || /^https?:\/\//i.test(url);
  }
  if (audio) {
    return /^data:audio\/[a-z0-9.+-]+;base64,/i.test(url) || /^https?:\/\//i.test(url);
  }
  if (/^https?:\/\//i.test(url)) return true;
  if (/^(mailto:|tel:)/i.test(url)) return true;
  if (url.startsWith('#')) return true;
  return false;
}

function sanitizeElement(el, doc) {
  const tag = el.tagName;
  const defaults = GLOBAL_ATTRS;
  const specific = ALLOWED_ATTRS[tag] || new Set();
  for (const attr of Array.from(el.attributes)) {
    if (!defaults.has(attr.name) && !specific.has(attr.name)) {
      el.removeAttribute(attr.name);
    }
  }

  sanitizeStyle(el, doc);
  sanitizeClass(el, tag);

  if (tag === 'A') {
    const href = el.getAttribute('href') || '';
    if (!isSafeUrl(href)) el.removeAttribute('href');
    if (el.getAttribute('href')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  }

  if (tag === 'IMG') {
    const src = el.getAttribute('src') || '';
    if (!isSafeUrl(src, { image: true })) {
      el.remove();
      return;
    }
    el.setAttribute('loading', 'lazy');
    el.setAttribute('decoding', 'async');
    const w = el.getAttribute('width');
    const h = el.getAttribute('height');
    if (w && !/^\d{1,4}$/.test(w)) el.removeAttribute('width');
    if (h && !/^\d{1,4}$/.test(h)) el.removeAttribute('height');
    if (!el.getAttribute('alt')) el.setAttribute('alt', 'Gambar catatan');
  }

  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type !== 'checkbox') { el.remove(); return; }
    el.setAttribute('type', 'checkbox');
    if (el.hasAttribute('checked')) el.setAttribute('checked', 'checked');
    else el.removeAttribute('checked');
  }

  if (tag === 'AUDIO') {
    const src = el.getAttribute('src') || '';
    if (!isSafeUrl(src, { audio: true })) { el.remove(); return; }
    el.setAttribute('controls', '');
    el.setAttribute('preload', 'metadata');
  }

  // Bersihkan anak-anak node.
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 8) { child.remove(); continue; }
    if (child.nodeType !== 1) continue;
    const childTag = child.tagName;
    if (REMOVE_TAGS.has(childTag)) { child.remove(); continue; }
    if (!ALLOWED_TAGS.has(childTag)) {
      // Buka tag yang tidak dikenal, tetapi tetap sanitasi anak-anaknya.
      const kids = Array.from(child.childNodes);
      for (const k of kids) {
        child.parentNode.insertBefore(k, child);
        if (k.nodeType === 1) {
          if (REMOVE_TAGS.has(k.tagName)) k.remove();
          else if (!ALLOWED_TAGS.has(k.tagName)) {
            const text = doc.createTextNode(k.textContent || '');
            k.replaceWith(text);
          } else sanitizeElement(k, doc);
        }
      }
      child.remove();
      continue;
    }
    sanitizeElement(child, doc);
  }
}

export function sanitizeHTML(html) {
  if (!html) return '';
  let doc;
  try {
    doc = new DOMParser().parseFromString(
      `<div id="__sanitize_root">${html}</div>`,
      'text/html'
    );
  } catch (_) {
    return esc(html);
  }
  const root = doc.getElementById('__sanitize_root');
  if (!root) return '';
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 8) { child.remove(); continue; }
    if (child.nodeType !== 1) continue;
    if (REMOVE_TAGS.has(child.tagName)) { child.remove(); continue; }
    if (!ALLOWED_TAGS.has(child.tagName)) {
      const text = doc.createTextNode(child.textContent || '');
      child.replaceWith(text);
      continue;
    }
    sanitizeElement(child, doc);
  }
  return root.innerHTML;
}

export function syncCheckboxAttrs(container) {
  if (!container) return;
  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    if (cb.checked) cb.setAttribute('checked', 'checked');
    else cb.removeAttribute('checked');
  });
}

/* ============================================================
   Lain-lain
   ============================================================ */

export function normalizeNote(raw) {
  const now = Date.now();
  const content = sanitizeHTML(raw?.content || '');
  const plain = htmlToText(content);
  return {
    id: raw?.id || uid(),
    title: String(raw?.title || ''),
    content,
    plainText: plain,
    categoryId: raw?.categoryId || null,
    tags: Array.isArray(raw?.tags) ? raw.tags.map((t) => String(t).toLowerCase()).slice(0, 30) : [],
    color: raw?.color || null,
    paper: raw?.paper || 'blank',
    font: raw?.font || null,
    isPinned: Boolean(raw?.isPinned),
    isFavorite: Boolean(raw?.isFavorite),
    isArchived: Boolean(raw?.isArchived),
    isDeleted: Boolean(raw?.isDeleted),
    isLocked: Boolean(raw?.isLocked),
    createdAt: Number(raw?.createdAt) || now,
    updatedAt: Number(raw?.updatedAt) || now,
    deletedAt: raw?.deletedAt || null,
    revAt: Number(raw?.revAt) || 0,
    wordCount: Number(raw?.wordCount) || countWords(plain)
  };
}

export function estimateNoteBytes(note) {
  try {
    return new Blob([JSON.stringify(note)]).size;
  } catch (_) {
    return JSON.stringify(note || {}).length;
  }
}
