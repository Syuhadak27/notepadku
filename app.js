/* ============================================================
   app.js — orkestrasi aplikasi Catatan 2.0
   ============================================================ */

import { icon } from './icons.js';
import {
  $, $$, esc, uid, debounce, throttle, clamp, haptic, isStandalone,
  isEditableTarget, modKey, fmtDate, fmtDateTime, relativeTime, dateGroupLabel,
  noteTags, notePreview, htmlToText, countWords, hasChecklist, hasImage,
  parseSearchQuery, downloadText, copyText, sanitizeFilename, sanitizeHTML,
  darkenHex, hexToRgba, contrastColor, formatBytes, normalizeNote
} from './utils.js';
import * as DB from './db.js';
import * as Backup from './backup.js';
import * as UI from './ui.js';
import { mountEditor } from './editor.js';
import * as Modals from './modals.js';
import { openDrawingModal } from './drawing.js';
import { openAudioRecorder } from './audio.js';

/* ============================================================
   Konstanta & state
   ============================================================ */

const PAGE_SIZE = 60;
const REVISION_INTERVAL = 4 * 60 * 1000;
const TRASH_DAYS = 30;

const DEFAULT_SETTINGS = {
  theme: 'system',
  accent: '#5b7cfa',
  viewMode: 'list',
  sortBy: 'updatedAt',
  groupByDate: true,
  fontSize: 17,
  editorFont: 'sans',
  haptics: true,
  confirmDelete: true,
  swipeActions: true,
  autoPurgeTrash: true,
  moveChecked: false,
  spellcheck: true,
  lastBackupAt: 0,
  recentSearches: []
};

const EMPTY_FILTERS = () => ({
  favorite: false, checklist: false, image: false, audio: false, archived: false
});

const state = {
  notes: [],
  categories: [],
  settings: { ...DEFAULT_SETTINGS, shortcutLabel: `${modKey} N` },
  view: 'notes',
  params: {},
  query: '',
  searchFilters: EMPTY_FILTERS(),
  searchFolderId: null,
  quickFilter: 'all',
  limit: PAGE_SIZE,
  selected: new Set(),
  selectionMode: false,

  editor: null,
  note: null,
  editorSession: null,
  saveSoon: null,
  saveQueue: null,
  saveStatus: 'saved',
  dirty: false,
  focusMode: false,
  focusNewNote: false,

  currentHash: '#/notes',
  previousHash: '#/notes',
  lastRoutedHash: '',
  editorReturn: '#/notes',
  searchReturn: '#/notes',
  previewReturn: '#/trash',
  pendingSearchFocus: false,

  drawerOpen: false,
  currentFiltered: [],
  booted: false,

  installPrompt: null,
  swReg: null,
  updateWorker: null,
  hadSWController: false,
  installing: false
};

let els = {};
let routing = false;
let routePending = false;
let routeScheduled = false;
let suppressClickUntil = 0;
let lastStorageRefresh = 0;
let storageRefreshing = false;
let bootStarted = false;

/* ============================================================
   Utilitas dasar
   ============================================================ */

const findNote = (id) => state.notes.find((n) => n.id === id) || null;
const findCategory = (id) => state.categories.find((c) => c.id === id) || null;

function safeDecode(value) {
  try { return decodeURIComponent(value || ''); } catch (_) { return value || ''; }
}

function buzz(pattern = 8) {
  if (state.settings.haptics !== false) haptic(pattern);
}

function syncBootPrefs() {
  try {
    localStorage.setItem('catatan:prefs', JSON.stringify({
      theme: state.settings.theme,
      accent: state.settings.accent,
      fontSize: state.settings.fontSize
    }));
  } catch (_) { /* noop */ }
}

function loadBootPrefs() {
  try {
    const raw = localStorage.getItem('catatan:prefs');
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (!prefs || typeof prefs !== 'object') return;
    if (['light', 'dark', 'system'].includes(prefs.theme)) state.settings.theme = prefs.theme;
    if (typeof prefs.accent === 'string' && /^#[0-9a-f]{6}$/i.test(prefs.accent)) {
      state.settings.accent = prefs.accent;
    }
    const size = Number(prefs.fontSize);
    if (Number.isFinite(size)) state.settings.fontSize = clamp(size, 14, 24);
  } catch (_) { /* noop */ }
}

function resolvedTheme() {
  const pref = state.settings.theme || 'system';
  if (pref === 'dark' || pref === 'light') return pref;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch (_) { return 'light'; }
}

function applyTheme() {
  const resolved = resolvedTheme();
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePref = state.settings.theme || 'system';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0f1115' : '#f5f5f7');
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

function applyAccent() {
  const accent = state.settings.accent || DEFAULT_SETTINGS.accent;
  const root = document.documentElement.style;
  root.setProperty('--accent', accent);
  root.setProperty('--accent-strong', darkenHex(accent, 10));
  root.setProperty('--accent-soft', hexToRgba(accent, 0.14));
  root.setProperty('--accent-softer', hexToRgba(accent, 0.07));
  root.setProperty('--accent-fg', contrastColor(accent));
}

function applyFontSize() {
  const size = clamp(Number(state.settings.fontSize) || 17, 14, 24);
  document.documentElement.style.setProperty('--editor-font-size', `${size}px`);
}

function applyAllPreferences() {
  applyTheme();
  applyAccent();
  applyFontSize();
  syncBootPrefs();
}

function getCounts() {
  let all = 0, favorites = 0, archive = 0, trash = 0;
  for (const note of state.notes) {
    if (note.isDeleted) { trash += 1; continue; }
    if (note.isArchived) { archive += 1; continue; }
    all += 1;
    if (note.isFavorite) favorites += 1;
  }
  return {
    all, favorites, archive, trash,
    folders: state.categories.length
  };
}

function buildTagCounts() {
  const map = new Map();
  for (const note of state.notes) {
    if (note.isDeleted || note.isArchived) continue;
    for (const tag of noteTags(note)) map.set(tag, (map.get(tag) || 0) + 1);
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'id'));
}

function categoryCounts() {
  const map = new Map();
  for (const note of state.notes) {
    if (note.isDeleted || note.isArchived || !note.categoryId) continue;
    map.set(note.categoryId, (map.get(note.categoryId) || 0) + 1);
  }
  return map;
}

function getNoteTime(note) {
  return state.view === 'trash' ? (note.deletedAt || note.updatedAt) : note.updatedAt;
}

/* ============================================================
   Toast
   ============================================================ */

function toast(message, kind = 'success', duration = 3000) {
  const root = $('#toast-root');
  if (!root) return;
  const ico = kind === 'error' ? 'alert' : kind === 'info' ? 'info' : 'checkCircle';
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `<span class="toast-ico">${icon(ico, 18)}</span><span>${esc(message)}</span>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  }, duration);
}

/* ============================================================
   Shell & chrome
   ============================================================ */

function renderShell() {
  const app = $('#app');
  app.innerHTML = `
    <div class="app-shell" id="app-shell">
      <div class="drawer-scrim" data-action="close-drawer" aria-hidden="true"></div>
      <aside class="sidebar" id="sidebar" aria-label="Navigasi catatan"></aside>
      <div class="main-area">
        <header class="appbar" id="appbar"></header>
        <main class="content" id="content" tabindex="-1"></main>
        <nav class="tabbar" id="tabbar" aria-label="Navigasi utama"></nav>
        <button class="fab" id="fab" data-action="new-note" aria-label="Catatan baru" title="Catatan baru">
          ${icon('plus', 26)}
        </button>
        <div class="selection-root" id="selection-root"></div>
      </div>
    </div>`;
  els = {
    shell: $('#app-shell'),
    sidebar: $('#sidebar'),
    appbar: $('#appbar'),
    content: $('#content'),
    tabbar: $('#tabbar'),
    fab: $('#fab'),
    selection: $('#selection-root')
  };
}

function viewMeta() {
  const counts = getCounts();
  const folder = state.view === 'folder' ? findCategory(state.params.id) : null;
  switch (state.view) {
    case 'notes':
      return { title: 'Semua Catatan', sub: `${counts.all} catatan`, back: false };
    case 'favorites':
      return { title: 'Favorit', sub: `${counts.favorites} catatan favorit`, back: false };
    case 'archive':
      return { title: 'Arsip', sub: `${counts.archive} catatan diarsipkan`, back: false };
    case 'trash':
      return { title: 'Sampah', sub: `${counts.trash} catatan di sampah`, back: false };
    case 'folders':
      return { title: 'Folder', sub: `${counts.folders} folder`, back: false };
    case 'settings':
      return { title: 'Pengaturan', sub: 'Sesuaikan pengalaman menulismu', back: false };
    case 'folder':
      return {
        title: folder?.name || 'Folder',
        sub: `${state.currentFiltered.length || 0} catatan`,
        back: true
      };
    case 'tag':
      return { title: `#${state.params.tag || ''}`, sub: `${state.currentFiltered.length || 0} catatan`, back: true };
    case 'preview':
      return { title: 'Pratinjau catatan', sub: 'Hanya baca · di sampah', back: true };
    default:
      return { title: 'Catatan', sub: '', back: false };
  }
}

function updateChrome() {
  if (!els.sidebar) return;

  const counts = getCounts();
  const tagCounts = buildTagCounts();
  const sideScroll = els.sidebar.querySelector('.side-scroll');
  const sideTop = sideScroll?.scrollTop || 0;

  els.sidebar.innerHTML = UI.sidebarHTML({
    notes: state.notes,
    categories: state.categories,
    counts,
    tagCounts,
    view: state.view,
    params: state.params,
    settings: state.settings
  });
  const newScroll = els.sidebar.querySelector('.side-scroll');
  if (newScroll) newScroll.scrollTop = sideTop;

  if (state.view === 'editor') {
    els.appbar.innerHTML = UI.appbarHTML({
      view: 'editor',
      note: state.note || findNote(state.params.id),
      saveStatus: state.saveStatus,
      focusMode: state.focusMode,
      modKey
    });
  } else if (state.view === 'search') {
    els.appbar.innerHTML = UI.appbarHTML({ view: 'search', query: state.query, modKey });
  } else {
    els.appbar.innerHTML = UI.appbarHTML({
      view: state.view,
      meta: viewMeta(),
      selectionMode: state.selectionMode,
      selectedCount: state.selected.size,
      modKey
    });
  }

  els.tabbar.innerHTML = UI.tabbarHTML({ view: state.view });

  const showFab = ['notes', 'favorites', 'folder', 'tag'].includes(state.view) && !state.selectionMode;
  if (els.fab) els.fab.hidden = !showFab;

  if (state.selectionMode) {
    els.selection.innerHTML = UI.selectionBarHTML({ selectedCount: state.selected.size, view: state.view });
  } else {
    els.selection.innerHTML = '';
  }

  els.content.classList.toggle('editor-content', state.view === 'editor');
  document.body.classList.toggle('is-editor', state.view === 'editor');
  document.body.classList.toggle('is-list-page', ['notes', 'favorites', 'folder', 'tag', 'archive', 'trash', 'search'].includes(state.view));
  document.body.classList.toggle('focus-mode', state.focusMode && state.view === 'editor');
  setDrawer(state.drawerOpen);
  maybeRefreshStorage();
}

function renderAppbarOnly() {
  if (!els.appbar) return;
  if (state.view === 'editor') {
    els.appbar.innerHTML = UI.appbarHTML({
      view: 'editor',
      note: state.note,
      saveStatus: state.saveStatus,
      focusMode: state.focusMode,
      modKey
    });
  }
}

