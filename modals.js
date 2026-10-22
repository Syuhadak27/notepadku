/* ============================================================
   modals.js — pengelola modal, dialog, menu, dan command palette
   ============================================================ */

import { icon, BRAND_SVG } from './icons.js';
import {
  esc, fmtDateTime, fmtDate, relativeTime, htmlToText, countWords,
  noteTags, formatBytes
} from './utils.js';

/* ============================================================
   Manajer modal & riwayat browser
   ============================================================ */

let stack = [];
let sentinelActive = false;
let seq = 0;

const root = () => document.getElementById('modal-root');

function withoutModalFlag(state) {
  if (!state || typeof state !== 'object') return null;
  const copy = { ...state };
  delete copy.__catatanModal;
  return copy;
}

/**
 * Satu entri riwayat sentinel dipakai untuk seluruh tumpukan modal. Entri
 * ini tidak pernah dihapus dengan history.go() karena popstate dari
 * history.go() bisa tiba setelah modal baru dibuka dan menutup modal yang
 * salah. Saat modal terakhir ditutup, entri sentinel diubah menjadi entri
 * halaman biasa dengan replaceState().
 */
function pushSentinel() {
  if (sentinelActive) return;
  try {
    history.pushState({ ...(history.state || {}), __catatanModal: true }, '', location.href);
    sentinelActive = true;
  } catch (_) {
    sentinelActive = false;
  }
}

function neutralizeSentinel() {
  if (!sentinelActive) return;
  sentinelActive = false;
  try {
    history.replaceState(withoutModalFlag(history.state), '', location.href);
  } catch (_) { /* noop */ }
}

/**
 * Panggil dari listener popstate aplikasi. Mengembalikan true jika
 * event sudah dipakai untuk menutup modal.
 */
export function handleModalPopState() {
  if (!sentinelActive) {
    // Bersihkan penanda sentinel basi (mis. sisa sesi lama) tanpa
    // mengubah posisi riwayat.
    if (history.state?.__catatanModal) {
      try { history.replaceState(withoutModalFlag(history.state), '', location.href); } catch (_) { /* noop */ }
    }
    return false;
  }

  // Sentinel baru saja dilewati. Jangan pernah menyentuh modal yang
  // dibuka setelah navigasi ini karena sentinel tidak terkait dengannya.
  sentinelActive = false;

  if (!stack.length) return false;

  const top = stack[stack.length - 1];
  closeEntry(top, undefined, { fromHistory: true });

  // Masih ada modal di bawahnya: sediakan sentinel baru agar tombol
  // kembali tetap menutup modal berikutnya.
  if (stack.length) pushSentinel();
  return true;
}

export function isModalOpen() {
  return stack.length > 0;
}

/**
 * Dipanggil sebelum aplikasi berpindah halaman. Membersihkan modal yang
 * tersisa dan membatalkan pembersihan riwayat yang tertunda agar tidak
 * memotong entri rute yang baru.
 */
export function prepareNavigation() {
  neutralizeSentinel();
  if (!stack.length) {
    document.documentElement.classList.remove('modal-open');
    return;
  }
  while (stack.length) {
    const entry = stack.pop();
    entry.closed = true;
    entry.layer.remove();
    try { entry.opts?.onClose?.(undefined); } catch (_) { /* noop */ }
    entry.resolve?.(undefined);
  }
  document.documentElement.classList.remove('modal-open');
}

export function closeTopModal(value) {
  const top = stack[stack.length - 1];
  if (top) closeEntry(top, value, {});
}

export function closeAllModals(value) {
  while (stack.length) {
    const top = stack[stack.length - 1];
    closeEntry(top, value, {});
  }
}

function closeEntry(entry, value, { fromHistory = false } = {}) {
  if (!entry || entry.closed) return;
  entry.closed = true;

  const idx = stack.indexOf(entry);
  if (idx >= 0) stack.splice(idx, 1);

  entry.layer.classList.remove('is-open');
  entry.layer.classList.add('is-closing');

  const previous = stack[stack.length - 1];
  if (previous) previous.layer.classList.remove('is-covered');

  setTimeout(() => {
    entry.layer.remove();
    if (!stack.length) {
      const active = document.querySelector('.modal-layer');
      if (!active) document.documentElement.classList.remove('modal-open');
    }
  }, 220);

  try { entry.previousFocus?.focus?.({ preventScroll: true }); } catch (_) { /* noop */ }
  if (!stack.length) document.documentElement.classList.remove('modal-open');

  try { entry.opts?.onClose?.(value); } catch (err) { console.warn('[modal close]', err); }
  entry.resolve?.(value);

  if (stack.length === 0) neutralizeSentinel();
  void fromHistory;
}

/**
 * Buka modal. Mengembalikan entri dengan `promise`, `close`, `layer`, `sheet`.
 */
export function openModal({
  title = '',
  subtitle = '',
  iconName = '',
  body = '',
  footer = '',
  className = '',
  full = false,
  dismissible = true,
  hideHeader = false,
  ariaLabel = '',
  onMount = null,
  onClose = null
} = {}) {
  const host = root();
  if (!host) throw new Error('Modal root tidak ditemukan.');

  const id = `modal-${++seq}`;
  const headingId = `${id}-title`;
  const layer = document.createElement('div');
  layer.className = `modal-layer${full ? ' modal-fullscreen' : ''}`;
  layer.dataset.modalId = id;
  layer.innerHTML = `
    <div class="modal-backdrop" ${dismissible ? 'data-modal-dismiss' : ''}></div>
    <section class="modal-sheet ${className}" role="dialog" aria-modal="true"
             ${ariaLabel || title ? `aria-labelledby="${headingId}"` : ''}>
      ${hideHeader ? '' : `
        <header class="modal-head">
          ${iconName ? `<span class="modal-icon">${icon(iconName, 21)}</span>` : ''}
          <div class="modal-title-wrap">
            <h2 class="modal-title" id="${headingId}">${esc(title)}</h2>
            ${subtitle ? `<p class="modal-sub">${esc(subtitle)}</p>` : ''}
          </div>
          ${dismissible ? `<button type="button" class="icon-btn modal-close" data-modal-close aria-label="Tutup">${icon('close', 19)}</button>` : ''}
        </header>`}
      <div class="modal-body${hideHeader ? ' no-pad-top' : ''}">${body}</div>
      ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
    </section>`;

  if (stack.length) stack[stack.length - 1].layer.classList.add('is-covered');
  host.appendChild(layer);
  document.documentElement.classList.add('modal-open');

  const wasSentinelActive = sentinelActive;
  pushSentinel();
  const pushed = !wasSentinelActive && sentinelActive;

  const previousFocus = document.activeElement;
  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });

  const entry = {
    id,
    layer,
    sheet: layer.querySelector('.modal-sheet'),
    opts: { onClose },
    closed: false,
    historyPushed: pushed,
    previousFocus,
    promise,
    resolve: resolvePromise,
    close(value) { closeEntry(entry, value, {}); }
  };
  stack.push(entry);

  layer.addEventListener('click', (e) => {
    if (e.target.closest('[data-modal-dismiss]') || e.target.closest('[data-modal-close]')) {
      e.preventDefault();
      entry.close(undefined);
    }
  });

  layer.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusables = Array.from(layer.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  try { onMount?.(entry.sheet, entry); } catch (err) { console.error('[modal mount]', err); }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!entry.closed) layer.classList.add('is-open');
      if (!entry.closed) {
        const target = layer.querySelector('[autofocus]') ||
          layer.querySelector('.modal-body input, .modal-body textarea, .modal-body button, .modal-foot button');
        try { target?.focus?.({ preventScroll: true }); } catch (_) { /* noop */ }
      }
    });
  });

  return entry;
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !stack.length) return;
  e.preventDefault();
  e.stopPropagation();
  closeTopModal(undefined);
}, true);

