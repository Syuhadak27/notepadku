/* ============================================================
   ui.js — template tampilan (sidebar, appbar, daftar, editor)
   ============================================================ */

import { icon, BRAND_SVG } from './icons.js';
import {
  esc, noteTags, notePreview, countChecklist, firstImageSrc, hasChecklist,
  noteTimeLabel, relativeTime, fmtDate, fmtDateTime, trashDaysLeft,
  highlightText, excerptAround, sanitizeHTML, fmtDateLong
} from './utils.js';

const FOLDER_ICON_FALLBACK = 'folder';

export const getCategory = (categories, id) =>
  (categories || []).find((c) => c.id === id) || null;

export function folderIconName(category) {
  return category?.icon || FOLDER_ICON_FALLBACK;
}

/* ============================================================
   Sidebar
   ============================================================ */

export function sidebarHTML({ notes, categories, counts, tagCounts, view, params, settings }) {
  const activeClass = (key) => {
    if (key === 'notes') return view === 'notes' ? ' active' : '';
    return view === key ? ' active' : '';
  };
  const activeFolder = view === 'folder' ? params?.id : null;
  const folderCounts = new Map();
  for (const n of notes) {
    if (n.isDeleted || n.isArchived || !n.categoryId) continue;
    folderCounts.set(n.categoryId, (folderCounts.get(n.categoryId) || 0) + 1);
  }

  return `
    <div class="sidebar-inner">
      <div class="brand">
        <div class="brand-logo">${BRAND_SVG}</div>
        <div class="brand-text">
          <strong>Catatan</strong>
          <span>Offline · Milikmu</span>
        </div>
        <button class="icon-btn brand-close" data-action="close-drawer" aria-label="Tutup menu">${icon('close', 19)}</button>
      </div>

      <button class="side-new" data-action="new-note">
        <span class="side-new-ico">${icon('plus', 19)}</span>
        <span>Catatan Baru</span>
        <kbd>${settings?.shortcutLabel || 'Ctrl N'}</kbd>
      </button>

      <div class="side-scroll">
        <div class="side-section">
          <div class="side-label">Perpustakaan</div>
          <button class="side-item${activeClass('notes')}" data-action="nav" data-page="notes">
            <span class="side-ico">${icon('notes', 19)}</span>
            <span class="side-text">Semua Catatan</span>
            <span class="side-count">${counts.all}</span>
          </button>
          <button class="side-item${activeClass('favorites')}" data-action="nav" data-page="favorites">
            <span class="side-ico">${icon('star', 19)}</span>
            <span class="side-text">Favorit</span>
            <span class="side-count">${counts.favorites}</span>
          </button>
          <button class="side-item${activeClass('archive')}" data-action="nav" data-page="archive">
            <span class="side-ico">${icon('archive', 19)}</span>
            <span class="side-text">Arsip</span>
            ${counts.archive ? `<span class="side-count">${counts.archive}</span>` : ''}
          </button>
          <button class="side-item${activeClass('trash')}" data-action="nav" data-page="trash">
            <span class="side-ico">${icon('trash', 19)}</span>
            <span class="side-text">Sampah</span>
            ${counts.trash ? `<span class="side-count danger">${counts.trash}</span>` : ''}
          </button>
        </div>

        <div class="side-section">
          <div class="side-label-row">
            <span class="side-label">Folder</span>
            <button class="side-add" data-action="folder-new" aria-label="Folder baru" title="Folder baru">${icon('plus', 15)}</button>
          </div>
          ${(categories || []).length ? (categories || []).map((c) => `
            <button class="side-item folder-side${activeFolder === c.id ? ' active' : ''}"
                    data-action="nav" data-page="folder" data-id="${esc(c.id)}">
              <span class="side-ico folder-side-ico" style="--folder-color:${esc(c.color || '#5b7cfa')}">
                ${icon(folderIconName(c), 17)}
              </span>
              <span class="side-text">${esc(c.name)}</span>
              <span class="side-count">${folderCounts.get(c.id) || 0}</span>
            </button>`).join('') : `
            <button class="side-empty" data-action="folder-new">
              ${icon('folderPlus', 17)} <span>Buat folder pertama</span>
            </button>`}
          <button class="side-item side-link" data-action="nav" data-page="folders">
            <span class="side-ico">${icon('grid', 17)}</span>
            <span class="side-text">Kelola folder</span>
            ${icon('chevronRight', 15)}
          </button>
        </div>

        ${(tagCounts || []).length ? `
          <div class="side-section">
            <div class="side-label">Tag</div>
            <div class="side-tags">
              ${tagCounts.slice(0, 10).map(({ tag, count }) => `
                <button class="side-tag${view === 'tag' && params?.tag === tag ? ' active' : ''}"
                        data-action="nav" data-page="tag" data-tag="${esc(tag)}">
                  <span>#${esc(tag)}</span><em>${count}</em>
                </button>`).join('')}
            </div>
          </div>` : ''}
      </div>

      <div class="side-footer">
        <button class="side-item${view === 'settings' ? ' active' : ''}" data-action="nav" data-page="settings">
          <span class="side-ico">${icon('settings', 19)}</span>
          <span class="side-text">Pengaturan</span>
        </button>
        <div class="side-storage">
          <div class="storage-head">
            <span>Penyimpanan</span>
            <span id="side-storage-label">Lokal</span>
          </div>
          <div class="storage-bar"><span id="side-storage-fill" style="width:0%"></span></div>
        </div>
      </div>
    </div>`;
}

/* ============================================================
   Appbar
   ============================================================ */