function setDrawer(open) {
  state.drawerOpen = Boolean(open);
  els.shell?.classList.toggle('drawer-open', state.drawerOpen);
}

function setSaveStatus(status) {
  state.saveStatus = status;
  const indicator = $('#save-indicator');
  if (!indicator) return;
  indicator.className = `save-indicator ${status}`;
  const text = $('#save-text');
  if (text) {
    text.textContent = status === 'saving' ? 'Menyimpan…' : status === 'error' ? 'Gagal menyimpan' : 'Tersimpan';
  }
}

/* ============================================================
   Routing
   ============================================================ */

function parseRoute() {
  const raw = (location.hash || '#/notes').replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const qp = new URLSearchParams(queryPart);
  const first = parts[0] || 'notes';

  const simple = ['notes', 'favorites', 'archive', 'trash', 'folders', 'settings'];
  if (simple.includes(first)) return { view: first, params: {}, query: '' };
  if (first === 'note') return { view: 'editor', params: { id: safeDecode(parts[1]) }, query: '' };
  if (first === 'preview') return { view: 'preview', params: { id: safeDecode(parts[1]) }, query: '' };
  if (first === 'folder') return { view: 'folder', params: { id: safeDecode(parts[1]) }, query: '' };
  if (first === 'tag') return { view: 'tag', params: { tag: safeDecode(parts[1]) }, query: '' };
  if (first === 'search') return { view: 'search', params: {}, query: qp.get('q') || '' };
  return { view: 'notes', params: {}, query: '' };
}

function navigate(hash, { replace = false } = {}) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  Modals.prepareNavigation();
  setDrawer(false);

  if (location.hash === target) {
    if (state.view === 'search') focusSearchInput();
    return;
  }
  if (replace) {
    try { history.replaceState(history.state || {}, '', target); } catch (_) { location.hash = target; }
    handleRouteChange();
    return;
  }
  location.hash = target;
}

function goToTop() {
  if (state.view === 'search') {
    navigate(state.searchReturn || '#/notes');
  } else if (state.view === 'preview') {
    navigate(state.previewReturn || '#/trash');
  } else if (state.view === 'editor') {
    navigate(state.editorReturn || '#/notes');
  } else if (state.view === 'folder' || state.view === 'tag') {
    navigate('#/notes');
  } else {
    navigate('#/notes');
  }
}

function scheduleRoute() {
  if (routeScheduled) return;
  routeScheduled = true;
  queueMicrotask(() => {
    routeScheduled = false;
    handleRouteChange();
  });
}

async function handleRouteChange() {
  if (routing) { routePending = true; return; }
  routing = true;
  try {
    Modals.prepareNavigation();
    if (state.editor) await leaveEditorSession();

    const hasHash = Boolean(location.hash);
    if (!hasHash) {
      try { history.replaceState(history.state || {}, '', '#/notes'); } catch (_) { /* noop */ }
    }

    const route = parseRoute();
    const previousView = state.view;
    state.previousHash = state.currentHash;
    state.currentHash = location.hash || '#/notes';
    state.view = route.view;
    state.params = route.params;
    state.selectionMode = false;
    state.selected.clear();
    state.quickFilter = 'all';
    state.limit = PAGE_SIZE;

    if (route.view === 'search') {
      state.query = route.query;
      if (previousView !== 'search') {
        state.searchFilters = EMPTY_FILTERS();
        state.searchFolderId = null;
        state.pendingSearchFocus = true;
      }
    }

    state.lastRoutedHash = state.currentHash;
    renderRoute();
    window.scrollTo(0, 0);
  } catch (err) {
    console.error('[routing]', err);
    toast('Terjadi kesalahan saat membuka halaman.', 'error');
  } finally {
    routing = false;
    if (routePending) {
      routePending = false;
      handleRouteChange();
    }
  }
}

function renderRoute() {
  let note = null;
  if (state.view === 'editor' || state.view === 'preview') {
    note = findNote(state.params.id);
    if (!note) {
      toast('Catatan tidak ditemukan.', 'error');
      state.view = 'notes';
      state.params = {};
      try { history.replaceState(history.state || {}, '', '#/notes'); } catch (_) { /* noop */ }
      state.currentHash = '#/notes';
      note = null;
    } else if (state.view === 'preview' && !note.isDeleted) {
      try { history.replaceState(history.state || {}, '', `#/note/${note.id}`); } catch (_) { /* noop */ }
      state.view = 'editor';
      state.params = { id: note.id };
      state.currentHash = `#/note/${note.id}`;
    } else if (state.view === 'editor' && note.isDeleted) {
      try { history.replaceState(history.state || {}, '', `#/preview/${note.id}`); } catch (_) { /* noop */ }
      state.view = 'preview';
      state.params = { id: note.id };
      state.currentHash = `#/preview/${note.id}`;
    }
  }

  updateChrome();

  switch (state.view) {
    case 'editor':
      renderEditorContent(note);
      break;
    case 'preview':
      renderPreview(note);
      break;
    case 'folders':
      renderFolders();
      break;
    case 'settings':
      renderSettings();
      break;
    case 'search':
      renderSearch();
      break;
    default:
      renderCollection();
  }
}

function refreshPage({ keepScroll = false } = {}) {
  if (state.view === 'editor') { renderAppbarOnly(); return; }
  const y = window.scrollY;
  updateChrome();
  switch (state.view) {
    case 'folders': renderFolders(); break;
    case 'settings': renderSettings(); break;
    case 'search': refreshSearchResults(); break;
    case 'preview': renderPreview(findNote(state.params.id)); break;
    default: renderCollection();
  }
  if (keepScroll) requestAnimationFrame(() => window.scrollTo(0, y));
}

/* ============================================================
   Daftar catatan
   ============================================================ */

function baseNotesForView() {
  const active = state.notes.filter((n) => !n.isDeleted && !n.isArchived);
  switch (state.view) {
    case 'favorites': return active.filter((n) => n.isFavorite);
    case 'folder': return active.filter((n) => n.categoryId === state.params.id);
    case 'tag': return active.filter((n) => noteTags(n).includes(String(state.params.tag || '').toLowerCase()));
    case 'archive': return state.notes.filter((n) => !n.isDeleted && n.isArchived);
    case 'trash': return state.notes.filter((n) => n.isDeleted);
    default: return active;
  }
}

function quickCountsFor(notes) {
  let checklist = 0, image = 0, audio = 0;
  for (const note of notes) {
    if (hasChecklist(note.content)) checklist += 1;
    if (hasImage(note.content)) image += 1;
    if (/<audio[\s>]/i.test(note.content || '')) audio += 1;
  }
  return { all: notes.length, checklist, image, audio };
}

function applyQuickFilter(notes, filter) {
  if (filter === 'checklist') return notes.filter((n) => hasChecklist(n.content));
  if (filter === 'image') return notes.filter((n) => hasImage(n.content));
  if (filter === 'audio') return notes.filter((n) => /<audio[\s>]/i.test(n.content || ''));
  return notes;
}

function sortNotes(list) {
  const arr = [...list];
  arr.sort((a, b) => {
    if (state.view !== 'trash') {
      const pinDiff = Number(b.isPinned) - Number(a.isPinned);
      if (pinDiff) return pinDiff;
    }
    switch (state.settings.sortBy) {
      case 'title':
        return (a.title || 'Tanpa judul').localeCompare(b.title || 'Tanpa judul', 'id', { sensitivity: 'base' });
      case 'createdAt':
        return (b.createdAt || 0) - (a.createdAt || 0);
      case 'oldest':
        return (a.createdAt || 0) - (b.createdAt || 0);
      default:
        return (getNoteTime(b) || 0) - (getNoteTime(a) || 0);
    }
  });
  return arr;
}

function computeCollection() {
  const base = baseNotesForView();
  const quickCounts = quickCountsFor(base);
  const filtered = sortNotes(applyQuickFilter(base, state.quickFilter));
  state.currentFiltered = filtered;
  return { base, quickCounts, filtered };
}

function emptyHTMLForPage() {
  const page = state.view;
  const folder = page === 'folder' ? findCategory(state.params.id) : null;
  if (state.quickFilter === 'checklist') {
    return UI.emptyStateHTML({
      ico: 'checklist', title: 'Tidak ada checklist',
      text: 'Belum ada catatan dengan daftar tugas pada tampilan ini.',
      actions: `<button class="btn btn-ghost" data-action="quick-filter" data-filter="all">Tampilkan semua</button>`
    });
  }
  if (state.quickFilter === 'image') {
    return UI.emptyStateHTML({
      ico: 'image', title: 'Tidak ada gambar',
      text: 'Catatan dengan gambar akan muncul di sini.',
      actions: `<button class="btn btn-ghost" data-action="quick-filter" data-filter="all">Tampilkan semua</button>`
    });
  }
  if (state.quickFilter === 'audio') {
    return UI.emptyStateHTML({
      ico: 'mic', title: 'Belum ada rekaman',
      text: 'Rekam suara langsung dari editor catatan.',
      actions: `<button class="btn btn-ghost" data-action="quick-filter" data-filter="all">Tampilkan semua</button>`
    });
  }

  switch (page) {
    case 'favorites':
      return UI.emptyStateHTML({
        ico: 'star', title: 'Belum ada favorit',
        text: 'Tandai catatan penting sebagai favorit agar mudah ditemukan lagi.',
        actions: `<button class="btn btn-ghost" data-action="nav" data-page="notes">Jelajahi catatan</button>`
      });
    case 'archive':
      return UI.emptyStateHTML({
        ico: 'archive', title: 'Arsip kosong',
        text: 'Catatan yang kamu arsipkan akan tersimpan rapi di sini.',
        actions: `<button class="btn btn-ghost" data-action="nav" data-page="notes">Kembali ke catatan</button>`
      });
    case 'trash':
      return UI.emptyStateHTML({
        ico: 'trash', title: 'Sampah kosong',
        text: 'Catatan yang dihapus akan muncul di sini selama 30 hari sebelum dibersihkan otomatis.',
        actions: `<button class="btn btn-ghost" data-action="nav" data-page="notes">Kembali ke catatan</button>`
      });
    case 'folder':
      return UI.emptyStateHTML({
        ico: 'folder', title: folder ? `Folder ${folder.name} masih kosong` : 'Folder kosong',
        text: 'Mulai tulis catatan pertama di folder ini.',
        actions: `<button class="btn btn-primary" data-action="new-note">${icon('plus', 17)} Catatan Baru</button>`
      });
    case 'tag':
      return UI.emptyStateHTML({
        ico: 'tag', title: 'Tidak ada catatan',
        text: `Belum ada catatan dengan tag #${state.params.tag || ''}.`,
        actions: `<button class="btn btn-ghost" data-action="nav" data-page="notes">Lihat semua catatan</button>`
      });
    default:
      return UI.emptyStateHTML({
        ico: 'note', title: 'Belum ada catatan',
        text: 'Tulis ide, pengingat, atau hal penting lainnya. Semua tersimpan di perangkatmu.',
        actions: `<button class="btn btn-primary" data-action="new-note">${icon('plus', 17)} Buat Catatan</button>`
      });
  }
}