/* ============================================================
   Potongan HTML yang dipakai beberapa modal
   ============================================================ */

function menuItemsHTML(items) {
  return items.map((item) => {
    if (item.type === 'divider') return '<div class="menu-divider"></div>';
    if (item.type === 'label') return `<div class="menu-label">${esc(item.label)}</div>`;
    return `
      <button type="button" class="menu-item${item.danger ? ' danger' : ''}" data-menu-action="${esc(item.action)}"
              ${item.disabled ? 'disabled' : ''}>
        <span class="menu-ico">${icon(item.icon || 'note', 19)}</span>
        <span class="menu-text">
          <strong>${esc(item.label)}</strong>
          ${item.sub ? `<small>${esc(item.sub)}</small>` : ''}
        </span>
        ${item.trailing !== undefined
          ? `<span class="menu-trailing">${item.trailing}</span>`
          : item.checked ? `<span class="menu-check">${icon('check', 18)}</span>` : ''}
      </button>`;
  }).join('');
}

function menuFooter(cancelText = 'Batal') {
  return `<button type="button" class="btn btn-ghost btn-block" data-modal-close>${esc(cancelText)}</button>`;
}

function bindMenuActions(modal, mapper = (action) => ({ action })) {
  modal.layer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-menu-action]');
    if (!btn || btn.disabled) return;
    modal.close(mapper(btn.dataset.menuAction, btn));
  });
}

const FOLDER_COLORS = [
  '#5b7cfa', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#f59e0b', '#10b981', '#06b6d4', '#64748b', '#0ea5e9'
];

const FOLDER_ICONS = [
  'folder', 'folderOpen', 'note', 'notes', 'star', 'tag',
  'home', 'archive', 'image', 'calendar', 'clock', 'sparkles'
];

/* ============================================================
   Dialog dasar
   ============================================================ */

export async function confirmDialog({
  title = 'Konfirmasi',
  message = '',
  confirmText = 'Ya, lanjutkan',
  cancelText = 'Batal',
  danger = false,
  iconName = 'alert',
  details = ''
} = {}) {
  const modal = openModal({
    title,
    iconName,
    className: 'modal-dialog',
    body: `
      <p class="dialog-message">${esc(message)}</p>
      ${details ? `<div class="dialog-details">${details}</div>` : ''}`,
    footer: `
      <button type="button" class="btn btn-ghost" data-modal-close autofocus>${esc(cancelText)}</button>
      <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${esc(confirmText)}</button>`
  });
  modal.sheet.querySelector('[data-confirm]').addEventListener('click', () => modal.close(true));
  const result = await modal.promise;
  return result === true;
}

export async function promptDialog({
  title = 'Masukkan teks',
  label = '',
  value = '',
  placeholder = '',
  confirmText = 'Simpan',
  cancelText = 'Batal',
  maxlength = 240,
  multiline = false,
  hint = '',
  validate = null
} = {}) {
  const field = multiline
    ? `<textarea class="input textarea" id="prompt-value" rows="4" maxlength="${maxlength}"
         placeholder="${esc(placeholder)}" autofocus>${esc(value)}</textarea>`
    : `<input class="input" id="prompt-value" type="text" maxlength="${maxlength}" value="${esc(value)}"
         placeholder="${esc(placeholder)}" autocomplete="off" autofocus />`;

  const modal = openModal({
    title,
    iconName: 'edit',
    className: 'modal-dialog',
    body: `
      <div class="field">
        ${label ? `<label class="field-label" for="prompt-value">${esc(label)}</label>` : ''}
        ${field}
        ${hint ? `<p class="field-hint">${esc(hint)}</p>` : ''}
        <p class="field-error" id="prompt-error" hidden></p>
      </div>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-modal-close>${esc(cancelText)}</button>
      <button type="button" class="btn btn-primary" data-confirm>${esc(confirmText)}</button>`
  });

  const input = modal.sheet.querySelector('#prompt-value');
  const errorEl = modal.sheet.querySelector('#prompt-error');

  const submit = () => {
    const raw = input.value.trim();
    const error = validate ? validate(raw) : (!raw ? 'Kolom ini tidak boleh kosong.' : null);
    if (error) {
      errorEl.textContent = error;
      errorEl.hidden = false;
      input.focus();
      return;
    }
    modal.close(raw);
  };

  modal.sheet.querySelector('[data-confirm]').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Enter') e.stopPropagation();
  });
  setTimeout(() => { try { input.focus(); input.select(); } catch (_) {} }, 60);

  const result = await modal.promise;
  return result === undefined ? null : result;
}

/* ============================================================
   Menu catatan
   ============================================================ */