export function appbarHTML({
  view, meta = {}, selectionMode = false, selectedCount = 0,
  saveStatus = 'saved', note = null, query = '', focusMode = false, modKey = 'Ctrl'
}) {
  if (view === 'editor') {
    const pinActive = note?.isPinned ? ' active' : '';
    const starActive = note?.isFavorite ? ' active' : '';
    return `
      <div class="appbar-inner editor-appbar">
        <button class="icon-btn" data-action="editor-back" aria-label="Kembali">${icon('chevronLeft', 22)}</button>
        <div class="appbar-main">
          <span class="appbar-kicker">Catatan</span>
          <span class="save-indicator ${saveStatus}" id="save-indicator">
            <span class="save-dot"></span><span id="save-text">${saveStatus === 'saving' ? 'Menyimpan…' : saveStatus === 'error' ? 'Gagal menyimpan' : 'Tersimpan'}</span>
          </span>
        </div>
        <div class="appbar-actions">
          <button class="icon-btn${focusMode ? ' active' : ''}" data-action="editor-focus" aria-label="Mode fokus" title="Mode fokus">${icon('scan', 19)}</button>
          <button class="icon-btn${pinActive}" data-action="editor-pin" aria-label="Sematkan" title="Sematkan">${icon(note?.isPinned ? 'pinFill' : 'pin', 19)}</button>
          <button class="icon-btn${starActive}" data-action="editor-favorite" aria-label="Favorit" title="Favorit">${icon(note?.isFavorite ? 'starFill' : 'star', 19)}</button>
          <button class="icon-btn" data-action="editor-more" aria-label="Opsi catatan">${icon('more', 20)}</button>
        </div>
      </div>`;
  }

  if (view === 'search') {
    return `
      <div class="appbar-inner search-appbar">
        <button class="icon-btn" data-action="go-back" aria-label="Kembali">${icon('chevronLeft', 22)}</button>
        <label class="appbar-search" for="search-input">
          ${icon('search', 18)}
          <input id="search-input" type="search" value="${esc(query)}" placeholder="Cari catatan, tag, isi…"
                 autocomplete="off" spellcheck="false" enterkeyhint="search" />
          <button type="button" class="search-clear" data-action="clear-search" aria-label="Hapus pencarian" ${query ? '' : 'hidden'}>${icon('close', 15)}</button>
        </label>
        <button class="appbar-text-btn" data-action="search-cancel">Batal</button>
      </div>`;
  }

  const back = Boolean(meta.back);
  const showSelect = !selectionMode && ['notes', 'favorites', 'folder', 'tag', 'archive', 'trash'].includes(view);
  return `
    <div class="appbar-inner">
      <button class="icon-btn ${back ? '' : 'only-mobile'}" data-action="${back ? 'go-back' : 'toggle-drawer'}" aria-label="${back ? 'Kembali' : 'Buka menu'}">
        ${icon(back ? 'chevronLeft' : 'menu', back ? 22 : 21)}
      </button>
      <div class="appbar-main">
        <h1 class="appbar-title">${esc(selectionMode ? `${selectedCount} dipilih` : (meta.title || 'Catatan'))}</h1>
        <p class="appbar-sub">${esc(selectionMode ? 'Pilih tindakan di bawah' : (meta.sub || ''))}</p>
      </div>
      <div class="appbar-actions">
        ${selectionMode ? `
          <button class="appbar-text-btn" data-action="select-all">${icon('checkCircle', 17)} <span>Semua</span></button>
          <button class="appbar-text-btn" data-action="exit-select">Batal</button>
        ` : `
          <button class="icon-btn" data-action="open-search" aria-label="Cari" title="Cari (${modKey} F)">${icon('search', 19)}</button>
          ${['notes', 'favorites', 'folder', 'tag', 'archive', 'trash', 'folders', 'settings'].includes(view) ? `
            <button class="icon-btn only-desktop" data-action="sort-sheet" aria-label="Urutkan" title="Urutkan & tampilan">${icon('sort', 19)}</button>
            <button class="icon-btn only-desktop" data-action="view-toggle" aria-label="Ubah tampilan" title="Ubah tampilan">${icon('grid', 19)}</button>
          ` : ''}
          ${showSelect ? `<button class="icon-btn only-desktop" data-action="select-mode" aria-label="Pilih catatan" title="Pilih">${icon('checkCircle', 19)}</button>` : ''}
          ${view === 'folders' ? `<button class="icon-btn" data-action="folder-new" aria-label="Folder baru">${icon('folderPlus', 19)}</button>` : ''}
          <button class="icon-btn" data-action="page-menu" aria-label="Menu halaman">${icon('more', 20)}</button>
        `}
      </div>
    </div>`;
}

/* ============================================================
   Tabbar & selection bar
   ============================================================ */

export function tabbarHTML({ view }) {
  const notesActive = ['notes', 'folder', 'tag', 'archive', 'trash', 'search'].includes(view);
  const items = [
    { page: 'notes', ico: 'notes', label: 'Catatan', active: notesActive },
    { page: 'folders', ico: 'folder', label: 'Folder', active: view === 'folders' },
    { page: 'favorites', ico: 'star', label: 'Favorit', active: view === 'favorites' },
    { page: 'settings', ico: 'settings', label: 'Atur', active: view === 'settings' }
  ];
  return items.map((it) => `
    <button class="tab-item${it.active ? ' active' : ''}" data-action="nav" data-page="${it.page}">
      <span class="tab-ico">${icon(it.ico, 21)}</span>
      <span>${it.label}</span>
    </button>`).join('');
}