function groupNotes(notes) {
  if (!notes.length) return [];
  if (state.view === 'trash') {
    if (!state.settings.groupByDate) return [{ label: 'Sampah', notes }];
    const buckets = new Map();
    for (const n of notes) {
      const label = dateGroupLabel(n.deletedAt || n.updatedAt);
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push(n);
    }
    return [...buckets.entries()].map(([label, list]) => ({ label, notes: list }));
  }

  const pinned = notes.filter((n) => n.isPinned);
  const rest = notes.filter((n) => !n.isPinned);
  const groups = [];
  if (pinned.length) groups.push({ label: 'Disematkan', notes: pinned });

  if (!state.settings.groupByDate) {
    if (rest.length) groups.push({ label: 'Catatan', notes: rest });
    return groups;
  }

  const buckets = new Map();
  for (const n of rest) {
    const label = dateGroupLabel(n.updatedAt);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(n);
  }
  for (const [label, list] of buckets.entries()) groups.push({ label, notes: list });
  return groups;
}

function renderCollection() {
  const { base, quickCounts, filtered } = computeCollection();
  const limited = filtered.slice(0, state.limit);
  const groups = groupNotes(limited);
  const folder = state.view === 'folder' ? findCategory(state.params.id) : null;
  const counts = getCounts();
  const emptyHTML = filtered.length ? '' : emptyHTMLForPage();

  els.content.className = 'content';
  els.content.innerHTML = UI.collectionHTML({
    page: state.view,
    meta: {
      ...viewMeta(),
      count: filtered.length,
      emptyHTML
    },
    groups,
    viewMode: state.settings.viewMode,
    selectionMode: state.selectionMode,
    selected: state.selected,
    query: '',
    quickFilter: state.quickFilter,
    quickCounts,
    categories: state.categories,
    trashCount: counts.trash,
    hasMore: filtered.length > limited.length,
    remaining: Math.max(0, filtered.length - limited.length),
    folder
  });

  const sub = els.appbar.querySelector('.appbar-sub');
  if (sub && ['folder', 'tag'].includes(state.view)) sub.textContent = `${filtered.length} catatan`;
  if (state.view === 'folder' && folder) {
    const bannerCount = els.content.querySelector('.folder-banner-main p');
    if (bannerCount) bannerCount.textContent = `${filtered.length} catatan`;
  }
}

function renderFolders() {
  els.content.className = 'content';
  els.content.innerHTML = UI.foldersPageHTML({
    categories: state.categories,
    notes: state.notes,
    activeFolderId: null
  });
}

function renderSettings() {
  const counts = getCounts();
  els.content.className = 'content';
  els.content.innerHTML = UI.settingsHTML({
    settings: state.settings,
    counts,
    lastBackupAt: state.settings.lastBackupAt
  });
  refreshStorageUI();
}

function renderPreview(note) {
  if (!note) return;
  const category = findCategory(note.categoryId);
  els.content.className = 'content';
  els.content.innerHTML = UI.notePreviewHTML({ note, category });
}

/* ============================================================
   Editor
   ============================================================ */

function updateEditorStats(stats) {
  const el = $('#editor-stats');
  if (!el) return;
  const minutes = stats.minutes || 1;
  el.textContent = `${stats.words} kata · ${stats.chars} karakter · ${minutes} mnt baca`;
}

function scheduleEditorSave() {
  if (!state.editor) return;
  state.dirty = true;
  setSaveStatus('saving');
  state.saveSoon?.();
}

function updateEditorPaper(note) {
  const paper = $('#editor-paper');
  if (!paper) return;
  const font = note.font || state.settings.editorFont || 'sans';
  paper.className = `editor-paper paper-${note.paper || 'blank'} font-${font}${note.color ? ' has-tint' : ''}`;
  if (note.color) paper.style.setProperty('--note-tint', note.color);
  else paper.style.removeProperty('--note-tint');
}

function updateEditorFolderChip(note) {
  const chip = $('#editor-folder-chip');
  if (!chip) return;
  const cat = findCategory(note.categoryId);
  chip.innerHTML = `
    <span class="meta-dot" style="background:${esc(cat?.color || 'transparent')}"></span>
    <span>${esc(cat?.name || 'Tanpa folder')}</span>
    ${icon('chevronDown', 13)}`;
}

function tagChipHTML(tag) {
  return `<span class="tag-chip">#${esc(tag)}<button type="button" data-action="tag-remove" data-tag="${esc(tag)}" aria-label="Hapus tag ${esc(tag)}">${icon('close', 11)}</button></span>`;
}

async function saveNoteMeta(note) {
  try {
    await DB.putOne('notes', note);
  } catch (err) {
    console.error('[save meta]', err);
    toast('Gagal menyimpan perubahan.', 'error');
  }
}