export function openNoteMenu({ note, categories = [], settings = {}, fromEditor = false } = {}) {
  const isTrash = Boolean(note?.isDeleted);
  const cat = (categories || []).find((c) => c.id === note?.categoryId);
  const tags = noteTags(note);

  let items;
  if (isTrash) {
    items = [
      { action: 'restore', icon: 'restore', label: 'Pulihkan catatan', sub: 'Kembalikan ke daftar catatan' },
      { action: 'copy', icon: 'copy', label: 'Salin teks', sub: 'Salin judul dan isi catatan' },
      { type: 'divider' },
      { action: 'delete-permanent', icon: 'trashX', label: 'Hapus permanen', sub: 'Tidak dapat dikembalikan', danger: true }
    ];
  } else {
    items = [
      ...(!fromEditor ? [{ action: 'open', icon: 'edit', label: 'Buka catatan' }] : []),
      { action: 'pin', icon: note?.isPinned ? 'pinFill' : 'pin', label: note?.isPinned ? 'Lepas sematan' : 'Sematkan di atas' },
      { action: 'favorite', icon: note?.isFavorite ? 'starFill' : 'star', label: note?.isFavorite ? 'Hapus dari favorit' : 'Tambahkan ke favorit' },
      { action: 'archive', icon: 'archive', label: note?.isArchived ? 'Keluarkan dari arsip' : 'Arsipkan' },
      { action: 'move', icon: 'folder', label: 'Pindahkan ke folder', sub: cat ? cat.name : 'Tanpa folder' },
      { type: 'divider' },
      { action: 'style', icon: 'palette', label: 'Ganti tampilan', sub: 'Warna, kertas, dan huruf' },
      { action: 'versions', icon: 'history', label: 'Riwayat versi', sub: 'Lihat perubahan sebelumnya' },
      { action: 'duplicate', icon: 'copy', label: 'Buat salinan' },
      { action: 'copy', icon: 'fileText', label: 'Salin teks' },
      { action: 'share', icon: 'share', label: 'Bagikan' },
      { action: 'markdown', icon: 'markdown', label: 'Ekspor Markdown' },
      { action: 'info', icon: 'info', label: 'Info catatan' },
      { type: 'divider' },
      { action: 'delete', icon: 'trash', label: 'Pindahkan ke sampah', danger: true }
    ];
  }

  const subtitle = note?.title || (tags.length ? tags.map((t) => '#' + t).join(' ') : 'Tanpa judul');
  const modal = openModal({
    title: isTrash ? 'Opsi catatan' : 'Opsi catatan',
    subtitle,
    iconName: isTrash ? 'trash' : 'note',
    className: 'modal-menu',
    body: `<div class="menu-list">${menuItemsHTML(items)}</div>`,
    footer: menuFooter()
  });
  bindMenuActions(modal);
  return modal.promise.then((value) => value || null);
}

/* ============================================================
   Folder
   ============================================================ */

export function openFolderPicker({
  categories = [], currentId = null, allowNone = true,
  noneLabel = 'Tanpa folder', title = 'Pindahkan ke folder',
  subtitle = '', counts = null
} = {}) {
  const rows = [];
  if (allowNone) {
    rows.push({
      action: 'none',
      icon: 'inbox',
      label: noneLabel,
      checked: currentId === null || currentId === undefined
    });
  }
  for (const c of categories) {
    rows.push({
      action: c.id,
      icon: c.icon || 'folder',
      label: c.name,
      sub: counts ? `${counts.get(c.id) || 0} catatan` : '',
      checked: currentId === c.id,
      color: c.color
    });
  }

  const body = `
    <div class="menu-list folder-picker">
      ${rows.map((row) => `
        <button type="button" class="menu-item folder-pick" data-folder-id="${esc(row.action)}">
          <span class="menu-ico folder-pick-ico" ${row.color ? `style="--folder-color:${esc(row.color)}"` : ''}>
            ${icon(row.icon === 'inbox' ? 'tag' : row.icon, 19)}
          </span>
          <span class="menu-text"><strong>${esc(row.label)}</strong>${row.sub ? `<small>${esc(row.sub)}</small>` : ''}</span>
          ${row.checked ? `<span class="menu-check">${icon('check', 18)}</span>` : ''}
        </button>`).join('')}
      ${!rows.length ? `<div class="menu-empty">${icon('folder', 26)}<p>Belum ada folder.</p></div>` : ''}
    </div>`;

  const modal = openModal({
    title,
    subtitle,
    iconName: 'folder',
    className: 'modal-menu',
    body,
    footer: menuFooter()
  });

  modal.layer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-folder-id]');
    if (!btn) return;
    modal.close({ folderId: btn.dataset.folderId === 'none' ? null : btn.dataset.folderId });
  });

  return modal.promise.then((value) => value || null);
}

export function openFolderForm({ category = null } = {}) {
  const editing = Boolean(category);
  let color = category?.color || FOLDER_COLORS[0];
  let iconName = category?.icon || 'folder';

  const body = `
    <form class="folder-form" id="folder-form" novalidate>
      <div class="folder-form-preview">
        <span class="folder-form-ico" id="folder-form-preview" style="--folder-color:${esc(color)}">
          ${icon(iconName, 28)}
        </span>
        <div>
          <strong id="folder-form-name-preview">${esc(category?.name || 'Folder baru')}</strong>
          <span>Tampilan folder</span>
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="folder-name">Nama folder</label>
        <input class="input" id="folder-name" type="text" maxlength="60" autocomplete="off"
               placeholder="Contoh: Kuliah, Ide, Pekerjaan" value="${esc(category?.name || '')}" autofocus />
        <p class="field-error" id="folder-error" hidden></p>
      </div>
      <div class="field">
        <span class="field-label">Warna</span>
        <div class="swatch-row">
          ${FOLDER_COLORS.map((c) => `
            <button type="button" class="swatch color-swatch${c === color ? ' active' : ''}"
                    style="--sw:${c}" data-folder-color="${c}" aria-label="Warna ${c}"></button>`).join('')}
        </div>
      </div>
      <div class="field">
        <span class="field-label">Ikon</span>
        <div class="icon-choice-grid">
          ${FOLDER_ICONS.map((name) => `
            <button type="button" class="icon-choice${name === iconName ? ' active' : ''}"
                    data-folder-icon="${name}" aria-label="Ikon ${name}">${icon(name, 20)}</button>`).join('')}
        </div>
      </div>
    </form>`;

  const modal = openModal({
    title: editing ? 'Ubah folder' : 'Folder baru',
    iconName: editing ? 'edit' : 'folderPlus',
    className: 'modal-dialog modal-folder-form',
    body,
    footer: `
      <button type="button" class="btn btn-ghost" data-modal-close>Batal</button>
      <button type="button" class="btn btn-primary" data-folder-save>${editing ? 'Simpan perubahan' : 'Buat folder'}</button>`
  });

  const nameInput = modal.sheet.querySelector('#folder-name');
  const errorEl = modal.sheet.querySelector('#folder-error');
  const previewIco = modal.sheet.querySelector('#folder-form-preview');
  const previewName = modal.sheet.querySelector('#folder-form-name-preview');

  const refreshPreview = () => {
    previewIco.style.setProperty('--folder-color', color);
    previewIco.innerHTML = icon(iconName, 28);
    previewName.textContent = nameInput.value.trim() || 'Folder baru';
  };

  modal.sheet.querySelectorAll('[data-folder-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
      color = btn.dataset.folderColor;
      modal.sheet.querySelectorAll('[data-folder-color]').forEach((b) => b.classList.toggle('active', b === btn));
      refreshPreview();
    });
  });
  modal.sheet.querySelectorAll('[data-folder-icon]').forEach((btn) => {
    btn.addEventListener('click', () => {
      iconName = btn.dataset.folderIcon;
      modal.sheet.querySelectorAll('[data-folder-icon]').forEach((b) => b.classList.toggle('active', b === btn));
      refreshPreview();
    });
  });
  nameInput.addEventListener('input', refreshPreview);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      modal.sheet.querySelector('[data-folder-save]').click();
    }
  });

  modal.sheet.querySelector('[data-folder-save]').addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      errorEl.textContent = 'Nama folder belum diisi.';
      errorEl.hidden = false;
      nameInput.focus();
      return;
    }
    modal.close({ name, color, icon: iconName });
  });

  return modal.promise;
}