export function selectionBarHTML({ selectedCount, view }) {
  const inTrash = view === 'trash';
  return `
    <div class="selection-bar" role="toolbar" aria-label="Tindakan catatan terpilih">
      <span class="selection-count">${selectedCount}</span>
      ${inTrash ? `
        <button class="sel-btn" data-action="bulk-restore">${icon('restore', 20)}<span>Pulihkan</span></button>
        <button class="sel-btn danger" data-action="bulk-delete-permanent">${icon('trash', 20)}<span>Hapus</span></button>
      ` : `
        <button class="sel-btn" data-action="bulk-pin">${icon('pin', 20)}<span>Pin</span></button>
        <button class="sel-btn" data-action="bulk-favorite">${icon('star', 20)}<span>Favorit</span></button>
        <button class="sel-btn" data-action="bulk-archive">${icon('archive', 20)}<span>Arsip</span></button>
        <button class="sel-btn" data-action="bulk-move">${icon('folder', 20)}<span>Pindah</span></button>
        <button class="sel-btn danger" data-action="bulk-delete">${icon('trash', 20)}<span>Hapus</span></button>
      `}
    </div>`;
}

/* ============================================================
   Catatan: baris & kartu
   ============================================================ */

function safeHighlight(text, query) {
  return query ? highlightText(text, query) : esc(text);
}