async function addEditorTag(raw) {
  if (!state.note) return;
  const tag = String(raw || '').trim().replace(/^#/, '').replace(/\s+/g, '-').toLowerCase();
  if (!tag) return;
  if (!/^[\p{L}\p{N}_-]{1,30}$/u.test(tag)) {
    toast('Tag hanya boleh berisi huruf, angka, garis bawah, atau tanda hubung.', 'error');
    return;
  }
  if (!state.note.tags.includes(tag)) {
    state.note.tags.push(tag);
    state.note.updatedAt = Date.now();
    await saveNoteMeta(state.note);
    const chips = $('#editor-tag-chips');
    if (chips) chips.insertAdjacentHTML('beforeend', tagChipHTML(tag));
    const input = $('#tag-input');
    if (input) input.placeholder = '+ tag';
    updateEditorMetaLabels();
    toast(`Tag #${tag} ditambahkan`, 'success', 1500);
  }
}

async function removeEditorTag(tag) {
  if (!state.note) return;
  state.note.tags = state.note.tags.filter((t) => t !== tag);
  state.note.updatedAt = Date.now();
  await saveNoteMeta(state.note);
  const input = $('#tag-input');
  if (input) input.placeholder = state.note.tags.length ? '+ tag' : 'Tambah tag';
  updateEditorMetaLabels();
}

function updateEditorMetaLabels() {
  if (!state.note) return;
  const quick = $('#editor-updated');
  if (quick) quick.innerHTML = `${icon('clock', 13)} ${relativeTime(state.note.updatedAt)}`;
  const full = $('#editor-updated-full');
  if (full) full.textContent = fmtDateTime(state.note.updatedAt);
}

function persistEditor(reason = 'auto') {
  const run = async () => {
    if (!state.editor || !state.note) return;
    const note = state.note;
    const data = state.editor.getData();
    const content = data.content; // sudah disanitasi oleh editor.getData()
    const changed = data.title !== note.title || content !== note.content;
    if (!changed) {
      if (reason !== 'auto') setSaveStatus('saved');
      state.dirty = false;
      return;
    }

    const now = Date.now();
    const session = state.editorSession;
    const previous = {
      title: note.title || '',
      content: note.content || '',
      plainText: note.plainText || ''
    };

    if (session && (previous.title || previous.content) && now - session.lastRevisionAt >= REVISION_INTERVAL) {
      try {
        await DB.addRevision({
          id: uid(),
          noteId: note.id,
          title: previous.title,
          content: previous.content,
          plainText: previous.plainText,
          wordCount: countWords(previous.plainText),
          createdAt: now
        });
        await DB.pruneRevisions(note.id, 24);
        note.revAt = now;
        session.lastRevisionAt = now;
      } catch (err) {
        console.warn('[revision]', err);
      }
    }

    note.title = data.title.slice(0, 240);
    note.content = content;
    note.plainText = htmlToText(content);
    note.wordCount = countWords(note.plainText);
    note.updatedAt = now;

    try {
      await DB.putOne('notes', note);
    } catch (err) {
      console.error('[save note]', err);
      setSaveStatus('error');
      toast('Gagal menyimpan catatan. Periksa penyimpanan perangkat.', 'error');
      return;
    }

    state.dirty = false;
    if (state.editor) setSaveStatus('saved');
    updateEditorMetaLabels();
    document.title = `${note.title || 'Catatan'} — Catatan`;
  };

  state.saveQueue = (state.saveQueue || Promise.resolve()).then(run, run);
  return state.saveQueue;
}

function isNoteEmpty(note) {
  if (!note) return true;
  if (String(note.title || '').trim()) return false;
  if (String(note.plainText || '').trim()) return false;
  if (/<(img|audio|table)[\s>]/i.test(note.content || '')) return false;
  return true;
}

async function leaveEditorSession() {
  if (!state.editor && !state.note) return;
  state.saveSoon?.cancel?.();
  if (state.editor && state.note) {
    await persistEditor('leave');
    if (isNoteEmpty(state.note)) {
      const emptyId = state.note.id;
      state.notes = state.notes.filter((n) => n.id !== emptyId);
      try {
        await DB.deleteOne('notes', emptyId);
        await DB.deleteRevisions(emptyId);
      } catch (_) { /* noop */ }
    }
  }
  try { state.editor?.destroy(); } catch (_) { /* noop */ }
  state.editor = null;
  state.note = null;
  state.editorSession = null;
  state.saveQueue = null;
  state.dirty = false;
  state.focusMode = false;
  state.saveStatus = 'saved';
  document.body.classList.remove('is-editor', 'focus-mode');
  document.title = 'Catatan';
}

async function reloadEditorView(note) {
  if (state.view !== 'editor') return;
  try { state.editor?.destroy(); } catch (_) { /* noop */ }
  state.editor = null;
  state.saveQueue = null;
  state.dirty = false;
  state.note = note;
  updateChrome();
  renderEditorContent(note);
}

function renderEditorContent(note) {
  if (!note) return;
  Modals.prepareNavigation();
  state.note = note;
  state.saveStatus = 'saved';
  state.dirty = false;
  state.editorSession = {
    lastRevisionAt: note.revAt || 0,
    sessionTitle: note.title,
    sessionContent: note.content
  };

  const category = findCategory(note.categoryId);
  els.content.className = 'content editor-content';
  els.content.innerHTML = UI.editorHTML({ note, category, settings: state.settings });

  state.saveSoon = debounce(() => { persistEditor('auto'); }, 650);

  state.editor = mountEditor({
    titleEl: $('#editor-title'),
    bodyEl: $('#editor-body'),
    toolbarEl: $('#editor-toolbar-wrap'),
    note,
    settings: state.settings,
    callbacks: {
      onInput: scheduleEditorSave,
      onStats: updateEditorStats,
      onToast: (message, kind) => toast(message, kind || 'info'),
      onImageProcessing: (busy, message) => {
        if (busy) {
          setSaveStatus('saving');
          toast(message || 'Memproses gambar…', 'info', 1600);
        } else {
          setSaveStatus(state.dirty ? 'saving' : 'saved');
        }
      },
      onImageClick: async (img, api) => {
        const widthMatch = String(img.style.width || '').match(/([\d.]+)%/);
        const result = await Modals.openImageOptions({
          alt: img.getAttribute('alt') || '',
          width: widthMatch ? Number(widthMatch[1]) : 100
        });
        if (!result) return;
        if (result.action === 'remove') api.removeImage(img);
        else api.updateImage(img, { width: result.width, alt: result.alt });
        scheduleEditorSave();
      },
      requestDrawing: () => openDrawingModal(),
      requestTable: () => Modals.openTableDialog(),
      requestLink: (args) => Modals.openLinkDialog(args || {}),
      requestAudio: () => openAudioRecorder()
    }
  });

  updateEditorMetaLabels();
  const stats = state.editor.getStats();
  updateEditorStats(stats);
  setSaveStatus('saved');
  document.title = `${note.title || 'Catatan'} — Catatan`;

  if (state.focusNewNote) {
    state.focusNewNote = false;
    setTimeout(() => {
      try { state.editor?.focusTitle(); } catch (_) { /* noop */ }
    }, 220);
  }
}

/* ============================================================
   Pencarian
   ============================================================ */

function searchPool() {
  const parsed = parseSearchQuery(state.query);
  const filters = state.searchFilters;
  const is = parsed.filters.is || [];
  let pool;

  if (is.includes('trash')) pool = state.notes.filter((n) => n.isDeleted);
  else pool = state.notes.filter((n) => !n.isDeleted);

  if (filters.archived || is.includes('archived')) pool = pool.filter((n) => n.isArchived);
  if (is.includes('favorite') || filters.favorite) pool = pool.filter((n) => n.isFavorite);
  if (is.includes('pinned')) pool = pool.filter((n) => n.isPinned);
  if (is.includes('locked')) pool = [];
  if (filters.checklist || (parsed.filters.has || []).includes('checklist')) {
    pool = pool.filter((n) => hasChecklist(n.content));
  }
  if (filters.image || (parsed.filters.has || []).includes('image')) {
    pool = pool.filter((n) => hasImage(n.content));
  }
  if (filters.audio || (parsed.filters.has || []).includes('audio')) {
    pool = pool.filter((n) => /<audio[\s>]/i.test(n.content || ''));
  }
  if ((parsed.filters.has || []).includes('link')) pool = pool.filter((n) => /<a[\s>]/i.test(n.content || ''));
  if ((parsed.filters.has || []).includes('table')) pool = pool.filter((n) => /<table[\s>]/i.test(n.content || ''));

  if (state.searchFolderId) pool = pool.filter((n) => n.categoryId === state.searchFolderId);

  if (parsed.tags.length) {
    pool = pool.filter((n) => {
      const tags = noteTags(n);
      return parsed.tags.every((tag) => tags.includes(tag));
    });
  }
  if (parsed.filters.before) pool = pool.filter((n) => (n.updatedAt || 0) <= parsed.filters.before);
  if (parsed.filters.after) pool = pool.filter((n) => (n.updatedAt || 0) >= parsed.filters.after);

  const terms = parsed.text.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) {
    pool = pool.filter((n) => {
      const cat = findCategory(n.categoryId);
      const haystack = [
        n.title || '', n.plainText || '', (n.tags || []).join(' '), cat?.name || ''
      ].join(' ').toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }

  return sortNotes(pool);
}

function searchSummary() {
  return {
    text: parseSearchQuery(state.query).text,
    tags: parseSearchQuery(state.query).tags
  };
}

function renderSearch() {
  const summary = searchSummary();
  const results = searchPool();
  state.currentFiltered = results;
  const folder = state.searchFolderId ? findCategory(state.searchFolderId) : null;
  const groups = results.length ? [{ label: 'Hasil pencarian', notes: results.slice(0, 200) }] : [];

  els.content.className = 'content';
  els.content.innerHTML = UI.searchPageHTML({
    query: state.query,
    highlightQuery: summary.text,
    filters: state.searchFilters,
    folder,
    groups,
    resultCount: results.length,
    categories: state.categories,
    recentSearches: Array.isArray(state.settings.recentSearches) ? state.settings.recentSearches : []
  });

  if (state.pendingSearchFocus) {
    state.pendingSearchFocus = false;
    setTimeout(focusSearchInput, 120);
  }
}

function refreshSearchResults() {
  if (state.view !== 'search') return;
  renderSearch();
  scheduleSearchUrl();
}

function scheduleSearchUrl() {
  if (state.view !== 'search') return;
  if (!state.searchUrlSoon) {
    state.searchUrlSoon = debounce(() => {
      const target = state.query ? `#/search?q=${encodeURIComponent(state.query)}` : '#/search';
      try { history.replaceState(history.state || {}, '', target); } catch (_) { /* noop */ }
      state.currentHash = target;
    }, 350);
  }
  state.searchUrlSoon();
}

const saveRecentSearchSoon = debounce(() => {
  const q = state.query.trim();
  if (!q) return;
  const list = [q, ...(state.settings.recentSearches || []).filter((item) => item !== q)].slice(0, 8);
  state.settings.recentSearches = list;
  DB.setSetting('recentSearches', list).catch(() => {});
}, 1500);

function focusSearchInput() {
  const input = $('#search-input');
  if (!input) return;
  try {
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  } catch (_) { /* noop */ }
}

function clearSearchState() {
  state.query = '';
  state.searchFilters = EMPTY_FILTERS();
  state.searchFolderId = null;
  const input = $('#search-input');
  if (input) input.value = '';
  refreshSearchResults();
  focusSearchInput();
}

async function openSearch() {
  if (state.view === 'search') {
    focusSearchInput();
    return;
  }
  state.searchReturn = location.hash || '#/notes';
  state.query = '';
  state.searchFilters = EMPTY_FILTERS();
  state.searchFolderId = null;
  state.pendingSearchFocus = true;
  navigate('#/search');
}

/* ============================================================
   CRUD catatan
   ============================================================ */

async function createNote({ categoryId = null, tags = [] } = {}) {
  const now = Date.now();
  const note = normalizeNote({
    id: uid(),
    title: '',
    content: '',
    categoryId,
    tags,
    font: state.settings.editorFont,
    paper: 'blank',
    createdAt: now,
    updatedAt: now
  });
  try {
    await DB.putOne('notes', note);
  } catch (err) {
    console.error('[create note]', err);
    toast('Gagal membuat catatan baru.', 'error');
    return;
  }
  state.notes.unshift(note);
  const current = state.view;
  state.editorReturn = current === 'editor' ? '#/notes' : (location.hash || '#/notes');
  state.focusNewNote = true;
  navigate(`#/note/${note.id}`);
}

async function openNoteById(id) {
  const note = findNote(id);
  if (!note) {
    toast('Catatan tidak ditemukan.', 'error');
    return;
  }
  if (note.isDeleted) {
    state.previewReturn = location.hash || '#/trash';
    navigate(`#/preview/${id}`);
    return;
  }
  state.editorReturn = location.hash || '#/notes';
  navigate(`#/note/${id}`);
}

async function toggleNoteFlag(note, key) {
  note[key] = !note[key];
  await saveNoteMeta(note);
  buzz(8);
  const messages = {
    isPinned: note.isPinned ? 'Catatan disematkan' : 'Sematan dilepas',
    isFavorite: note.isFavorite ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit',
    isArchived: note.isArchived ? 'Dipindahkan ke arsip' : 'Dikeluarkan dari arsip'
  };
  toast(messages[key] || 'Catatan diperbarui', 'success');
  if (state.view === 'editor') renderAppbarOnly();
  else refreshPage({ keepScroll: true });
}

async function moveNotesToFolder(notes, folderId) {
  for (const note of notes) note.categoryId = folderId;
  try {
    await DB.putMany('notes', notes);
  } catch (err) {
    toast('Gagal memindahkan catatan.', 'error');
    return;
  }
  toast(folderId ? `Dipindahkan ke ${findCategory(folderId)?.name || 'folder'}` : 'Dipindahkan ke tanpa folder', 'success');
  if (state.view === 'editor' && state.note) updateEditorFolderChip(state.note);
  else refreshPage({ keepScroll: true });
}

async function trashNotes(notes, { confirm = true } = {}) {
  if (!notes.length) return false;
  if (confirm) {
    const names = notes.slice(0, 3).map((n) => `<li>${esc(n.title || 'Tanpa judul')}</li>`).join('');
    const more = notes.length > 3 ? `<li>dan ${notes.length - 3} catatan lainnya</li>` : '';
    const ok = await Modals.confirmDialog({
      title: notes.length > 1 ? `Hapus ${notes.length} catatan?` : 'Pindahkan ke sampah?',
      message: notes.length > 1
        ? 'Catatan akan dipindahkan ke sampah dan dihapus permanen setelah 30 hari.'
        : 'Catatan akan dipindahkan ke sampah dan dihapus permanen setelah 30 hari.',
      details: `<ul class="dialog-list">${names}${more}</ul>`,
      confirmText: notes.length > 1 ? 'Pindahkan semua' : 'Pindahkan ke sampah',
      danger: true,
      iconName: 'trash'
    });
    if (!ok) return false;
  }

  const now = Date.now();
  for (const note of notes) {
    note.isDeleted = true;
    note.deletedAt = now;
    note.isArchived = false;
  }
  try {
    await DB.putMany('notes', notes);
  } catch (err) {
    toast('Gagal menghapus catatan.', 'error');
    return false;
  }
  state.selectionMode = false;
  state.selected.clear();
  buzz(12);
  toast(notes.length > 1 ? `${notes.length} catatan dipindahkan ke sampah` : 'Catatan dipindahkan ke sampah', 'success');

  if (state.view === 'editor' && state.note && notes.some((n) => n.id === state.note.id)) {
    navigate(state.editorReturn || '#/notes');
  } else if (state.view === 'preview' && notes.some((n) => n.id === state.params.id)) {
    navigate(state.previewReturn || '#/trash');
  } else {
    refreshPage({ keepScroll: true });
  }
  return true;
}

async function restoreNotes(notes) {
  if (!notes.length) return;
  for (const note of notes) {
    note.isDeleted = false;
    note.deletedAt = null;
    note.updatedAt = Date.now();
  }
  try {
    await DB.putMany('notes', notes);
  } catch (err) {
    toast('Gagal memulihkan catatan.', 'error');
    return;
  }
  state.selectionMode = false;
  state.selected.clear();
  toast(notes.length > 1 ? `${notes.length} catatan dipulihkan` : 'Catatan dipulihkan', 'success');
  if (state.view === 'preview' && notes.length === 1) {
    state.editorReturn = state.previewReturn || '#/trash';
    navigate(`#/note/${notes[0].id}`);
  } else {
    refreshPage({ keepScroll: true });
  }
}

async function deletePermanently(notes) {
  if (!notes.length) return false;
  const ok = await Modals.confirmDialog({
    title: notes.length > 1 ? `Hapus permanen ${notes.length} catatan?` : 'Hapus permanen?',
    message: 'Tindakan ini tidak dapat dibatalkan. Catatan dan riwayat versinya akan dihapus dari perangkat.',
    confirmText: 'Hapus permanen',
    danger: true,
    iconName: 'trashX'
  });
  if (!ok) return false;

  const ids = notes.map((n) => n.id);
  try {
    await DB.deleteMany('notes', ids);
    await Promise.all(ids.map((id) => DB.deleteRevisions(id).catch(() => {})));
  } catch (err) {
    toast('Gagal menghapus catatan.', 'error');
    return false;
  }
  state.notes = state.notes.filter((n) => !ids.includes(n.id));
  state.selectionMode = false;
  state.selected.clear();
  toast(notes.length > 1 ? `${notes.length} catatan dihapus permanen` : 'Catatan dihapus permanen', 'success');
  if (state.view === 'preview') navigate(state.previewReturn || '#/trash');
  else refreshPage({ keepScroll: true });
  return true;
}

async function emptyTrash() {
  const notes = state.notes.filter((n) => n.isDeleted);
  if (!notes.length) {
    toast('Sampah sudah kosong.', 'info');
    return;
  }
  const ok = await Modals.confirmDialog({
    title: 'Kosongkan sampah?',
    message: `Semua ${notes.length} catatan di sampah akan dihapus permanen beserta riwayat versinya.`,
    confirmText: 'Kosongkan sampah',
    danger: true,
    iconName: 'trashX'
  });
  if (!ok) return;
  const ids = notes.map((n) => n.id);
  try {
    await DB.deleteMany('notes', ids);
    await Promise.all(ids.map((id) => DB.deleteRevisions(id).catch(() => {})));
  } catch (err) {
    toast('Gagal mengosongkan sampah.', 'error');
    return;
  }
  state.notes = state.notes.filter((n) => !ids.includes(n.id));
  toast('Sampah dikosongkan', 'success');
  refreshPage({ keepScroll: true });
}

async function purgeExpiredTrash() {
  if (!state.settings.autoPurgeTrash) return;
  const cutoff = Date.now() - TRASH_DAYS * 86400000;
  const expired = state.notes.filter((n) => n.isDeleted && n.deletedAt && n.deletedAt < cutoff);
  if (!expired.length) return;
  const ids = expired.map((n) => n.id);
  try {
    await DB.deleteMany('notes', ids);
    await Promise.all(ids.map((id) => DB.deleteRevisions(id).catch(() => {})));
  } catch (err) {
    console.warn('[purge trash]', err);
    return;
  }
  state.notes = state.notes.filter((n) => !ids.includes(n.id));
}

async function duplicateNote(note) {
  const now = Date.now();
  const copy = normalizeNote({
    ...note,
    id: uid(),
    title: note.title ? `${note.title} (salinan)` : '',
    isPinned: false,
    isFavorite: false,
    isArchived: false,
    isDeleted: false,
    deletedAt: null,
    revAt: 0,
    createdAt: now,
    updatedAt: now
  });
  try {
    await DB.putOne('notes', copy);
  } catch (err) {
    toast('Gagal membuat salinan.', 'error');
    return;
  }
  state.notes.unshift(copy);
  toast('Salinan catatan dibuat', 'success');
  refreshPage({ keepScroll: true });
}

async function copyNote(note) {
  const text = [note.title || 'Tanpa judul', '', note.plainText || htmlToText(note.content || '')].join('\n').trim();
  const ok = await copyText(text || '(Catatan kosong)');
  toast(ok ? 'Teks catatan disalin' : 'Gagal menyalin teks', ok ? 'success' : 'error');
}

async function shareNote(note) {
  const text = [note.title || 'Tanpa judul', '', note.plainText || htmlToText(note.content || '')].join('\n').trim();
  if (navigator.share) {
    try {
      await navigator.share({ title: note.title || 'Catatan', text: text || '(Catatan kosong)' });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  const ok = await copyText(text || '(Catatan kosong)');
  toast(ok ? 'Teks catatan disalin untuk dibagikan' : 'Gagal membagikan catatan', ok ? 'success' : 'error');
}

function exportNoteMarkdown(note) {
  const md = Backup.notesToMarkdown([note], state.categories);
  const name = sanitizeFilename(note.title || 'catatan', 'catatan');
  downloadText(md, `${name}.md`, 'text/markdown;charset=utf-8');
  toast('Catatan diekspor sebagai Markdown', 'success');
}

async function applyRevision(note, revision) {
  if (!note || !revision) return;
  if (note.title || note.content) {
    try {
      await DB.addRevision({
        id: uid(),
        noteId: note.id,
        title: note.title,
        content: note.content,
        plainText: note.plainText || '',
        wordCount: note.wordCount || countWords(note.plainText || ''),
        createdAt: Date.now()
      });
      await DB.pruneRevisions(note.id, 24);
    } catch (err) {
      console.warn('[revision backup]', err);
    }
  }
  note.title = revision.title || '';
  note.content = sanitizeHTML(revision.content || '');
  note.plainText = htmlToText(note.content);
  note.wordCount = countWords(note.plainText);
  note.updatedAt = Date.now();
  note.revAt = Date.now();
  await saveNoteMeta(note);
  toast('Versi lama dipulihkan', 'success');
  if (state.view === 'editor' && state.note?.id === note.id) {
    await reloadEditorView(note);
  } else {
    refreshPage({ keepScroll: true });
  }
}

async function handleVersions(note) {
  if (state.view === 'editor' && state.note?.id === note.id && state.editor) {
    state.saveSoon?.cancel?.();
    await persistEditor('manual');
  }
  let revisions = [];
  try { revisions = await DB.getRevisions(note.id); } catch (err) { console.warn(err); }
  const result = await Modals.openVersions({ note, revisions });
  if (!result) return;
  if (result.action === 'preview') {
    const restore = await Modals.openVersionPreview({ revision: result.revision });
    if (restore) await applyRevision(note, result.revision);
    return;
  }
  if (result.action === 'restore') {
    const ok = await Modals.confirmDialog({
      title: 'Pulihkan versi ini?',
      message: 'Isi catatan saat ini akan disimpan sebagai versi lama sebelum diganti.',
      confirmText: 'Pulihkan versi',
      iconName: 'restore'
    });
    if (ok) await applyRevision(note, result.revision);
  }
}

async function runNoteAction(note, action) {
  switch (action) {
    case 'open':
      await openNoteById(note.id);
      break;
    case 'pin':
      await toggleNoteFlag(note, 'isPinned');
      break;
    case 'favorite':
      await toggleNoteFlag(note, 'isFavorite');
      break;
    case 'archive':
      await toggleNoteFlag(note, 'isArchived');
      break;
    case 'move': {
      const picked = await Modals.openFolderPicker({
        categories: state.categories,
        currentId: note.categoryId,
        counts: categoryCounts()
      });
      if (picked) await moveNotesToFolder([note], picked.folderId);
      break;
    }
    case 'style': {
      const style = await Modals.openNoteStyle({ note, settings: state.settings });
      if (!style) break;
      note.color = style.color;
      note.paper = style.paper;
      note.font = style.font;
      await saveNoteMeta(note);
      if (state.view === 'editor' && state.note?.id === note.id) updateEditorPaper(note);
      else refreshPage({ keepScroll: true });
      toast('Tampilan catatan diperbarui', 'success');
      break;
    }
    case 'versions':
      await handleVersions(note);
      break;
    case 'duplicate':
      await duplicateNote(note);
      break;
    case 'copy':
      await copyNote(note);
      break;
    case 'share':
      await shareNote(note);
      break;
    case 'markdown':
      exportNoteMarkdown(note);
      break;
    case 'info':
      Modals.openNoteInfo({
        note,
        category: findCategory(note.categoryId),
        stats: state.view === 'editor' && state.editor ? state.editor.getStats() : null
      });
      break;
    case 'delete':
      await trashNotes([note], { confirm: state.settings.confirmDelete !== false });
      break;
    case 'restore':
      await restoreNotes([note]);
      break;
    case 'delete-permanent':
      await deletePermanently([note]);
      break;
    default:
      break;
  }
}

async function openNoteMenu(note) {
  if (!note) return;
  const result = await Modals.openNoteMenu({
    note,
    categories: state.categories,
    settings: state.settings,
    fromEditor: state.view === 'editor'
  });
  if (!result) return;
  await runNoteAction(note, result.action);
}

/* ============================================================
   Folder
   ============================================================ */

async function createFolder() {
  const result = await Modals.openFolderForm({});
  if (!result) return;
  const now = Date.now();
  const category = {
    id: uid(),
    name: result.name,
    color: result.color,
    icon: result.icon,
    createdAt: now,
    updatedAt: now
  };
  try {
    await DB.putOne('categories', category);
  } catch (err) {
    toast('Gagal membuat folder.', 'error');
    return;
  }
  state.categories.push(category);
  toast(`Folder “${category.name}” dibuat`, 'success');
  refreshPage({ keepScroll: true });
}

async function editFolder(category) {
  if (!category) return;
  const result = await Modals.openFolderForm({ category });
  if (!result) return;
  category.name = result.name;
  category.color = result.color;
  category.icon = result.icon;
  category.updatedAt = Date.now();
  try {
    await DB.putOne('categories', category);
  } catch (err) {
    toast('Gagal menyimpan folder.', 'error');
    return;
  }
  toast('Folder diperbarui', 'success');
  refreshPage({ keepScroll: true });
}

async function deleteFolder(category) {
  if (!category) return;
  const count = state.notes.filter((n) => !n.isDeleted && n.categoryId === category.id).length;
  const ok = await Modals.confirmDialog({
    title: 'Hapus folder?',
    message: count
      ? `Folder “${category.name}” akan dihapus. ${count} catatan di dalamnya tetap aman dan menjadi tanpa folder.`
      : `Folder “${category.name}” akan dihapus.`,
    confirmText: 'Hapus folder',
    danger: true,
    iconName: 'trash'
  });
  if (!ok) return;
  const affected = state.notes.filter((n) => n.categoryId === category.id);
  for (const note of affected) note.categoryId = null;
  try {
    if (affected.length) await DB.putMany('notes', affected);
    await DB.deleteOne('categories', category.id);
  } catch (err) {
    toast('Gagal menghapus folder.', 'error');
    return;
  }
  state.categories = state.categories.filter((c) => c.id !== category.id);
  if (state.view === 'folder' && state.params.id === category.id) {
    navigate('#/folders', { replace: true });
  } else {
    refreshPage({ keepScroll: true });
  }
  toast('Folder dihapus. Catatan tetap aman.', 'success');
}

async function handleFolderMenu(category) {
  if (!category) return;
  const count = state.notes.filter((n) => !n.isDeleted && n.categoryId === category.id).length;
  const result = await Modals.openFolderMenu({ category, count });
  if (!result) return;
  if (result.action === 'new-note') {
    state.editorReturn = `#/folder/${category.id}`;
    await createNote({ categoryId: category.id });
  } else if (result.action === 'edit') {
    await editFolder(category);
  } else if (result.action === 'copy-name') {
    const ok = await copyText(category.name);
    toast(ok ? 'Nama folder disalin' : 'Gagal menyalin', ok ? 'success' : 'error');
  } else if (result.action === 'delete') {
    await deleteFolder(category);
  }
}

/* ============================================================
   Pilihan & aksi massal
   ============================================================ */

function enterSelection(id = null) {
  state.selectionMode = true;
  state.selected.clear();
  if (id) state.selected.add(id);
  buzz(10);
  updateChrome();
  renderCollection();
}

function exitSelection() {
  state.selectionMode = false;
  state.selected.clear();
  updateChrome();
  renderCollection();
}

function toggleSelected(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  buzz(6);
  updateChrome();
  const y = window.scrollY;
  renderCollection();
  requestAnimationFrame(() => window.scrollTo(0, y));
}

function selectAllOnPage() {
  for (const note of state.currentFiltered) state.selected.add(note.id);
  updateChrome();
  const y = window.scrollY;
  renderCollection();
  requestAnimationFrame(() => window.scrollTo(0, y));
}

async function bulkAction(action) {
  const notes = state.notes.filter((n) => state.selected.has(n.id));
  if (!notes.length) return;
  switch (action) {
    case 'pin': {
      const value = !notes.every((n) => n.isPinned);
      notes.forEach((n) => { n.isPinned = value; });
      await DB.putMany('notes', notes);
      toast(value ? 'Catatan disematkan' : 'Sematan dilepas', 'success');
      exitSelection();
      break;
    }
    case 'favorite': {
      const value = !notes.every((n) => n.isFavorite);
      notes.forEach((n) => { n.isFavorite = value; });
      await DB.putMany('notes', notes);
      toast(value ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit', 'success');
      exitSelection();
      break;
    }
    case 'archive': {
      const value = !notes.every((n) => n.isArchived);
      notes.forEach((n) => { n.isArchived = value; });
      await DB.putMany('notes', notes);
      toast(value ? 'Dipindahkan ke arsip' : 'Dikeluarkan dari arsip', 'success');
      exitSelection();
      break;
    }
    case 'move': {
      const picked = await Modals.openFolderPicker({
        categories: state.categories,
        currentId: null,
        counts: categoryCounts()
      });
      if (picked) await moveNotesToFolder(notes, picked.folderId);
      exitSelection();
      break;
    }
    case 'delete':
      await trashNotes(notes, { confirm: true });
      break;
    case 'restore':
      await restoreNotes(notes);
      break;
    case 'delete-permanent':
      await deletePermanently(notes);
      break;
    default:
      break;
  }
}

/* ============================================================
   Pengaturan & data
   ============================================================ */

async function updateSettings(patch) {
  Object.assign(state.settings, patch);
  syncBootPrefs();
  try {
    await DB.setSettings(patch);
  } catch (err) {
    console.error('[settings]', err);
    toast('Gagal menyimpan pengaturan.', 'error');
  }
}

async function setTheme(value) {
  await updateSettings({ theme: value });
  applyTheme();
  syncBootPrefs();
  $$('[data-action="set-theme"]').forEach((btn) => btn.classList.toggle('active', btn.dataset.value === value));
  const row = $(`[data-action="set-theme"][data-value="${value}"]`)?.closest('.settings-row');
  const sub = row?.querySelector('.settings-sub');
  const label = UI.THEMES.find(([v]) => v === value)?.[1] || 'Sistem';
  if (sub) sub.textContent = `Saat ini: ${label}`;
  toast(`Tema: ${label}`, 'success', 1600);
}

async function setAccent(value) {
  await updateSettings({ accent: value });
  applyAccent();
  $$('.accent-swatch').forEach((btn) => btn.classList.toggle('active', btn.dataset.value === value));
  toast('Warna aksen diperbarui', 'success', 1600);
}

async function setViewMode(value) {
  await updateSettings({ viewMode: value });
  $$('[data-action="set-view"]').forEach((btn) => btn.classList.toggle('active', btn.dataset.value === value));
}

async function setEditorFont(value) {
  await updateSettings({ editorFont: value });
  $$('[data-action="set-font"]').forEach((btn) => btn.classList.toggle('active', btn.dataset.value === value));
}

async function toggleSetting(key) {
  const value = !state.settings[key];
  state.settings[key] = value;
  await updateSettings({ [key]: value });
  const btn = $(`[data-action="toggle-setting"][data-key="${key}"]`);
  if (btn) {
    btn.classList.toggle('on', value);
    btn.setAttribute('aria-checked', value ? 'true' : 'false');
  }
  if (key === 'spellcheck' && state.editor) state.editor.setSpellcheck(value);
  buzz(6);
}

async function refreshStorageUI(force = false) {
  if (storageRefreshing) return;
  if (!force && Date.now() - lastStorageRefresh < 4000) return;
  lastStorageRefresh = Date.now();
  storageRefreshing = true;
  try {
    const estimate = await DB.storageEstimate();
    const usage = Number(estimate?.usage) || 0;
    const quota = Number(estimate?.quota) || 0;
    const percent = quota ? clamp((usage / quota) * 100, 0, 100) : 0;

    const sideLabel = $('#side-storage-label');
    const sideFill = $('#side-storage-fill');
    if (sideLabel) sideLabel.textContent = formatBytes(usage);
    if (sideFill) sideFill.style.width = `${percent}%`;

    const used = $('#storage-used');
    const fill = $('#storage-fill');
    const detail = $('#storage-detail');
    if (used) used.textContent = formatBytes(usage);
    if (fill) fill.style.width = `${percent}%`;
    if (detail) {
      detail.textContent = quota
        ? `${percent.toFixed(1)}% dari ${formatBytes(quota)} tersedia`
        : 'Perkiraan pemakaian penyimpanan browser';
    }
  } catch (err) {
    console.warn('[storage]', err);
  } finally {
    storageRefreshing = false;
  }
}

function maybeRefreshStorage() {
  refreshStorageUI(false);
}

async function exportBackup() {
  try {
    await Backup.exportToFile();
    const now = Date.now();
    state.settings.lastBackupAt = now;
    await DB.setSetting('lastBackupAt', now);
    const label = $('#last-backup-label');
    if (label) label.textContent = fmtDateTime(now);
    toast('Backup berhasil dibuat', 'success');
  } catch (err) {
    console.error('[export]', err);
    toast(err.message || 'Gagal membuat backup.', 'error');
  }
}

function exportMarkdown() {
  const notes = sortNotes(state.notes.filter((n) => !n.isDeleted));
  if (!notes.length) {
    toast('Belum ada catatan untuk diekspor.', 'info');
    return;
  }
  const md = Backup.notesToMarkdown(notes, state.categories);
  const date = new Date().toISOString().slice(0, 10);
  downloadText(md, `catatan-${date}.md`, 'text/markdown;charset=utf-8');
  toast(`${notes.length} catatan diekspor`, 'success');
}

async function reloadData() {
  const [notes, categories, settingRows] = await Promise.all([
    DB.getAll('notes'),
    DB.getAll('categories'),
    DB.getAllSettings()
  ]);
  state.notes = (notes || []).map(normalizeNote);
  state.categories = (categories || []).map((c) => ({
    id: c.id || uid(),
    name: String(c.name || 'Folder'),
    color: c.color || '#5b7cfa',
    icon: c.icon || 'folder',
    createdAt: Number(c.createdAt) || Date.now(),
    updatedAt: Number(c.updatedAt) || Number(c.createdAt) || Date.now()
  }));
  const map = Object.fromEntries((settingRows || []).map((row) => [row.key, row.value]));
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...map,
    shortcutLabel: `${modKey} N`
  };
  if (!Array.isArray(state.settings.recentSearches)) state.settings.recentSearches = [];
  if (!['light', 'dark', 'system'].includes(state.settings.theme)) state.settings.theme = 'system';
  if (!['list', 'grid'].includes(state.settings.viewMode)) state.settings.viewMode = 'list';
  if (!['updatedAt', 'createdAt', 'title', 'oldest'].includes(state.settings.sortBy)) {
    state.settings.sortBy = 'updatedAt';
  }
  applyAllPreferences();
}

async function handleImportFile(file) {
  if (!file) return;
  try {
    const parsed = await Backup.readBackupFile(file);
    const summary = Backup.summarizeBackup(parsed);
    const mode = await Modals.openImportMode({ summary, filename: file.name });
    if (!mode) return;
    if (mode === 'replace') {
      const ok = await Modals.confirmDialog({
        title: 'Ganti semua data?',
        message: 'Seluruh catatan, folder, pengaturan, dan riwayat versi di perangkat ini akan diganti dengan isi backup.',
        confirmText: 'Ya, ganti semua',
        danger: true,
        iconName: 'alert'
      });
      if (!ok) return;
    }
    await Backup.restoreBackup(parsed, mode);
    await reloadData();
    await purgeExpiredTrash();
    state.selectionMode = false;
    state.selected.clear();
    toast(`Impor selesai: ${summary.total} catatan`, 'success', 4000);
    goToRoute('#/notes', { replace: true });
  } catch (err) {
    console.error('[import]', err);
    toast(err.message || 'Gagal mengimpor backup.', 'error', 5000);
  }
}

function goToRoute(target, { replace = false } = {}) {
  if (replace) {
    try { history.replaceState(history.state || {}, '', target); } catch (_) { location.hash = target; }
    handleRouteChange();
  } else {
    navigate(target);
  }
}

async function printAllNotes() {
  const notes = sortNotes(state.notes.filter((n) => !n.isDeleted));
  if (!notes.length) {
    toast('Belum ada catatan untuk dicetak.', 'info');
    return;
  }
  let root = $('#print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  root.innerHTML = `
    <div class="print-doc">
      <header class="print-cover">
        <h1>Catatan</h1>
        <p>${notes.length} catatan · dicetak ${esc(fmtDate(Date.now()))}</p>
      </header>
      ${notes.map((note) => {
        const cat = findCategory(note.categoryId);
        return `
          <article class="print-note">
            <h2>${esc(note.title || 'Tanpa judul')}</h2>
            <p class="print-meta">
              ${cat ? `${esc(cat.name)} · ` : ''}${esc(fmtDate(note.updatedAt))}
              ${note.tags?.length ? ` · ${note.tags.map((t) => '#' + esc(t)).join(' ')}` : ''}
            </p>
            <div class="print-content">${sanitizeHTML(note.content || '') || '<p><em>Tidak ada isi.</em></p>'}</div>
          </article>`;
      }).join('')}
    </div>`;
  document.body.classList.add('printing');
  const cleanup = () => {
    document.body.classList.remove('printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => {
    window.print();
    setTimeout(cleanup, 2000);
  }, 80);
}

async function resetSettings() {
  const ok = await Modals.confirmDialog({
    title: 'Atur ulang pengaturan?',
    message: 'Tema, warna, tampilan, dan perilaku aplikasi akan kembali ke bawaan. Catatan dan folder tidak diubah.',
    confirmText: 'Atur ulang',
    iconName: 'restore'
  });
  if (!ok) return;
  const keepBackup = state.settings.lastBackupAt || 0;
  const keepRecent = state.settings.recentSearches || [];
  state.settings = {
    ...DEFAULT_SETTINGS,
    lastBackupAt: keepBackup,
    recentSearches: keepRecent,
    shortcutLabel: `${modKey} N`
  };
  await DB.setSettings({ ...DEFAULT_SETTINGS, lastBackupAt: keepBackup, recentSearches: keepRecent });
  applyAllPreferences();
  refreshPage({ keepScroll: true });
  toast('Pengaturan dikembalikan ke bawaan', 'success');
}

async function clearAllData() {
  const ok = await Modals.confirmDialog({
    title: 'Hapus semua data?',
    message: 'Semua catatan, folder, sampah, riwayat versi, dan pengaturan akan dihapus permanen dari perangkat ini.',
    details: '<p class="dialog-details-em">Tindakan ini tidak dapat dibatalkan. Buat backup terlebih dahulu jika masih ragu.</p>',
    confirmText: 'Hapus semuanya',
    danger: true,
    iconName: 'alert'
  });
  if (!ok) return;
  try {
    await DB.clearEverything();
  } catch (err) {
    toast('Gagal menghapus data.', 'error');
    return;
  }
  state.notes = [];
  state.categories = [];
  state.settings = { ...DEFAULT_SETTINGS, shortcutLabel: `${modKey} N` };
  state.selectionMode = false;
  state.selected.clear();
  applyAllPreferences();
  toast('Semua data telah dihapus', 'success');
  goToRoute('#/notes', { replace: true });
}

/* ============================================================
   Command palette & pintasan
   ============================================================ */

async function openCommandPalette() {
  const commands = [
    { id: 'new', label: 'Catatan baru', sub: 'Tulis catatan kosong', icon: 'plus', shortcut: `${modKey} N`, group: 'Aksi', run: () => createNote(defaultCategoryForNew()) },
    { id: 'search', label: 'Cari catatan', sub: 'Buka pencarian', icon: 'search', shortcut: `${modKey} F`, group: 'Aksi', run: () => openSearch() },
    { id: 'notes', label: 'Semua catatan', icon: 'notes', group: 'Navigasi', run: () => navigate('#/notes') },
    { id: 'favorites', label: 'Favorit', icon: 'star', group: 'Navigasi', run: () => navigate('#/favorites') },
    { id: 'archive', label: 'Arsip', icon: 'archive', group: 'Navigasi', run: () => navigate('#/archive') },
    { id: 'trash', label: 'Sampah', icon: 'trash', group: 'Navigasi', run: () => navigate('#/trash') },
    { id: 'folders', label: 'Kelola folder', icon: 'folder', group: 'Navigasi', run: () => navigate('#/folders') },
    { id: 'settings', label: 'Pengaturan', icon: 'settings', group: 'Navigasi', run: () => navigate('#/settings') },
    { id: 'theme-light', label: 'Tema terang', icon: 'sun', group: 'Tampilan', run: () => setTheme('light') },
    { id: 'theme-dark', label: 'Tema gelap', icon: 'moon', group: 'Tampilan', run: () => setTheme('dark') },
    { id: 'theme-system', label: 'Tema mengikuti sistem', icon: 'monitor', group: 'Tampilan', run: () => setTheme('system') },
    { id: 'view-list', label: 'Tampilan daftar', icon: 'list', group: 'Tampilan', run: () => setViewMode('list') },
    { id: 'view-grid', label: 'Tampilan kartu', icon: 'grid', group: 'Tampilan', run: () => setViewMode('grid') },
    { id: 'export', label: 'Ekspor backup JSON', icon: 'download', group: 'Data', run: () => exportBackup() },
    { id: 'markdown', label: 'Ekspor Markdown', icon: 'markdown', group: 'Data', run: () => exportMarkdown() },
    { id: 'print', label: 'Cetak / simpan PDF', icon: 'print', group: 'Data', run: () => printAllNotes() },
    { id: 'shortcuts', label: 'Pintasan keyboard', icon: 'keyboard', group: 'Bantuan', run: () => Modals.openShortcuts({ modKey }) },
    { id: 'about', label: 'Tentang Catatan', icon: 'info', group: 'Bantuan', run: () => Modals.openAbout({ version: Backup.APP_VERSION }) }
  ];

  const recent = sortNotes(state.notes.filter((n) => !n.isDeleted)).slice(0, 5);
  for (const note of recent) {
    commands.push({
      id: `note-${note.id}`,
      label: note.title || notePreview(note, 32) || 'Tanpa judul',
      sub: relativeTime(note.updatedAt),
      icon: 'note',
      group: 'Catatan terakhir',
      keywords: note.plainText?.slice(0, 120) || '',
      run: () => openNoteById(note.id)
    });
  }

  const result = await Modals.openCommandPalette({ commands });
  if (!result?.run) return;
  try { await result.run(); } catch (err) { console.error('[palette]', err); }
}

function defaultCategoryForNew() {
  if (state.view === 'folder') return state.params.id || null;
  return null;
}

/* ============================================================
   Aksi UI
   ============================================================ */

async function handleAction(action, target) {
  switch (action) {
    case 'toggle-drawer':
      setDrawer(!state.drawerOpen);
      break;
    case 'close-drawer':
      setDrawer(false);
      break;
    case 'nav': {
      const page = target.dataset.page;
      setDrawer(false);
      if (page === 'folder') navigate(`#/folder/${encodeURIComponent(target.dataset.id || '')}`);
      else if (page === 'tag') navigate(`#/tag/${encodeURIComponent(target.dataset.tag || '')}`);
      else if (page) navigate(`#/${page}`);
      break;
    }
    case 'new-note':
      await createNote({ categoryId: defaultCategoryForNew(), tags: state.view === 'tag' ? [state.params.tag] : [] });
      break;
    case 'open-note':
      await openNoteById(target.dataset.id);
      break;
    case 'note-menu':
      await openNoteMenu(findNote(target.dataset.id));
      break;
    case 'toggle-select':
      toggleSelected(target.dataset.id);
      break;
    case 'quick-filter':
      state.quickFilter = target.dataset.filter || 'all';
      state.limit = PAGE_SIZE;
      updateChrome();
      renderCollection();
      window.scrollTo(0, 0);
      break;
    case 'load-more':
      state.limit += PAGE_SIZE;
      renderCollection();
      break;
    case 'folder-new':
      await createFolder();
      break;
    case 'folder-menu':
      await handleFolderMenu(findCategory(target.dataset.id));
      break;
    case 'trash-empty':
      await emptyTrash();
      break;
    case 'editor-back':
      navigate(state.editorReturn || '#/notes');
      break;
    case 'editor-focus':
      state.focusMode = !state.focusMode;
      document.body.classList.toggle('focus-mode', state.focusMode);
      renderAppbarOnly();
      break;
    case 'editor-pin':
      if (state.note) await toggleNoteFlag(state.note, 'isPinned');
      break;
    case 'editor-favorite':
      if (state.note) await toggleNoteFlag(state.note, 'isFavorite');
      break;
    case 'editor-more':
      if (state.note) await openNoteMenu(state.note);
      break;
    case 'editor-pick-folder': {
      if (!state.note) break;
      const picked = await Modals.openFolderPicker({
        categories: state.categories,
        currentId: state.note.categoryId,
        counts: categoryCounts()
      });
      if (picked) await moveNotesToFolder([state.note], picked.folderId);
      break;
    }
    case 'editor-info':
      if (state.note) {
        Modals.openNoteInfo({
          note: state.note,
          category: findCategory(state.note.categoryId),
          stats: state.editor?.getStats() || null
        });
      }
      break;
    case 'tag-remove':
      await removeEditorTag(target.dataset.tag);
      break;
    case 'go-back':
      goToTop();
      break;
    case 'open-search':
      await openSearch();
      break;
    case 'search-cancel':
      navigate(state.searchReturn || '#/notes');
      break;
    case 'clear-search':
      clearSearchState();
      break;
    case 'clear-search-filters':
      state.searchFilters = EMPTY_FILTERS();
      state.searchFolderId = null;
      refreshSearchResults();
      break;
    case 'search-filter': {
      const key = target.dataset.filter;
      if (key in state.searchFilters) state.searchFilters[key] = !state.searchFilters[key];
      refreshSearchResults();
      break;
    }
    case 'search-folder': {
      const picked = await Modals.openFolderPicker({
        categories: state.categories,
        currentId: state.searchFolderId,
        noneLabel: 'Semua folder',
        counts: categoryCounts(),
        title: 'Cari di folder'
      });
      if (picked) {
        state.searchFolderId = picked.folderId;
        refreshSearchResults();
      }
      break;
    }
    case 'recent-search':
      state.query = target.dataset.query || '';
      state.pendingSearchFocus = true;
      refreshSearchResults();
      updateChrome();
      focusSearchInput();
      break;
    case 'clear-recent-searches':
      state.settings.recentSearches = [];
      await DB.setSetting('recentSearches', []).catch(() => {});
      refreshSearchResults();
      break;
    case 'search-tips':
      Modals.openSearchTips();
      break;
    case 'sort-sheet': {
      const result = await Modals.openSortSheet({
        sortBy: state.settings.sortBy,
        viewMode: state.settings.viewMode,
        groupByDate: state.settings.groupByDate
      });
      if (result) {
        await updateSettings(result);
        refreshPage({ keepScroll: true });
      }
      break;
    }
    case 'view-toggle':
      await setViewMode(state.settings.viewMode === 'list' ? 'grid' : 'list');
      refreshPage({ keepScroll: true });
      break;
    case 'select-mode':
      enterSelection();
      break;
    case 'select-all':
      selectAllOnPage();
      break;
    case 'exit-select':
      exitSelection();
      break;
    case 'page-menu': {
      const result = await Modals.openPageMenu({
        page: state.view,
        inTrash: state.view === 'trash',
        selectionMode: state.selectionMode
      });
      if (!result) break;
      if (result.action === 'select') enterSelection();
      else if (result.action === 'sort') await handleAction('sort-sheet', target);
      else if (result.action === 'toggle-view') await handleAction('view-toggle', target);
      else if (result.action === 'new-note') await handleAction('new-note', target);
      else if (result.action === 'folder-new') await createFolder();
      else if (result.action === 'export') await exportBackup();
      else if (result.action === 'import') $('#import-file')?.click();
      else if (result.action === 'print') printAllNotes();
      else if (result.action === 'trash-empty') await emptyTrash();
      else if (result.action === 'shortcuts') Modals.openShortcuts({ modKey });
      else if (result.action === 'about') Modals.openAbout({ version: Backup.APP_VERSION });
      break;
    }
    case 'bulk-pin':
    case 'bulk-favorite':
    case 'bulk-archive':
    case 'bulk-move':
    case 'bulk-delete':
    case 'bulk-restore':
    case 'bulk-delete-permanent':
      await bulkAction(action.replace('bulk-', ''));
      break;
    case 'detail-restore': {
      const note = findNote(target.dataset.id);
      if (note) await restoreNotes([note]);
      break;
    }
    case 'detail-delete-permanent': {
      const note = findNote(target.dataset.id);
      if (note) await deletePermanently([note]);
      break;
    }
    case 'set-theme':
      await setTheme(target.dataset.value);
      break;
    case 'set-accent':
      await setAccent(target.dataset.value);
      break;
    case 'set-view':
      await setViewMode(target.dataset.value);
      break;
    case 'set-font':
      await setEditorFont(target.dataset.value);
      break;
    case 'toggle-setting':
      await toggleSetting(target.dataset.key);
      break;
    case 'storage-refresh':
      await refreshStorageUI(true);
      break;
    case 'export-data':
      await exportBackup();
      break;
    case 'export-markdown':
      exportMarkdown();
      break;
    case 'import-data':
      $('#import-file')?.click();
      break;
    case 'print-all':
      printAllNotes();
      break;
    case 'install-app':
      await installApp();
      break;
    case 'show-shortcuts':
      Modals.openShortcuts({ modKey });
      break;
    case 'about':
      Modals.openAbout({ version: Backup.APP_VERSION });
      break;
    case 'check-update':
      await checkForUpdate();
      break;
    case 'reset-settings':
      await resetSettings();
      break;
    case 'clear-all':
      await clearAllData();
      break;
    case 'update-now':
      updateNow();
      break;
    case 'dismiss-pwa':
      dismissPWA();
      break;
    default:
      break;
  }
}

/* ============================================================
   Event delegasi
   ============================================================ */

/* Keyboard virtual: ikuti visual viewport agar toolbar editor selalu di atas keyboard. */
function setupKeyboardInsets() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let raf = 0;
  const apply = () => {
    raf = 0;
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const open = kb > 80;
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    root.style.setProperty('--kb', `${kb}px`);
    root.classList.toggle('kb-open', open);
    if (open && (window.scrollY || vv.offsetTop)) window.scrollTo(0, 0);
    if (open && state.view === 'editor') {
      const el = document.activeElement;
      if (el && (el.id === 'editor-body' || el.id === 'editor-title')) {
        requestAnimationFrame(() => {
          try { el.id === 'editor-body' ? scrollCaretIntoView() : el.scrollIntoView({ block: 'nearest' }); } catch (_) { /* noop */ }
        });
      }
    }
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', schedule);
  apply();
}

function scrollCaretIntoView() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(false);
  let rect = range.getClientRects()[0];
  if (!rect) {
    const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    rect = node?.getBoundingClientRect();
  }
  const bar = document.getElementById('editor-toolbar-wrap');
  const limit = bar ? bar.getBoundingClientRect().top : (window.visualViewport?.height || window.innerHeight);
  if (rect && rect.bottom > limit - 12 && els.content) {
    els.content.scrollTop += rect.bottom - limit + 40;
  }
}

function setupEvents() {
  document.addEventListener('click', async (e) => {
    if (Date.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const target = e.target.closest('[data-action]');
    if (!target) return;
    if (target.closest('.modal-layer')) return;
    if (target.closest('#editor-toolbar-wrap')) {
      const editorAction = target.dataset.action;
      if (!['editor-info'].includes(editorAction)) return;
    }
    const action = target.dataset.action;
    if (!action) return;
    try {
      await handleAction(action, target);
    } catch (err) {
      console.error('[action]', action, err);
      toast('Tindakan gagal dijalankan.', 'error');
    }
  }, true);

  document.addEventListener('contextmenu', (e) => {
    const item = e.target.closest('.note-item, .note-card');
    if (!item || state.selectionMode) return;
    const note = findNote(item.dataset.id);
    if (!note) return;
    e.preventDefault();
    openNoteMenu(note);
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'search-input' && state.view === 'search') {
      state.query = e.target.value;
      refreshSearchResults();
      saveRecentSearchSoon();
    } else if (e.target.id === 'font-size-range') {
      const value = clamp(Number(e.target.value) || 17, 14, 24);
      const label = $('#font-size-label');
      if (label) label.textContent = `${value}px`;
      document.documentElement.style.setProperty('--editor-font-size', `${value}px`);
    }
  });

  document.addEventListener('change', async (e) => {
    if (e.target.id === 'font-size-range') {
      await updateSettings({ fontSize: clamp(Number(e.target.value) || 17, 14, 24) });
    } else if (e.target.id === 'import-file') {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) await handleImportFile(file);
    }
  });

  document.addEventListener('keydown', async (e) => {
    if (e.target.id === 'search-input' && e.key === 'Enter') {
      e.preventDefault();
      saveRecentSearchSoon.flush?.();
      focusSearchInput();
      return;
    }
    if (e.target.id === 'tag-input') {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const value = e.target.value;
        e.target.value = '';
        await addEditorTag(value);
        return;
      }
      if (e.key === 'Backspace' && !e.target.value && state.note?.tags?.length) {
        await removeEditorTag(state.note.tags[state.note.tags.length - 1]);
        return;
      }
    }

    if (Modals.isModalOpen()) return;

    if (e.key === 'Escape') {
      if (state.focusMode) {
        state.focusMode = false;
        document.body.classList.remove('focus-mode');
        renderAppbarOnly();
        return;
      }
      if (state.drawerOpen) { setDrawer(false); return; }
      if (state.selectionMode) { exitSelection(); return; }
      return;
    }

    if (isEditableTarget(e.target)) return;

    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      await openCommandPalette();
    } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      await createNote({ categoryId: defaultCategoryForNew() });
    } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      await openSearch();
    } else if (!mod && e.key === '/') {
      e.preventDefault();
      await openSearch();
    } else if (!mod && e.key === '?') {
      e.preventDefault();
      Modals.openShortcuts({ modKey });
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectionMode) {
      e.preventDefault();
      await bulkAction(state.view === 'trash' ? 'delete-permanent' : 'delete');
    }
  });

  window.addEventListener('hashchange', () => {
    /* popstate & hashchange sama-sama terpicu saat hash berubah; abaikan yang kedua
       agar editor yang baru dibuka tidak langsung ditutup (dan catatan kosong terhapus). */
    const current = location.hash || '#/notes';
    if (current !== state.lastRoutedHash) scheduleRoute();
  });
  window.addEventListener('popstate', () => {
    if (Modals.handleModalPopState()) return;
    const current = location.hash || '#/notes';
    if (current !== state.lastRoutedHash) scheduleRoute();
  });

  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', () => {
    if ((state.settings.theme || 'system') === 'system') applyTheme();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.editor) {
      state.saveSoon?.cancel?.();
      persistEditor('hidden');
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (!state.dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  window.addEventListener('pagehide', () => {
    if (state.editor) persistEditor('pagehide');
  });

  window.addEventListener('notes-db-versionchange', () => {
    toast('Database diperbarui di tab lain. Muat ulang halaman untuk melanjutkan.', 'error', 8000);
  });

  setupGestures();
}

/* ============================================================
   Gestur: geser & tekan lama
   ============================================================ */

function setupGestures() {
  let gesture = null;

  const clearGesture = () => {
    if (!gesture) return;
    clearTimeout(gesture.timer);
    gesture = null;
  };

  els.content.addEventListener('pointerdown', (e) => {
    if (!['notes', 'favorites', 'folder', 'tag', 'archive', 'trash'].includes(state.view)) return;
    if (state.selectionMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button, a, input, audio, .note-more')) return;
    const item = e.target.closest('.note-item, .note-card');
    if (!item) return;

    clearGesture();
    gesture = {
      item,
      id: item.dataset.id,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      moved: false,
      swiping: false,
      timer: setTimeout(() => {
        if (!gesture || gesture.moved) return;
        const id = gesture.id;
        clearGesture();
        suppressClickUntil = Date.now() + 900;
        enterSelection(id);
      }, 540)
    };
  });
  els.content.addEventListener('pointermove', (e) => {
    if (!gesture) return;
    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    gesture.dx = dx;
    gesture.dy = dy;
    if (Math.abs(dx) > 9 || Math.abs(dy) > 9) {
      gesture.moved = true;
      clearTimeout(gesture.timer);
    }
    if (state.settings.swipeActions === false) return;
    if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.35) {
      gesture.swiping = true;
      const inner = gesture.item.querySelector('.note-item-inner') || gesture.item;
      inner.style.transition = 'none';
      inner.style.transform = `translateX(${clamp(dx, -120, 120)}px)`;
      gesture.item.classList.add('is-swiping');
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });
  els.content.addEventListener('pointerup', async () => {
    if (!gesture) return;
    clearTimeout(gesture.timer);
    const g = gesture;
    gesture = null;
    if (!g.swiping) return;
    const inner = g.item.querySelector('.note-item-inner') || g.item;
    inner.style.transition = '';
    inner.style.transform = '';
    g.item.classList.remove('is-swiping');
    suppressClickUntil = Date.now() + 380;
    if (g.dx > 72) {
      const note = findNote(g.id);
      if (note) await toggleNoteFlag(note, 'isPinned');
    } else if (g.dx < -72) {
      const note = findNote(g.id);
      if (note) await trashNotes([note], { confirm: state.settings.confirmDelete !== false });
    }
  });
  els.content.addEventListener('pointercancel', () => {
    if (!gesture) return;
    if (gesture.swiping) {
      const inner = gesture.item.querySelector('.note-item-inner') || gesture.item;
      inner.style.transform = '';
      inner.style.transition = '';
      gesture.item.classList.remove('is-swiping');
    }
    clearGesture();
  });
}

/* ============================================================
   PWA
   ============================================================ */

function showPWA(kind) {
  const root = $('#pwa-root');
  if (!root) return;
  root.innerHTML = UI.pwaBannerHTML({ kind });
}

function dismissPWA() {
  const root = $('#pwa-root');
  if (root) root.innerHTML = '';
  try { localStorage.setItem('catatan:install-dismissed', '1'); } catch (_) { /* noop */ }
}

async function installApp() {
  if (isStandalone()) {
    toast('Catatan sudah terpasang di perangkat ini.', 'info');
    return;
  }
  if (state.installPrompt) {
    const prompt = state.installPrompt;
    state.installPrompt = null;
    try {
      prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') toast('Menginstal Catatan…', 'success');
    } catch (_) { /* noop */ }
    dismissPWA();
    return;
  }
  toast('Buka menu browser lalu pilih “Tambahkan ke layar utama”.', 'info', 5000);
}

function updateNow() {
  const worker = state.updateWorker || state.swReg?.waiting;
  if (worker) {
    worker.postMessage({ type: 'SKIP_WAITING' });
    toast('Memperbarui aplikasi…', 'info', 2000);
  } else {
    location.reload();
  }
}

async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) {
    toast('Pembaruan otomatis tidak tersedia di browser ini.', 'info');
    return;
  }
  try {
    const reg = state.swReg || await navigator.serviceWorker.getRegistration();
    if (!reg) {
      toast('Service worker belum aktif. Muat ulang halaman sekali.', 'info');
      return;
    }
    await reg.update();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (reg.waiting) {
      state.updateWorker = reg.waiting;
      showPWA('update');
      toast('Pembaruan tersedia.', 'info');
    } else {
      toast('Kamu sudah memakai versi terbaru.', 'success');
    }
  } catch (err) {
    console.warn('[update]', err);
    toast('Gagal memeriksa pembaruan.', 'error');
  }
}