export function openFolderMenu({ category, count = 0 } = {}) {
  const modal = openModal({
    title: 'Opsi folder',
    subtitle: category?.name || 'Folder',
    iconName: category?.icon || 'folder',
    className: 'modal-menu',
    body: `
      <div class="menu-list">
        ${menuItemsHTML([
          { action: 'new-note', icon: 'plus', label: 'Catatan baru di folder ini' },
          { action: 'edit', icon: 'edit', label: 'Ubah nama & tampilan' },
          { action: 'copy-name', icon: 'copy', label: 'Salin nama folder' },
          { type: 'divider' },
          { action: 'delete', icon: 'trash', label: 'Hapus folder', sub: count ? `${count} catatan tidak ikut terhapus` : 'Folder kosong', danger: true }
        ])}
      </div>`,
    footer: menuFooter()
  });
  bindMenuActions(modal);
  return modal.promise.then((value) => value || null);
}

/* ============================================================
   Urutan, tampilan, menu halaman
   ============================================================ */

const SORT_OPTIONS = [
  ['updatedAt', 'Terakhir diperbarui', 'Terbaru di atas'],
  ['createdAt', 'Terbaru dibuat', 'Berdasarkan tanggal dibuat'],
  ['title', 'Judul A–Z', 'Urut abjad'],
  ['oldest', 'Paling lama', 'Terlama di atas']
];

export function openSortSheet({ sortBy = 'updatedAt', viewMode = 'list', groupByDate = true } = {}) {
  let selectedSort = sortBy;
  let selectedView = viewMode;
  let grouped = Boolean(groupByDate);

  const body = `
    <div class="sort-sheet">
      <div class="settings-heading inline">Urutkan berdasarkan</div>
      <div class="menu-list compact" id="sort-options">
        ${SORT_OPTIONS.map(([value, label, sub]) => `
          <button type="button" class="menu-item sort-option${value === selectedSort ? ' active' : ''}" data-sort-value="${value}">
            <span class="menu-ico">${icon('sort', 18)}</span>
            <span class="menu-text"><strong>${label}</strong><small>${sub}</small></span>
            <span class="menu-check">${value === selectedSort ? icon('check', 18) : ''}</span>
          </button>`).join('')}
      </div>
      <div class="sheet-divider"></div>
      <div class="settings-row compact">
        <div class="settings-row-main">
          <span class="settings-ico">${icon('grid', 18)}</span>
          <div><div class="settings-title">Tampilan</div><div class="settings-sub">Daftar atau kartu</div></div>
        </div>
        <div class="seg" id="sheet-view">
          <button type="button" data-sheet-view="list" class="${selectedView === 'list' ? 'active' : ''}">${icon('list', 15)} Daftar</button>
          <button type="button" data-sheet-view="grid" class="${selectedView === 'grid' ? 'active' : ''}">${icon('grid', 15)} Grid</button>
        </div>
      </div>
      <div class="settings-row compact">
        <div class="settings-row-main">
          <span class="settings-ico">${icon('calendar', 18)}</span>
          <div><div class="settings-title">Kelompokkan per tanggal</div><div class="settings-sub">Hari ini, kemarin, dan seterusnya</div></div>
        </div>
        <button type="button" class="switch${grouped ? ' on' : ''}" id="sheet-group" role="switch"
                aria-checked="${grouped ? 'true' : 'false'}"><span></span></button>
      </div>
    </div>`;

  const modal = openModal({
    title: 'Urutkan & tampilan',
    iconName: 'sort',
    className: 'modal-sheet modal-sort',
    body,
    footer: `
      <button type="button" class="btn btn-ghost" data-modal-close>Batal</button>
      <button type="button" class="btn btn-primary" data-sort-apply>Terapkan</button>`
  });

  const refreshSort = () => {
    modal.sheet.querySelectorAll('[data-sort-value]').forEach((btn) => {
      const active = btn.dataset.sortValue === selectedSort;
      btn.classList.toggle('active', active);
      const check = btn.querySelector('.menu-check');
      if (check) check.innerHTML = active ? icon('check', 18) : '';
    });
  };

  modal.sheet.querySelectorAll('[data-sort-value]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSort = btn.dataset.sortValue;
      refreshSort();
    });
  });
  modal.sheet.querySelectorAll('[data-sheet-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedView = btn.dataset.sheetView;
      modal.sheet.querySelectorAll('[data-sheet-view]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });
  const groupBtn = modal.sheet.querySelector('#sheet-group');
  groupBtn.addEventListener('click', () => {
    grouped = !grouped;
    groupBtn.classList.toggle('on', grouped);
    groupBtn.setAttribute('aria-checked', grouped ? 'true' : 'false');
  });
  modal.sheet.querySelector('[data-sort-apply]').addEventListener('click', () => {
    modal.close({ sortBy: selectedSort, viewMode: selectedView, groupByDate: grouped });
  });

  return modal.promise.then((value) => value || null);
}

export function openPageMenu({ page = 'notes', inTrash = false, selectionMode = false } = {}) {
  const listPage = ['notes', 'favorites', 'folder', 'tag', 'archive', 'trash'].includes(page);
  let items = [];
  if (listPage) {
    items = [
      ...(!selectionMode ? [{ action: 'select', icon: 'checkCircle', label: 'Pilih catatan' }] : []),
      { action: 'sort', icon: 'sort', label: 'Urutkan & tampilan' },
      { action: 'toggle-view', icon: 'grid', label: 'Ubah tampilan daftar' },
      { action: 'new-note', icon: 'plus', label: 'Catatan baru' },
      { action: 'folder-new', icon: 'folderPlus', label: 'Folder baru' },
      { type: 'divider' },
      { action: 'export', icon: 'download', label: 'Ekspor backup' },
      { action: 'print', icon: 'print', label: 'Cetak / simpan PDF' },
      ...(inTrash ? [{ type: 'divider' }, { action: 'trash-empty', icon: 'trashX', label: 'Kosongkan sampah', danger: true }] : [])
    ];
  } else if (page === 'folders') {
    items = [
      { action: 'folder-new', icon: 'folderPlus', label: 'Folder baru' },
      { action: 'new-note', icon: 'plus', label: 'Catatan baru' },
      { action: 'sort', icon: 'sort', label: 'Urutkan & tampilan' },
      { type: 'divider' },
      { action: 'export', icon: 'download', label: 'Ekspor backup' },
      { action: 'print', icon: 'print', label: 'Cetak / simpan PDF' }
    ];
  } else if (page === 'settings') {
    items = [
      { action: 'export', icon: 'download', label: 'Ekspor backup' },
      { action: 'import', icon: 'upload', label: 'Impor backup' },
      { action: 'print', icon: 'print', label: 'Cetak semua catatan' },
      { type: 'divider' },
      { action: 'shortcuts', icon: 'keyboard', label: 'Pintasan keyboard' },
      { action: 'about', icon: 'info', label: 'Tentang aplikasi' }
    ];
  } else {
    items = [
      { action: 'export', icon: 'download', label: 'Ekspor backup' },
      { action: 'print', icon: 'print', label: 'Cetak' },
      { action: 'shortcuts', icon: 'keyboard', label: 'Pintasan keyboard' }
    ];
  }

  const modal = openModal({
    title: 'Menu halaman',
    iconName: 'more',
    className: 'modal-menu',
    body: `<div class="menu-list">${menuItemsHTML(items)}</div>`,
    footer: menuFooter()
  });
  bindMenuActions(modal);
  return modal.promise.then((value) => value || null);
}

/* ============================================================
   Dialog editor
   ============================================================ */

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:\/\/|mailto:|tel:|#)/i.test(raw)) return raw;
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(raw)) return `https://${raw}`;
  return raw;
}