export function noteRowHTML(note, {
  selectionMode = false, selected = false, query = '', page = 'notes', categories = []
} = {}) {
  const cat = getCategory(categories, note.categoryId);
  const tags = noteTags(note);
  const previewText = notePreview(note, 260);
  const snippet = query ? excerptAround(previewText, query, 200) : previewText;
  const snippetHTML = snippet
    ? safeHighlight(snippet, query)
    : '<span class="note-empty">Tidak ada isi tambahan</span>';
  const titleText = note.title || 'Tanpa judul';
  const chk = countChecklist(note.content);
  const img = firstImageSrc(note.content);
  const hasAudio = /<audio[\s>]/i.test(note.content || '');
  const trashDays = page === 'trash' ? trashDaysLeft(note.deletedAt, 30) : null;
  const action = selectionMode ? 'toggle-select' : 'open-note';
  const tint = note.color ? ` style="--note-tint:${esc(note.color)}"` : '';
  const time = page === 'trash' ? relativeTime(note.deletedAt || note.updatedAt) : noteTimeLabel(note.updatedAt);

  return `
    <article class="note-item${selectionMode ? ' select-mode' : ''}${selected ? ' selected' : ''}${note.color ? ' has-tint' : ''}"
             data-action="${action}" data-id="${esc(note.id)}"${tint} aria-label="${esc(titleText)}">
      <div class="note-swipe-bg note-swipe-right">${icon('pin', 20)}<span>${note.isPinned ? 'Lepas pin' : 'Sematkan'}</span></div>
      <div class="note-swipe-bg note-swipe-left">${icon('trash', 20)}<span>Hapus</span></div>
      <div class="note-item-inner">
        <span class="select-dot">${icon('check', 14)}</span>
        <div class="note-main">
          <div class="note-title-row">
            <h3 class="note-title${note.title ? '' : ' is-untitled'}">${safeHighlight(titleText, query)}</h3>
            <span class="note-badges">
              ${note.isPinned ? `<span class="mini-badge pin" title="Disematkan">${icon('pinFill', 13)}</span>` : ''}
              ${note.isFavorite ? `<span class="mini-badge star" title="Favorit">${icon('starFill', 13)}</span>` : ''}
              ${hasAudio ? `<span class="mini-badge">${icon('mic', 13)}</span>` : ''}
            </span>
          </div>
          <p class="note-snippet">${snippetHTML}</p>
          <div class="note-meta">
            ${cat ? `<span class="note-meta-item folder-meta"><i class="folder-dot" style="background:${esc(cat.color || '#5b7cfa')}"></i>${esc(cat.name)}</span>` : ''}
            ${tags.slice(0, 2).map((t) => `<span class="note-meta-item tag-meta">#${esc(t)}</span>`).join('')}
            ${tags.length > 2 ? `<span class="note-meta-item">+${tags.length - 2}</span>` : ''}
            ${chk.total ? `<span class="note-meta-item check-meta">${icon('checkCircle', 12)} ${chk.done}/${chk.total}</span>` : ''}
            ${img ? `<span class="note-meta-item">${icon('image', 12)} Gambar</span>` : ''}
            ${trashDays !== null ? `<span class="note-meta-item${trashDays <= 3 ? ' danger' : ''}">${trashDays} hari lagi</span>` : ''}
          </div>
        </div>
        ${img ? `<div class="note-thumb"><img src="${esc(img)}" alt="" loading="lazy" decoding="async" /></div>` : ''}
        <div class="note-side">
          <time class="note-time">${esc(time)}</time>
          <button class="note-more" data-action="note-menu" data-id="${esc(note.id)}" aria-label="Menu catatan" title="Menu">${icon('more', 18)}</button>
        </div>
      </div>
    </article>`;
}

export function noteCardHTML(note, {
  selectionMode = false, selected = false, query = '', page = 'notes', categories = []
} = {}) {
  const cat = getCategory(categories, note.categoryId);
  const tags = noteTags(note);
  const previewText = notePreview(note, 200);
  const snippet = query ? excerptAround(previewText, query, 150) : previewText;
  const chk = countChecklist(note.content);
  const img = firstImageSrc(note.content);
  const titleText = note.title || 'Tanpa judul';
  const tint = note.color ? ` style="--note-tint:${esc(note.color)}"` : '';
  const action = selectionMode ? 'toggle-select' : 'open-note';
  const time = page === 'trash' ? relativeTime(note.deletedAt || note.updatedAt) : noteTimeLabel(note.updatedAt);

  return `
    <article class="note-card${selected ? ' selected' : ''}${selectionMode ? ' select-mode' : ''}${note.color ? ' has-tint' : ''}"
             data-action="${action}" data-id="${esc(note.id)}"${tint}>
      <span class="select-dot">${icon('check', 14)}</span>
      <div class="note-card-top">
        <h3 class="note-card-title${note.title ? '' : ' is-untitled'}">${safeHighlight(titleText, query)}</h3>
        <span class="note-badges">
          ${note.isPinned ? `<span class="mini-badge pin">${icon('pinFill', 13)}</span>` : ''}
          ${note.isFavorite ? `<span class="mini-badge star">${icon('starFill', 13)}</span>` : ''}
        </span>
      </div>
      <p class="note-card-snippet">${snippet ? safeHighlight(snippet, query) : '<span class="note-empty">Tidak ada isi</span>'}</p>
      ${img ? `<div class="note-card-thumb"><img src="${esc(img)}" alt="" loading="lazy" /></div>` : ''}
      <div class="note-card-foot">
        <span class="note-time">${esc(time)}</span>
        ${cat ? `<span class="note-card-folder"><i style="background:${esc(cat.color || '#5b7cfa')}"></i>${esc(cat.name)}</span>` : ''}
        ${chk.total ? `<span class="note-card-check">${icon('checkCircle', 12)} ${chk.done}/${chk.total}</span>` : ''}
      </div>
      <div class="note-card-actions">
        ${tags.slice(0, 2).map((t) => `<span class="tag-pill">#${esc(t)}</span>`).join('')}
        <button class="note-more" data-action="note-menu" data-id="${esc(note.id)}" aria-label="Menu catatan">${icon('more', 17)}</button>
      </div>
    </article>`;
}

export function folderCardHTML(category, { count = 0, active = false } = {}) {
  return `
    <article class="folder-card${active ? ' active' : ''}" data-action="nav" data-page="folder" data-id="${esc(category.id)}"
             style="--folder-color:${esc(category.color || '#5b7cfa')}">
      <div class="folder-card-top">
        <span class="folder-ico">${icon(folderIconName(category), 22)}</span>
        <button class="folder-more" data-action="folder-menu" data-id="${esc(category.id)}" aria-label="Menu folder">${icon('more', 18)}</button>
      </div>
      <h3>${esc(category.name)}</h3>
      <p>${count} catatan</p>
    </article>`;
}

/* ============================================================
   Empty state
   ============================================================ */

export function emptyStateHTML({ ico = 'note', title, text, actions = '', className = '' }) {
  return `
    <div class="empty-state ${className}">
      <div class="empty-art">${icon(ico, 42)}</div>
      <h2 class="empty-title">${esc(title)}</h2>
      <p class="empty-text">${esc(text)}</p>
      ${actions ? `<div class="empty-actions">${actions}</div>` : ''}
    </div>`;
}

/* ============================================================
   Koleksi catatan
   ============================================================ */

export function collectionHTML({
  page = 'notes', meta = {}, groups = [], viewMode = 'list', selectionMode = false,
  selected = new Set(), query = '', quickFilter = 'all', quickCounts = {},
  categories = [], trashCount = 0, hasMore = false, remaining = 0, folder = null
}) {
  const rows = (notes) => notes.map((n) => viewMode === 'grid'
    ? noteCardHTML(n, { selectionMode, selected: selected.has(n.id), query, page, categories })
    : noteRowHTML(n, { selectionMode, selected: selected.has(n.id), query, page, categories })).join('');

  const filterChips = ['notes', 'folder', 'favorites', 'archive'].includes(page) && !selectionMode ? `
    <div class="quick-filters" role="group" aria-label="Filter cepat">
      ${[
        ['all', 'Semua', quickCounts.all],
        ['checklist', 'Checklist', quickCounts.checklist],
        ['image', 'Gambar', quickCounts.image],
        ['audio', 'Rekaman', quickCounts.audio]
      ].filter(([, , count]) => count !== undefined).map(([key, label, count]) => `
        <button class="quick-chip${quickFilter === key ? ' active' : ''}" data-action="quick-filter" data-filter="${key}">
          ${label}<span>${count || 0}</span>
        </button>`).join('')}
    </div>` : '';

  const trashBanner = page === 'trash' && trashCount ? `
    <div class="info-banner trash-banner">
      <span class="info-banner-ico">${icon('trash', 19)}</span>
      <div>
        <strong>Catatan di sampah</strong>
        <p>Otomatis dihapus permanen setelah 30 hari. Kamu masih bisa memulihkannya.</p>
      </div>
      <button class="btn btn-ghost btn-sm" data-action="trash-empty">Kosongkan</button>
    </div>` : '';

  const folderBanner = folder ? `
    <div class="folder-banner" style="--folder-color:${esc(folder.color || '#5b7cfa')}">
      <span class="folder-banner-ico">${icon(folderIconName(folder), 24)}</span>
      <div class="folder-banner-main">
        <h2>${esc(folder.name)}</h2>
        <p>${meta.count || 0} catatan</p>
      </div>
      <button class="icon-btn" data-action="folder-menu" data-id="${esc(folder.id)}" aria-label="Opsi folder">${icon('more', 19)}</button>
    </div>` : '';

  const groupHTML = groups.map((group) => `
    <section class="note-group">
      <div class="group-head">
        <h2 class="group-title">${esc(group.label)}</h2>
        <span class="group-count">${group.notes.length}</span>
      </div>
      ${viewMode === 'grid'
        ? `<div class="note-grid">${rows(group.notes)}</div>`
        : `<div class="note-rows">${rows(group.notes)}</div>`}
    </section>`).join('');

  return `
    <div class="collection view-enter">
      ${folderBanner}
      ${!selectionMode ? filterChips : ''}
      ${trashBanner}
      ${groupHTML || (meta.emptyHTML || '')}
      ${hasMore ? `<button class="load-more" data-action="load-more">Muat ${remaining} catatan lagi</button>` : ''}
    </div>`;
}

/* ============================================================
   Halaman folder
   ============================================================ */

export function foldersPageHTML({ categories, notes, activeFolderId = null }) {
  const counts = new Map();
  for (const n of notes) {
    if (n.isDeleted || n.isArchived || !n.categoryId) continue;
    counts.set(n.categoryId, (counts.get(n.categoryId) || 0) + 1);
  }
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const uncategorized = notes.filter((n) => !n.isDeleted && !n.isArchived && !n.categoryId).length;

  return `
    <div class="folders-page view-enter">
      <div class="folders-head">
        <div>
          <h2>Semua folder</h2>
          <p>${sorted.length} folder · ${counts.size ? [...counts.values()].reduce((a, b) => a + b, 0) : 0} catatan terorganisir</p>
        </div>
      </div>
      <div class="folder-grid">
        ${sorted.map((c) => folderCardHTML(c, { count: counts.get(c.id) || 0, active: c.id === activeFolderId })).join('')}
        <button class="folder-card folder-card-new" data-action="folder-new">
          <span class="folder-new-ico">${icon('plus', 24)}</span>
          <span>Folder Baru</span>
        </button>
      </div>
      ${uncategorized ? `
        <div class="uncat-hint">
          ${icon('info', 17)}
          <span>${uncategorized} catatan belum masuk folder. Kamu bisa memindahkannya lewat menu catatan.</span>
        </div>` : ''}
      ${!sorted.length ? emptyStateHTML({
        ico: 'folderPlus',
        title: 'Belum ada folder',
        text: 'Kelompokkan catatan berdasarkan pekerjaan, ide, atau topik favoritmu.',
        actions: `<button class="btn btn-primary" data-action="folder-new">${icon('plus', 17)} Buat Folder</button>`
      }) : ''}
    </div>`;
}

/* ============================================================
   Halaman pencarian
   ============================================================ */

export function searchPageHTML({
  query, highlightQuery = '', filters, folder, groups, resultCount, categories, recentSearches = []
}) {
  const highlight = String(highlightQuery || '').trim();
  const hasFilters = Object.values(filters || {}).some((v) => Boolean(v));
  const activeQuery = query.trim() || hasFilters;

  const chip = (key, label, ico) => `
    <button class="filter-chip${filters?.[key] ? ' active' : ''}" data-action="search-filter" data-filter="${key}">
      ${icon(ico, 15)} ${label}
    </button>`;

  if (!activeQuery) {
    return `
      <div class="search-page view-enter">
        <div class="search-hero">
          <div class="search-hero-ico">${icon('search', 36)}</div>
          <h2>Cari apa pun</h2>
          <p>Cari judul, isi catatan, tag, atau folder. Gunakan operator untuk pencarian lebih presisi.</p>
        </div>
        <div class="search-filters">
          ${chip('favorite', 'Favorit', 'star')}
          ${chip('checklist', 'Checklist', 'checklist')}
          ${chip('image', 'Gambar', 'image')}
          ${chip('audio', 'Rekaman', 'mic')}
          ${chip('archived', 'Arsip', 'archive')}
        </div>
        ${recentSearches.length ? `
          <div class="search-section">
            <div class="search-section-head"><h3>Pencarian terakhir</h3><button data-action="clear-recent-searches">Hapus</button></div>
            <div class="recent-searches">
              ${recentSearches.map((q) => `<button class="recent-chip" data-action="recent-search" data-query="${esc(q)}">${icon('clock', 14)} ${esc(q)}</button>`).join('')}
            </div>
          </div>` : ''}
        <button class="search-tips-card" data-action="search-tips">
          <span class="search-tips-ico">${icon('sparkles', 22)}</span>
          <span>
            <strong>Tips pencarian</strong>
            <small>Gunakan #tag, is:favorite, has:checklist, before:2026-01-01</small>
          </span>
          ${icon('chevronRight', 18)}
        </button>
      </div>`;
  }

  const groupsHTML = groups.map((group) => `
    <section class="note-group">
      <div class="group-head"><h2 class="group-title">${esc(group.label)}</h2><span class="group-count">${group.notes.length}</span></div>
      <div class="note-rows">
        ${group.notes.map((n) => noteRowHTML(n, {
          query: highlight, page: 'search', categories, selectionMode: false, selected: false
        })).join('')}
      </div>
    </section>`).join('');

  return `
    <div class="search-page view-enter">
      <div class="search-filters">
        <button class="filter-chip${!hasFilters ? ' active' : ''}" data-action="clear-search-filters">${icon('search', 15)} Semua</button>
        ${chip('favorite', 'Favorit', 'star')}
        ${chip('checklist', 'Checklist', 'checklist')}
        ${chip('image', 'Gambar', 'image')}
        ${chip('audio', 'Rekaman', 'mic')}
        ${chip('archived', 'Arsip', 'archive')}
        ${folder ? `<button class="filter-chip active" data-action="search-folder">${icon('folder', 15)} ${esc(folder.name)} ${icon('close', 13)}</button>` : `<button class="filter-chip" data-action="search-folder">${icon('folder', 15)} Folder</button>`}
      </div>
      <div class="search-summary">
        <span>${resultCount} hasil${query.trim() ? ` untuk “${esc(query.trim())}”` : ''}</span>
        ${hasFilters || query ? `<button data-action="clear-search">Hapus filter</button>` : ''}
      </div>
      ${groupsHTML || emptyStateHTML({
        ico: 'searchX',
        title: 'Tidak ditemukan',
        text: 'Coba kata kunci lain, periksa ejaan, atau gunakan filter yang lebih luas.',
        actions: `<button class="btn btn-ghost" data-action="clear-search">Hapus pencarian</button>`
      })}
    </div>`;
}

/* ============================================================
   Editor
   ============================================================ */

export function editorHTML({ note, category, settings }) {
  const tags = note.tags || [];
  const paper = note.paper || 'blank';
  const font = note.font || settings.editorFont || 'sans';
  const tint = note.color ? ` style="--note-tint:${esc(note.color)}"` : '';
  return `
    <div class="editor-view view-enter" id="editor-view">
      <div class="editor-scroll" id="editor-scroll">
        <div class="editor-meta" id="editor-meta">
          <button class="meta-chip folder-chip" id="editor-folder-chip" data-action="editor-pick-folder">
            <span class="meta-dot" style="background:${esc(category?.color || 'transparent')}"></span>
            <span>${esc(category?.name || 'Tanpa folder')}</span>
            ${icon('chevronDown', 13)}
          </button>
          <div class="tag-editor" id="editor-tags">
            <span class="tag-chips" id="editor-tag-chips">
              ${tags.map((t) => `<span class="tag-chip">#${esc(t)}<button type="button" data-action="tag-remove" data-tag="${esc(t)}" aria-label="Hapus tag ${esc(t)}">${icon('close', 11)}</button></span>`).join('')}
            </span>
            <input id="tag-input" class="tag-input" type="text" placeholder="${tags.length ? '+ tag' : 'Tambah tag'}" autocomplete="off" maxlength="30" />
          </div>
          <span class="editor-updated" id="editor-updated">${icon('clock', 13)} ${relativeTime(note.updatedAt)}</span>
        </div>

        <div class="editor-paper paper-${esc(paper)} font-${esc(font)}${note.color ? ' has-tint' : ''}"
             id="editor-paper"${tint}>
          <input id="editor-title" class="editor-title" type="text" placeholder="Judul catatan"
                 value="${esc(note.title || '')}" maxlength="240" autocomplete="off" spellcheck="false" />
          <div id="editor-body" class="editor-body" contenteditable="true"
               spellcheck="${settings.spellcheck !== false ? 'true' : 'false'}"
               data-placeholder="Mulai menulis…"></div>
        </div>

        <div class="editor-foot" id="editor-foot">
          <span id="editor-stats">0 kata · 0 karakter</span>
          <span id="editor-updated-full">${fmtDateTime(note.updatedAt)}</span>
          <button data-action="editor-info" class="editor-foot-link">Info</button>
        </div>
      </div>
      <div class="editor-toolbar-wrap" id="editor-toolbar-wrap"></div>
    </div>`;
}

export function notePreviewHTML({ note, category }) {
  const chk = countChecklist(note.content);
  return `
    <div class="preview-page view-enter">
      <article class="preview-paper">
        <div class="preview-badges">
          ${category ? `<span class="chip" style="--chip-color:${esc(category.color || '#5b7cfa')}">${icon(folderIconName(category), 13)} ${esc(category.name)}</span>` : ''}
          <span class="chip danger">${icon('trash', 13)} Di sampah</span>
        </div>
        <h1>${esc(note.title || 'Tanpa judul')}</h1>
        <div class="preview-meta">
          <span>${icon('calendar', 14)} Dibuat ${fmtDate(note.createdAt)}</span>
          <span>${icon('clock', 14)} Dihapus ${fmtDate(note.deletedAt || note.updatedAt)}</span>
          ${chk.total ? `<span>${icon('checkCircle', 14)} ${chk.done}/${chk.total} tugas</span>` : ''}
        </div>
        <div class="divider"></div>
        <div class="preview-content editor-body">${sanitizeHTML(note.content || '') || '<p class="note-empty">Tidak ada isi.</p>'}</div>
      </article>
      <div class="preview-actions">
        <button class="btn btn-primary" data-action="detail-restore" data-id="${esc(note.id)}">${icon('restore', 18)} Pulihkan</button>
        <button class="btn btn-ghost" data-action="detail-delete-permanent" data-id="${esc(note.id)}">${icon('trash', 18)} Hapus permanen</button>
      </div>
    </div>`;
}

/* ============================================================
   Pengaturan
   ============================================================ */

const ACCENTS = ['#5b7cfa', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#64748b'];
const THEMES = [['light', 'Terang', 'sun'], ['dark', 'Gelap', 'moon'], ['system', 'Sistem', 'monitor']];
const SORTS = [
  ['updatedAt', 'Terakhir diperbarui'], ['createdAt', 'Terbaru dibuat'],
  ['title', 'Judul A–Z'], ['oldest', 'Paling lama']
];

function switchHTML(key, value) {
  return `<button type="button" class="switch${value ? ' on' : ''}" data-action="toggle-setting" data-key="${key}"
    role="switch" aria-checked="${value ? 'true' : 'false'}" aria-label="${key}"><span></span></button>`;
}

export function settingsHTML({ settings, counts, lastBackupAt }) {
  const themeLabel = THEMES.find(([v]) => v === settings.theme)?.[1] || 'Sistem';
  return `
    <div class="settings-page view-enter">
      <section class="settings-section">
        <h2 class="settings-heading">Tampilan</h2>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-row-main">
              <span class="settings-ico">${icon('sunMoon', 19)}</span>
              <div><div class="settings-title">Tema</div><div class="settings-sub">Saat ini: ${themeLabel}</div></div>
            </div>
            <div class="seg">
              ${THEMES.map(([v, label, ico]) => `<button data-action="set-theme" data-value="${v}" class="${settings.theme === v ? 'active' : ''}">${icon(ico, 15)}<span class="only-desktop-label">${label}</span></button>`).join('')}
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-row-main">
              <span class="settings-ico">${icon('palette', 19)}</span>
              <div><div class="settings-title">Warna aksen</div><div class="settings-sub">Warna tombol dan sorotan</div></div>
            </div>
            <div class="accent-swatches">
              ${ACCENTS.map((c) => `<button class="accent-swatch${settings.accent === c ? ' active' : ''}" style="--sw:${c}" data-action="set-accent" data-value="${c}" aria-label="Aksen ${c}"></button>`).join('')}
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-row-main">
              <span class="settings-ico">${icon('list', 19)}</span>
              <div><div class="settings-title">Tampilan daftar</div><div class="settings-sub">Baris ringkas atau kartu</div></div>
            </div>
            <div class="seg">
              <button data-action="set-view" data-value="list" class="${settings.viewMode === 'list' ? 'active' : ''}">${icon('list', 15)} Daftar</button>
              <button data-action="set-view" data-value="grid" class="${settings.viewMode === 'grid' ? 'active' : ''}">${icon('grid', 15)} Grid</button>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-row-main">
              <span class="settings-ico">${icon('calendar', 19)}</span>
              <div><div class="settings-title">Kelompokkan per tanggal</div><div class="settings-sub">Hari ini, kemarin, dan seterusnya</div></div>
            </div>
            ${switchHTML('groupByDate', settings.groupByDate)}
          </div>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-heading">Editor</h2>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-row-main">
              <span class="settings-ico">${icon('textAa', 19)}</span>
              <div><div class="settings-title">Ukuran teks editor</div><div class="settings-sub">Nyaman untuk membaca dan menulis</div></div>
            </div>
            <div class="range-wrap">
              <input id="font-size-range" class="range" type="range" min="14" max="24" step="1" value="${settings.fontSize}" aria-label="Ukuran teks" />
              <span class="range-label" id="font-size-label">${settings.fontSize}px</span>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-row-main">
              <span class="settings-ico">${icon('type', 19)}</span>
              <div><div class="settings-title">Jenis huruf</div><div class="settings-sub">Huruf bawaan untuk catatan baru</div></div>
            </div>
            <div class="seg">
              <button data-action="set-font" data-value="sans" class="${settings.editorFont === 'sans' ? 'active' : ''}">Sans</button>
              <button data-action="set-font" data-value="serif" class="${settings.editorFont === 'serif' ? 'active' : ''}">Serif</button>
              <button data-action="set-font" data-value="mono" class="${settings.editorFont === 'mono' ? 'active' : ''}">Mono</button>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-row-main">
              <span class="settings-ico">${icon('check2', 19)}</span>
              <div><div class="settings-title">Pindahkan tugas selesai ke bawah</div><div class="settings-sub">Saat checklist dicentang</div></div>
            </div>
            ${switchHTML('moveChecked', settings.moveChecked)}
          </div>
          <div class="settings-row">
            <div class="settings-row-main">
              <span class="settings-ico">${icon('keyboard', 19)}</span>
              <div><div class="settings-title">Periksa ejaan</div><div class="settings-sub">Garis bawah pada kata yang salah</div></div>
            </div>
            ${switchHTML('spellcheck', settings.spellcheck)}
          </div>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-heading">Perilaku</h2>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-row-main">
              <span class="settings-ico">${icon('sparkles', 19)}</span>
              <div><div class="settings-title">Getaran halus</div><div class="settings-sub">Umpan balik saat memilih dan menggeser</div></div>
            </div>
            ${switchHTML('haptics', settings.haptics)}
          </div>
          <div class="settings-row">
            <div class="settings-row-main">
              <span class="settings-ico">${icon('move', 19)}</span>
              <div><div class="settings-title">Geser untuk tindakan</div><div class="settings-sub">Geser kanan untuk pin, kiri untuk hapus</div></div>
            </div>
            ${switchHTML('swipeActions', settings.swipeActions)}
          </div>
          <div class="settings-row">
            <div class="settings-row-main">
              <span class="settings-ico">${icon('alert', 19)}</span>
              <div><div class="settings-title">Konfirmasi sebelum menghapus</div><div class="settings-sub">Mencegah terhapus tanpa sengaja</div></div>
            </div>
            ${switchHTML('confirmDelete', settings.confirmDelete)}
          </div>
          <div class="settings-row">
            <div class="settings-row-main">
              <span class="settings-ico">${icon('trash', 19)}</span>
              <div><div class="settings-title">Bersihkan sampah otomatis</div><div class="settings-sub">Hapus permanen setelah 30 hari</div></div>
            </div>
            ${switchHTML('autoPurgeTrash', settings.autoPurgeTrash)}
          </div>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-heading">Data & cadangan</h2>
        <div class="settings-card">
          <div class="storage-card">
            <div class="storage-top">
              <div>
                <div class="settings-title">Penyimpanan lokal</div>
                <div class="settings-sub" id="storage-detail">Menghitung…</div>
              </div>
              <strong id="storage-used">—</strong>
            </div>
            <div class="storage-bar large"><span id="storage-fill" style="width:0%"></span></div>
            <div class="storage-foot">
              <span>${counts.all + counts.archive + counts.trash} catatan · ${counts.folders} folder</span>
              <button data-action="storage-refresh">${icon('refresh', 14)} Segarkan</button>
            </div>
          </div>
          <button class="settings-link" data-action="export-data">
            <span class="settings-ico">${icon('download', 19)}</span>
            <span><strong>Ekspor backup JSON</strong><small>Semua catatan, folder, pengaturan, dan riwayat</small></span>
            ${icon('chevronRight', 17)}
          </button>
          <button class="settings-link" data-action="export-markdown">
            <span class="settings-ico">${icon('markdown', 19)}</span>
            <span><strong>Ekspor Markdown</strong><small>File .md yang bisa dibuka di aplikasi lain</small></span>
            ${icon('chevronRight', 17)}
          </button>
          <button class="settings-link" data-action="import-data">
            <span class="settings-ico">${icon('upload', 19)}</span>
            <span><strong>Impor backup</strong><small>Gabungkan atau ganti data di perangkat ini</small></span>
            ${icon('chevronRight', 17)}
          </button>
          <button class="settings-link" data-action="print-all">
            <span class="settings-ico">${icon('print', 19)}</span>
            <span><strong>Cetak / simpan PDF</strong><small>Cetak semua catatan lewat dialog browser</small></span>
            ${icon('chevronRight', 17)}
          </button>
          <input type="file" id="import-file" accept="application/json,.json" hidden />
          <div class="settings-note">
            ${icon('info', 15)}
            <span>Terakhir backup: <strong id="last-backup-label">${lastBackupAt ? fmtDateTime(lastBackupAt) : 'Belum pernah'}</strong>. Data hanya tersimpan di perangkat ini.</span>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-heading">Aplikasi</h2>
        <div class="settings-card">
          <button class="settings-link" data-action="install-app">
            <span class="settings-ico">${icon('download', 19)}</span>
            <span><strong>Pasang di layar utama</strong><small>Berjalan seperti aplikasi, tetap offline</small></span>
            ${icon('chevronRight', 17)}
          </button>
          <button class="settings-link" data-action="show-shortcuts">
            <span class="settings-ico">${icon('keyboard', 19)}</span>
            <span><strong>Pintasan keyboard</strong><small>Semua tombol cepat</small></span>
            ${icon('chevronRight', 17)}
          </button>
          <button class="settings-link" data-action="about">
            <span class="settings-ico">${icon('info', 19)}</span>
            <span><strong>Tentang Catatan</strong><small>Versi 2.0 · offline-first</small></span>
            ${icon('chevronRight', 17)}
          </button>
          <button class="settings-link" data-action="check-update">
            <span class="settings-ico">${icon('refresh', 19)}</span>
            <span><strong>Periksa pembaruan</strong><small>Cari versi terbaru aplikasi</small></span>
            ${icon('chevronRight', 17)}
          </button>
          <button class="settings-link" data-action="reset-settings">
            <span class="settings-ico">${icon('restore', 19)}</span>
            <span><strong>Atur ulang tampilan</strong><small>Kembalikan pengaturan ke bawaan</small></span>
            ${icon('chevronRight', 17)}
          </button>
          <button class="settings-link danger" data-action="clear-all">
            <span class="settings-ico">${icon('trash', 19)}</span>
            <span><strong>Hapus semua data</strong><small>Catatan, folder, sampah, dan pengaturan</small></span>
            ${icon('chevronRight', 17)}
          </button>
        </div>
      </section>

      <div class="settings-footer">
        ${BRAND_SVG}
        <div><strong>Catatan 2.0</strong><span>Dibuat untuk tulisanmu. Semua data milikmu.</span></div>
      </div>
    </div>`;
}

/* ============================================================
   Banner PWA
   ============================================================ */

export function pwaBannerHTML({ kind }) {
  if (kind === 'update') {
    return `
      <div class="pwa-banner">
        <span class="pwa-ico">${icon('refresh', 20)}</span>
        <div class="pwa-text"><strong>Pembaruan tersedia</strong><span>Versi baru Catatan sudah siap.</span></div>
        <button class="btn btn-primary btn-sm" data-action="update-now">Perbarui</button>
        <button class="pwa-close" data-action="dismiss-pwa" aria-label="Tutup">${icon('close', 16)}</button>
      </div>`;
  }
  if (kind === 'install') {
    return `
      <div class="pwa-banner">
        <span class="pwa-ico">${icon('download', 20)}</span>
        <div class="pwa-text"><strong>Pasang Catatan</strong><span>Buka lebih cepat, tetap offline.</span></div>
        <button class="btn btn-primary btn-sm" data-action="install-app">Pasang</button>
        <button class="pwa-close" data-action="dismiss-pwa" aria-label="Tutup">${icon('close', 16)}</button>
      </div>`;
  }
  return '';
}

export { ACCENTS, THEMES, SORTS };