async function initPWA() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installPrompt = e;
    let dismissed = false;
    try { dismissed = localStorage.getItem('catatan:install-dismissed') === '1'; } catch (_) { /* noop */ }
    if (!dismissed && !isStandalone() && state.booted) showPWA('install');
  });

  window.addEventListener('appinstalled', () => {
    state.installPrompt = null;
    dismissPWA();
    toast('Catatan berhasil dipasang', 'success');
  });

  window.addEventListener('offline', () => toast('Kamu sedang offline. Catatan tetap bisa dibuka.', 'info', 3500));
  window.addEventListener('online', () => toast('Kembali online.', 'success', 2000));

  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;

  state.hadSWController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!state.hadSWController) {
      state.hadSWController = true;
      return;
    }
    if (state.installing) return;
    state.installing = true;
    location.reload();
  });

  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    state.swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) {
      state.updateWorker = reg.waiting;
      showPWA('update');
    }
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          state.updateWorker = worker;
          showPWA('update');
        }
      });
    });
  } catch (err) {
    console.warn('[sw]', err);
  }
}

/* ============================================================
   Boot
   ============================================================ */

function showBootError(err) {
  const app = $('#app');
  if (!app) return;
  app.innerHTML = `
    <div class="boot-screen boot-error">
      <div class="boot-error-ico">${icon('alert', 38)}</div>
      <h1>Aplikasi tidak dapat dijalankan</h1>
      <p>${esc(err?.message || 'Terjadi kesalahan yang tidak diketahui.')}</p>
      <button class="btn btn-primary" id="boot-retry">Coba lagi</button>
      <button class="btn btn-ghost" id="boot-reset">Muat ulang halaman</button>
      <small>Jika masalah berlanjut, pastikan browser mengizinkan penyimpanan lokal (IndexedDB).</small>
    </div>`;
  $('#boot-retry')?.addEventListener('click', () => location.reload());
  $('#boot-reset')?.addEventListener('click', () => location.reload());
}