export function openLinkDialog({ text = '', url = '' } = {}) {
  const modal = openModal({
    title: text ? 'Tautkan teks' : 'Sisipkan tautan',
    iconName: 'link',
    className: 'modal-dialog',
    body: `
      <div class="field">
        <label class="field-label" for="link-url">Alamat tautan</label>
        <input class="input" id="link-url" type="url" inputmode="url" autocomplete="off"
               placeholder="https://contoh.com" value="${esc(url)}" autofocus />
        <p class="field-hint">Alamat tanpa https:// akan dilengkapi otomatis.</p>
        <p class="field-error" id="link-error" hidden></p>
      </div>
      <div class="field">
        <label class="field-label" for="link-text">Teks yang ditampilkan</label>
        <input class="input" id="link-text" type="text" autocomplete="off"
               placeholder="Opsional" value="${esc(text)}" maxlength="200" />
      </div>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-modal-close>Batal</button>
      <button type="button" class="btn btn-primary" data-link-save>Sisipkan</button>`
  });

  const urlInput = modal.sheet.querySelector('#link-url');
  const textInput = modal.sheet.querySelector('#link-text');
  const errorEl = modal.sheet.querySelector('#link-error');

  const submit = () => {
    const finalUrl = normalizeUrl(urlInput.value);
    if (!finalUrl) {
      errorEl.textContent = 'Alamat tautan belum diisi.';
      errorEl.hidden = false;
      urlInput.focus();
      return;
    }
    modal.close({ url: finalUrl, text: textInput.value.trim() });
  };
  modal.sheet.querySelector('[data-link-save]').addEventListener('click', submit);
  [urlInput, textInput].forEach((input) => input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  }));
  return modal.promise.then((value) => value || null);
}

export function openTableDialog() {
  const modal = openModal({
    title: 'Sisipkan tabel',
    iconName: 'table',
    className: 'modal-dialog',
    body: `
      <div class="table-form">
        <div class="field">
          <label class="field-label" for="table-rows">Baris</label>
          <input class="input" id="table-rows" type="number" min="1" max="12" value="3" inputmode="numeric" />
        </div>
        <div class="field">
          <label class="field-label" for="table-cols">Kolom</label>
          <input class="input" id="table-cols" type="number" min="1" max="8" value="3" inputmode="numeric" />
        </div>
      </div>
      <label class="check-row">
        <input type="checkbox" id="table-header" checked />
        <span>Baris pertama sebagai judul kolom</span>
      </label>
      <p class="field-hint">Gunakan Tab untuk berpindah sel. Tab di sel terakhir menambah baris.</p>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-modal-close>Batal</button>
      <button type="button" class="btn btn-primary" data-table-save>Sisipkan tabel</button>`
  });
  modal.sheet.querySelector('[data-table-save]').addEventListener('click', () => {
    const rows = Math.min(12, Math.max(1, Number(modal.sheet.querySelector('#table-rows').value) || 3));
    const cols = Math.min(8, Math.max(1, Number(modal.sheet.querySelector('#table-cols').value) || 3));
    modal.close({ rows, cols, header: modal.sheet.querySelector('#table-header').checked });
  });
  return modal.promise.then((value) => value || null);
}

export function openImageOptions({ alt = '', width = 100 } = {}) {
  let currentWidth = Math.max(25, Math.min(100, Math.round(Number(width) || 100)));
  const modal = openModal({
    title: 'Opsi gambar',
    iconName: 'image',
    className: 'modal-dialog',
    body: `
      <div class="image-options">
        <div class="field">
          <label class="field-label" for="image-width">Ukuran gambar</label>
          <div class="range-wrap">
            <input class="range" id="image-width" type="range" min="25" max="100" step="5" value="${currentWidth}" />
            <span class="range-label" id="image-width-label">${currentWidth}%</span>
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="image-alt">Deskripsi gambar</label>
          <input class="input" id="image-alt" type="text" maxlength="160" value="${esc(alt)}"
                 placeholder="Untuk aksesibilitas" />
        </div>
        <button type="button" class="btn btn-danger-ghost btn-block" data-image-remove>
          ${icon('trash', 17)} Hapus gambar dari catatan
        </button>
      </div>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-modal-close>Batal</button>
      <button type="button" class="btn btn-primary" data-image-apply>Terapkan</button>`
  });

  const range = modal.sheet.querySelector('#image-width');
  const label = modal.sheet.querySelector('#image-width-label');
  range.addEventListener('input', () => {
    currentWidth = Number(range.value);
    label.textContent = `${currentWidth}%`;
  });
  modal.sheet.querySelector('[data-image-apply]').addEventListener('click', () => {
    modal.close({ action: 'apply', width: currentWidth, alt: modal.sheet.querySelector('#image-alt').value.trim() });
  });
  modal.sheet.querySelector('[data-image-remove]').addEventListener('click', () => {
    modal.close({ action: 'remove' });
  });
  return modal.promise.then((value) => value || null);
}

const NOTE_COLORS = [
  ['Tanpa warna', null],
  ['Kuning', '#fde68a'],
  ['Pink', '#fbcfe8'],
  ['Biru', '#bfdbfe'],
  ['Hijau', '#bbf7d0'],
  ['Ungu', '#ddd6fe'],
  ['Oranye', '#fed7aa'],
  ['Merah', '#fecaca'],
  ['Abu', '#e2e8f0']
];

const PAPERS = [
  ['blank', 'Polos'],
  ['lines', 'Garis'],
  ['grid', 'Kotak'],
  ['dots', 'Titik']
];

const FONTS = [
  ['sans', 'Sans', 'Aa'],
  ['serif', 'Serif', 'Aa'],
  ['mono', 'Mono', 'Aa']
];

export function openNoteStyle({ note, settings = {} } = {}) {
  let color = note?.color || null;
  let paper = note?.paper || 'blank';
  let font = note?.font || settings.editorFont || 'sans';

  const modal = openModal({
    title: 'Tampilan catatan',
    iconName: 'palette',
    className: 'modal-style',
    body: `
      <div class="style-preview paper-${esc(paper)} font-${esc(font)}${color ? ' has-tint' : ''}"
           id="style-preview" ${color ? `style="--note-tint:${esc(color)}"` : ''}>
        <strong>Contoh judul catatan</strong>
        <p>Ini pratinjau tampilan catatanmu.</p>
        <p class="muted">Tulis, atur, dan baca dengan nyaman.</p>
      </div>

      <div class="settings-heading inline">Warna kertas</div>
      <div class="swatch-row note-colors">
        ${NOTE_COLORS.map(([label, value]) => `
          <button type="button" class="swatch note-color${value === color ? ' active' : ''}"
                  ${value ? `style="--sw:${value}"` : 'data-none="true"'}
                  data-note-color="${value || 'none'}" aria-label="${label}">
            ${value ? '' : icon('close', 14)}
          </button>`).join('')}
      </div>

      <div class="settings-heading inline">Jenis kertas</div>
      <div class="paper-options">
        ${PAPERS.map(([value, label]) => `
          <button type="button" class="paper-choice paper-${value}${value === paper ? ' active' : ''}" data-paper="${value}">
            <span class="paper-choice-art"></span>
            <span>${label}</span>
          </button>`).join('')}
      </div>

      <div class="settings-heading inline">Huruf</div>
      <div class="font-options">
        ${FONTS.map(([value, label, sample]) => `
          <button type="button" class="font-choice font-${value}${value === font ? ' active' : ''}" data-note-font="${value}">
            <span class="font-sample">${sample}</span>
            <span>${label}</span>
          </button>`).join('')}
      </div>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-modal-close>Batal</button>
      <button type="button" class="btn btn-primary" data-style-apply>Terapkan</button>`
  });

  const preview = modal.sheet.querySelector('#style-preview');
  const refreshPreview = () => {
    preview.className = `style-preview paper-${paper} font-${font}${color ? ' has-tint' : ''}`;
    if (color) preview.style.setProperty('--note-tint', color);
    else preview.style.removeProperty('--note-tint');
  };

  modal.sheet.querySelectorAll('[data-note-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
      color = btn.dataset.noteColor === 'none' ? null : btn.dataset.noteColor;
      modal.sheet.querySelectorAll('[data-note-color]').forEach((b) => b.classList.toggle('active', b === btn));
      refreshPreview();
    });
  });
  modal.sheet.querySelectorAll('[data-paper]').forEach((btn) => {
    btn.addEventListener('click', () => {
      paper = btn.dataset.paper;
      modal.sheet.querySelectorAll('[data-paper]').forEach((b) => b.classList.toggle('active', b === btn));
      refreshPreview();
    });
  });
  modal.sheet.querySelectorAll('[data-note-font]').forEach((btn) => {
    btn.addEventListener('click', () => {
      font = btn.dataset.noteFont;
      modal.sheet.querySelectorAll('[data-note-font]').forEach((b) => b.classList.toggle('active', b === btn));
      refreshPreview();
    });
  });
  modal.sheet.querySelector('[data-style-apply]').addEventListener('click', () => {
    modal.close({ color, paper, font });
  });

  return modal.promise.then((value) => value || null);
}

/* ============================================================
   Riwayat versi
   ============================================================ */