async function handleActionParam() {
  const params = new URLSearchParams(location.search);
  const action = params.get('action');
  if (!action) return;
  params.delete('action');
  const rest = params.toString();
  const clean = `${location.pathname}${rest ? `?${rest}` : ''}${location.hash || ''}`;
  try { history.replaceState(history.state || {}, '', clean); } catch (_) { /* noop */ }
  if (action === 'new') {
    await createNote({ categoryId: null });
  } else if (action === 'search') {
    await openSearch();
  }
}

async function boot() {
  if (bootStarted) return;
  bootStarted = true;
  loadBootPrefs();
  applyAllPreferences();

  try {
    await DB.openDB();
    await reloadData();
    await purgeExpiredTrash();

    renderShell();
    setupEvents();
    setupKeyboardInsets();
    state.currentHash = location.hash || '#/notes';
    if (!location.hash) {
      try { history.replaceState(history.state || {}, '', '#/notes'); } catch (_) { /* noop */ }
    }
    await handleRouteChange();
    state.booted = true;

    if (state.installPrompt && !isStandalone()) {
      let dismissed = false;
      try { dismissed = localStorage.getItem('catatan:install-dismissed') === '1'; } catch (_) { /* noop */ }
      if (!dismissed) showPWA('install');
    }

    initPWA();
    await handleActionParam();
  } catch (err) {
    console.error('[boot]', err);
    showBootError(err);
  }
}

document.addEventListener('DOMContentLoaded', boot, { once: true });
if (document.readyState !== 'loading') boot();