export function openVersions({ note, revisions = [] } = {}) {
  const rows = revisions.map((rev) => {
    const words = rev.wordCount || countWords(rev.plainText || htmlToText(rev.content || ''));
    return `
      <div class="version-item">
        <span class="version-ico">${icon('history', 18)}</span>
        <div class="version-main">
          <strong>${esc(rev.title || 'Tanpa judul')}</strong>
          <span>${fmtDateTime(rev.createdAt)} · ${words} kata</span>
        </div>
        <div class="version-actions">
          <button type="button" class="text-btn" data-version-action="preview" data-version-id="${esc(rev.id)}">Lihat</button>
          <button type="button" class="text-btn accent" data-version-action="restore" data-version-id="${esc(rev.id)}">Pulihkan</button>
        </div>
      </div>`;
  }).join('');

  const modal = openModal({
    title: 'Riwayat versi',
    subtitle: note?.title || 'Tanpa judul',
    iconName: 'history',
    className: 'modal-versions',
    body: `
      <div class="version-current">
        <span class="version-ico accent">${icon('checkCircle', 18)}</span>
        <div class="version-main">
          <strong>Versi saat ini</strong>
          <span>${fmtDateTime(note?.updatedAt || Date.now())}${note?.wordCount ? ` · ${note.wordCount} kata` : ''}</span>
        </div>
        <span class="version-badge">Aktif</span>
      </div>
      <div class="version-list">
        ${rows || `<div class="menu-empty">${icon('clock', 28)}<p>Belum ada versi lama.<br />Versi otomatis dibuat saat kamu mengedit.</p></div>`}
      </div>`,
    footer: menuFooter('Tutup')
  });

  modal.layer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-version-action]');
    if (!btn) return;
    const revision = revisions.find((r) => r.id === btn.dataset.versionId);
    if (!revision) return;
    modal.close({ action: btn.dataset.versionAction, revision });
  });

  return modal.promise.then((value) => value || null);
}

export function openVersionPreview({ revision, current = false } = {}) {
  const content = revision?.content || '';
  const modal = openModal({
    title: revision?.title || 'Tanpa judul',
    subtitle: `${fmtDateTime(revision?.createdAt || Date.now())}${revision?.wordCount ? ` · ${revision.wordCount} kata` : ''}`,
    iconName: 'clock',
    className: 'modal-version-preview',
    body: `<div class="version-preview-body editor-body">${content || '<p class="note-empty">Versi ini tidak memiliki isi.</p>'}</div>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-modal-close>Tutup</button>
      ${current ? '' : `<button type="button" class="btn btn-primary" data-version-restore>${icon('restore', 17)} Pulihkan versi ini</button>`}`
  });
  modal.sheet.querySelector('[data-version-restore]')?.addEventListener('click', () => modal.close(true));
  return modal.promise.then((value) => value === true);
}

/* ============================================================
   Command palette
   ============================================================ */

export function openCommandPalette({ commands = [] } = {}) {
  const modal = openModal({
    hideHeader: true,
    className: 'modal-palette',
    ariaLabel: 'Command palette',
    body: `
      <div class="palette-head">
        <span class="palette-search-ico">${icon('search', 19)}</span>
        <input id="palette-input" type="text" placeholder="Cari perintah atau catatan…"
               autocomplete="off" spellcheck="false" autofocus />
        <kbd class="palette-esc">Esc</kbd>
      </div>
      <div class="palette-list" id="palette-list" role="listbox"></div>
      <div class="palette-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> pilih</span>
        <span><kbd>Enter</kbd> jalankan</span>
      </div>`
  });

  const input = modal.sheet.querySelector('#palette-input');
  const list = modal.sheet.querySelector('#palette-list');
  let filtered = [];
  let activeIndex = 0;

  const render = () => {
    const query = input.value.trim().toLowerCase();
    filtered = commands.filter((cmd) => {
      const haystack = `${cmd.label} ${cmd.sub || ''} ${cmd.keywords || ''}`.toLowerCase();
      return !query || haystack.includes(query);
    }).slice(0, 40);
    activeIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));

    if (!filtered.length) {
      list.innerHTML = `<div class="palette-empty">${icon('searchX', 26)}<p>Tidak ada perintah yang cocok.</p></div>`;
      return;
    }

    let lastGroup = '';
    list.innerHTML = filtered.map((cmd, i) => {
      const group = cmd.group || 'Perintah';
      const groupHTML = group !== lastGroup ? `<div class="palette-group">${esc(group)}</div>` : '';
      lastGroup = group;
      return `${groupHTML}
        <button type="button" role="option" aria-selected="${i === activeIndex}"
                class="palette-item${i === activeIndex ? ' active' : ''}" data-palette-index="${i}">
          <span class="palette-ico">${icon(cmd.icon || 'command', 18)}</span>
          <span class="palette-text"><strong>${esc(cmd.label)}</strong>${cmd.sub ? `<small>${esc(cmd.sub)}</small>` : ''}</span>
          ${cmd.shortcut ? `<kbd>${esc(cmd.shortcut)}</kbd>` : ''}
        </button>`;
    }).join('');

    list.querySelectorAll('.palette-item').forEach((btn) => {
      btn.addEventListener('mouseenter', () => {
        activeIndex = Number(btn.dataset.paletteIndex);
        updateActive();
      });
      btn.addEventListener('click', () => modal.close(filtered[Number(btn.dataset.paletteIndex)] || null));
    });
  };

  const updateActive = () => {
    list.querySelectorAll('.palette-item').forEach((btn) => {
      const active = Number(btn.dataset.paletteIndex) === activeIndex;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) btn.scrollIntoView({ block: 'nearest' });
    });
  };

  input.addEventListener('input', () => { activeIndex = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(filtered.length - 1, activeIndex + 1);
      updateActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
      updateActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) modal.close(cmd);
    }
  });

  render();
  setTimeout(() => { try { input.focus(); } catch (_) {} }, 60);
  return modal.promise.then((value) => value || null);
}

/* ============================================================
   Pintasan, tips, info, tentang
   ============================================================ */

export function openShortcuts({ modKey = 'Ctrl' } = {}) {
  const rows = [
    ['Navigasi', [
      [`${modKey} + N`, 'Catatan baru'],
      [`${modKey} + K`, 'Command palette'],
      [`${modKey} + F`, 'Cari catatan'],
      ['/', 'Fokus ke pencarian'],
      ['Esc', 'Tutup dialog / batal pilih'],
      ['?', 'Buka pintasan ini']
    ]],
    ['Editor', [
      [`${modKey} + B`, 'Tebal'],
      [`${modKey} + I`, 'Miring'],
      [`${modKey} + U`, 'Garis bawah'],
      [`${modKey} + Shift + X`, 'Coret'],
      [`${modKey} + Shift + H`, 'Sorot kuning'],
      [`${modKey} + Alt + 0–3`, 'Teks biasa / heading'],
      [`${modKey} + K`, 'Sisipkan tautan'],
      [`${modKey} + F`, 'Cari di catatan'],
      ['Enter', 'Tugas / butir baru'],
      ['Tab', 'Pindah sel tabel']
    ]]
  ];

  openModal({
    title: 'Pintasan keyboard',
    iconName: 'keyboard',
    className: 'modal-shortcuts',
    body: rows.map(([group, items]) => `
      <div class="shortcut-group">
        <h3>${group}</h3>
        ${items.map(([keys, label]) => `
          <div class="shortcut-row">
            <span>${esc(label)}</span>
            <kbd>${esc(keys)}</kbd>
          </div>`).join('')}
      </div>`).join(''),
    footer: menuFooter('Tutup')
  });
}

export function openSearchTips() {
  const tips = [
    ['#tag', 'Cari catatan dengan tag tertentu.', '#kuliah'],
    ['"kata kunci"', 'Cari frasa persis dengan tanda kutip.', '"ide proyek"'],
    ['is:favorite', 'Hanya catatan favorit.', 'is:pinned'],
    ['is:archived', 'Cari di arsip.', 'is:trash'],
    ['has:checklist', 'Catatan yang punya daftar tugas.', 'has:image'],
    ['before:2026-01-01', 'Catatan sebelum tanggal tertentu.', 'after:2026-06-01'],
    ['kata1 kata2', 'Semua kata harus cocok.', 'resep ayam']
  ];
  openModal({
    title: 'Tips pencarian',
    subtitle: 'Temukan catatan lebih cepat dengan operator.',
    iconName: 'sparkles',
    className: 'modal-tips',
    body: `<div class="tip-list">${tips.map(([op, desc, example]) => `
      <div class="tip-row">
        <code>${esc(op)}</code>
        <div><p>${esc(desc)}</p><span>Contoh: <code>${esc(example)}</code></span></div>
      </div>`).join('')}</div>`,
    footer: menuFooter('Mengerti')
  });
}

export function openNoteInfo({ note, category = null, stats = null } = {}) {
  const tags = noteTags(note);
  const words = stats?.words || note?.wordCount || countWords(note?.plainText || '');
  const text = note?.plainText || htmlToText(note?.content || '');
  const chars = text.length;
  const images = (note?.content?.match(/<img[\s>]/gi) || []).length;
  const audios = (note?.content?.match(/<audio[\s>]/gi) || []).length;
  const rows = [
    ['Dibuat', fmtDateTime(note?.createdAt || Date.now())],
    ['Diperbarui', fmtDateTime(note?.updatedAt || Date.now())],
    ['Folder', category?.name || 'Tanpa folder'],
    ['Tag', tags.length ? tags.map((t) => '#' + t).join(', ') : '—'],
    ['Jumlah kata', `${words.toLocaleString('id-ID')} kata`],
    ['Karakter', `${chars.toLocaleString('id-ID')} karakter`],
    ['Media', `${images} gambar · ${audios} rekaman`],
    ['ID catatan', note?.id || '—']
  ];
  openModal({
    title: 'Info catatan',
    subtitle: note?.title || 'Tanpa judul',
    iconName: 'info',
    className: 'modal-info',
    body: `<div class="info-list">${rows.map(([label, value]) => `
      <div class="info-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`,
    footer: menuFooter('Tutup')
  });
}

export function openAbout({ version = '2.0.0', storage = null } = {}) {
  openModal({
    title: 'Tentang Catatan',
    iconName: 'sparkles',
    className: 'modal-about',
    body: `
      <div class="about-hero">
        <div class="about-logo">${BRAND_SVG}</div>
        <div>
          <h3>Catatan</h3>
          <p>Versi ${esc(version)} · Offline-first</p>
        </div>
      </div>
      <p class="about-lead">Aplikasi catatan pribadi yang cepat, tenang, dan sepenuhnya milikmu. Semua data disimpan di perangkat ini—tanpa akun, tanpa pelacakan.</p>
      <div class="about-grid">
        <div><strong>${icon('shield', 18)} Lokal</strong><span>Data tidak dikirim ke server.</span></div>
        <div><strong>${icon('refresh', 18)} Offline</strong><span>Tetap berjalan tanpa internet.</span></div>
        <div><strong>${icon('download', 18)} Bisa diekspor</strong><span>Backup JSON dan Markdown.</span></div>
        <div><strong>${icon('palette', 18)} Personal</strong><span>Tema, warna, kertas, dan huruf.</span></div>
      </div>
      ${storage ? `<div class="about-storage">${icon('database', 17)} <span>${esc(formatBytes(storage.usage || 0))} terpakai${storage.quota ? ` dari ${esc(formatBytes(storage.quota))}` : ''}</span></div>` : ''}
      <p class="about-credit">Dibuat untuk tulisanmu. Selamat mencatat.</p>`,
    footer: menuFooter('Tutup')
  });
}

export function openImportMode({ summary, filename = '' } = {}) {
  const s = summary || {};
  const modal = openModal({
    title: 'Impor backup',
    subtitle: filename,
    iconName: 'upload',
    className: 'modal-import',
    body: `
      <div class="import-summary">
        <div class="import-stat"><strong>${s.total || 0}</strong><span>catatan</span></div>
        <div class="import-stat"><strong>${s.favorites || 0}</strong><span>favorit</span></div>
        <div class="import-stat"><strong>${s.categories || 0}</strong><span>folder</span></div>
        <div class="import-stat"><strong>${s.revisions || 0}</strong><span>versi</span></div>
      </div>
      <div class="import-warning">
        ${icon('alert', 18)}
        <span>Data saat ini akan diganti sepenuhnya jika memilih “Ganti semua”. Pastikan kamu sudah membuat backup.</span>
      </div>
      <div class="import-options">
        <button type="button" class="import-card" data-import-mode="merge">
          <span class="import-card-ico">${icon('copy', 21)}</span>
          <span><strong>Gabungkan</strong><small>Tambahkan catatan dari file. Catatan dengan ID sama akan diperbarui.</small></span>
        </button>
        <button type="button" class="import-card danger" data-import-mode="replace">
          <span class="import-card-ico">${icon('refresh', 21)}</span>
          <span><strong>Ganti semua</strong><small>Hapus data saat ini lalu pulihkan isi backup.</small></span>
        </button>
      </div>
      <p class="field-hint">File backup berisi ${s.total || 0} catatan, ${s.archived || 0} diarsipkan, dan ${s.trash || 0} di sampah.</p>`,
    footer: menuFooter('Batal')
  });
  modal.layer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-import-mode]');
    if (!btn) return;
    modal.close(btn.dataset.importMode);
  });
  return modal.promise.then((value) => value || null);
}

/* ============================================================
   Ekspor util untuk app
   ============================================================ */

export const MODAL_COLORS = { FOLDER_COLORS, NOTE_COLORS };
