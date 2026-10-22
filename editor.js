/* ============================================================
   editor.js — mesin editor kaya fitur untuk Catatan
   ============================================================ */

import { icon } from './icons.js';
import {
  esc, sanitizeHTML, htmlToText, countWords, readingMinutes, haptic,
  compressImage, syncCheckboxAttrs, debounce
} from './utils.js';

const TEXT_COLORS = [
  ['Default', 'inherit'],
  ['Hitam', '#111827'],
  ['Merah', '#ef4444'],
  ['Oranye', '#f97316'],
  ['Kuning', '#ca8a04'],
  ['Hijau', '#16a34a'],
  ['Biru', '#2563eb'],
  ['Ungu', '#7c3aed'],
  ['Pink', '#db2777'],
  ['Abu', '#64748b']
];

const HIGHLIGHT_COLORS = [
  ['Tanpa', 'transparent'],
  ['Kuning', '#fef08a'],
  ['Hijau', '#bbf7d0'],
  ['Biru', '#bfdbfe'],
  ['Pink', '#fbcfe8'],
  ['Oranye', '#fed7aa'],
  ['Ungu', '#ddd6fe']
];

const BLOCK_STYLES = [
  { tag: 'p', label: 'Teks Biasa', sample: 'Teks biasa', cls: 'sample-body' },
  { tag: 'h1', label: 'Judul', sample: 'Judul besar', cls: 'sample-h1' },
  { tag: 'h2', label: 'Subjudul', sample: 'Subjudul', cls: 'sample-h2' },
  { tag: 'h3', label: 'Heading', sample: 'Heading kecil', cls: 'sample-h3' },
  { tag: 'pre', label: 'Monospace', sample: 'Teks kode', cls: 'sample-mono' },
  { tag: 'blockquote', label: 'Kutipan', sample: 'Kutipan', cls: 'sample-quote' }
];

const BLOCK_LABELS = {
  P: 'Teks', DIV: 'Teks', H1: 'Judul', H2: 'Subjudul', H3: 'Heading',
  H4: 'Heading', PRE: 'Monospace', BLOCKQUOTE: 'Kutipan'
};

export function toolbarHTML() {
  return `
    <div class="ed-toolbar" id="ed-toolbar" role="toolbar" aria-label="Alat format teks">
      <div class="ed-toolbar-row">
        <button type="button" class="ed-btn" data-cmd="undo" title="Urungkan" aria-label="Urungkan">${icon('undo', 18)}</button>
        <button type="button" class="ed-btn" data-cmd="redo" title="Ulangi" aria-label="Ulangi">${icon('redo', 18)}</button>
        <span class="ed-sep"></span>
        <button type="button" class="ed-btn ed-style-btn" data-popover="style" title="Gaya teks">
          <span id="ed-style-label">Teks</span>${icon('chevronDown', 13)}
        </button>
        <span class="ed-sep"></span>
        <button type="button" class="ed-btn" data-cmd="bold" title="Tebal (${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+B)" aria-label="Tebal">${icon('bold', 18)}</button>
        <button type="button" class="ed-btn" data-cmd="italic" title="Miring" aria-label="Miring">${icon('italic', 18)}</button>
        <button type="button" class="ed-btn" data-cmd="underline" title="Garis bawah" aria-label="Garis bawah">${icon('underline', 18)}</button>
        <button type="button" class="ed-btn" data-popover="color" title="Warna teks & sorotan" aria-label="Warna">${icon('highlight', 18)}<span class="ed-hl-dot"></span></button>
        <span class="ed-sep"></span>
        <button type="button" class="ed-btn" data-action="checklist" title="Daftar tugas" aria-label="Daftar tugas">${icon('checklist', 18)}</button>
        <button type="button" class="ed-btn" data-cmd="insertUnorderedList" title="Daftar butir" aria-label="Daftar butir">${icon('listBullet', 18)}</button>
        <button type="button" class="ed-btn" data-cmd="insertOrderedList" title="Daftar nomor" aria-label="Daftar nomor">${icon('listNumber', 18)}</button>
        <span class="ed-sep"></span>
        <button type="button" class="ed-btn" data-action="insert-link" title="Tautan" aria-label="Tautan">${icon('link', 18)}</button>
        <button type="button" class="ed-btn" data-action="more" title="Alat lainnya" aria-label="Alat lainnya" aria-expanded="false">${icon('more', 18)}</button>
      </div>
      <div class="ed-popover" id="ed-popover" hidden></div>
    </div>`;
}

/* ============================================================
   Helper DOM
   ============================================================ */

function elementOf(node) {
  if (!node) return null;
  return node.nodeType === 1 ? node : node.parentElement;
}

function placeCaret(el, atStart = true) {
  if (!el) return;
  const range = document.createRange();
  if (atStart) range.setStart(el, 0);
  else range.setStart(el, el.childNodes.length);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function placeCaretAtEnd(el) {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function isNodeInside(node, container) {
  if (!node || !container) return false;
  return node === container || container.contains(node);
}

function closestBlock(node, body) {
  let el = elementOf(node);
  if (!el || el === body) return null;
  while (el && el.parentElement && el.parentElement !== body) {
    el = el.parentElement;
  }
  return el && el !== body ? el : null;
}

function makeCheckItem() {
  const item = document.createElement('div');
  item.className = 'check-item';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.setAttribute('aria-label', 'Tandai selesai');
  const span = document.createElement('span');
  span.className = 'check-text';
  span.innerHTML = '<br>';
  item.append(cb, span);
  return item;
}

function makeParagraph() {
  const p = document.createElement('p');
  p.innerHTML = '<br>';
  return p;
}

/* ============================================================
   mountEditor
   ============================================================ */

export function mountEditor({
  titleEl, bodyEl, toolbarEl, note, settings = {}, callbacks = {}
}) {
  const controller = new AbortController();
  const signal = controller.signal;
  const body = bodyEl;
  let savedRange = null;
  let lastStats = { words: 0, chars: 0, minutes: 1 };
  let findIndex = -1;
  let findMatches = [];
  let findQuery = '';
  let isDestroyed = false;

  // Input file tersembunyi untuk gambar.
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;
  fileInput.hidden = true;
  fileInput.setAttribute('aria-hidden', 'true');
  document.body.appendChild(fileInput);

  body.spellcheck = settings.spellcheck !== false;
  body.dataset.placeholder = 'Mulai menulis…  Ketik # untuk tag, / untuk perintah';

  toolbarEl.innerHTML = toolbarHTML();
  const toolbar = toolbarEl.querySelector('#ed-toolbar');
  const popover = toolbarEl.querySelector('#ed-popover');

  /* ---------- Selection ---------- */

  function selectionInBody() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!isNodeInside(range.startContainer, body) || !isNodeInside(range.endContainer, body)) return null;
    return range;
  }

  function saveSelection() {
    const range = selectionInBody();
    if (range) savedRange = range.cloneRange();
    return savedRange;
  }

  function restoreSelection() {
    const sel = window.getSelection();
    if (savedRange && isNodeInside(savedRange.startContainer, body) &&
        isNodeInside(savedRange.endContainer, body)) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
      return true;
    }
    if (!selectionInBody()) placeCaretAtEnd(body);
    return false;
  }

  function rememberSelection() {
    const range = selectionInBody();
    if (range) savedRange = range.cloneRange();
    updateToolbarState();
  }

  document.addEventListener('selectionchange', () => {
    if (isDestroyed) return;
    if (selectionInBody()) rememberSelection();
  }, { signal });

  /* ---------- Stats & placeholder ---------- */

  function computeStats() {
    const text = (body.textContent || '').replace(/\u00a0/g, ' ').trim();
    const words = countWords(text);
    const chars = text.length;
    return { words, chars, minutes: Math.max(1, Math.ceil(words / 200)) };
  }

  function updateStats() {
    lastStats = computeStats();
    callbacks.onStats?.(lastStats);
  }

  function updatePlaceholder() {
    const meaningful = Boolean(
      body.textContent.trim() ||
      body.querySelector('img, audio, hr, table, input[type="checkbox"]')
    );
    body.classList.toggle('is-empty', !meaningful);
  }

  const debouncedFindRefresh = debounce(() => {
    if (!findBar.hidden) refreshFindMatches();
  }, 350);

  const debouncedStats = debounce(() => { if (!isDestroyed) updateStats(); }, 250);

  function notifyInput() {
    updatePlaceholder();
    debouncedStats();
    updateToolbarState();
    debouncedFindRefresh();
    callbacks.onInput?.();
  }

  /* ---------- Toolbar state ---------- */

  /* Untuk event keyboard, e.target selalu root editor; elemen sebenarnya ada di posisi kursor. */
  function caretElement(fallback) {
    const range = selectionInBody();
    return range ? elementOf(range.startContainer) : elementOf(fallback);
  }

  function currentBlockElement() {
    const range = selectionInBody();
    if (!range) return null;
    let node = elementOf(range.startContainer);
    const block = node?.closest('p, div, h1, h2, h3, h4, blockquote, pre, li');
    return block && block !== body && body.contains(block) ? block : null;
  }

  function updateToolbarState() {
    if (!toolbar) return;
    const range = selectionInBody();
    const hasSelection = Boolean(range);

    toolbar.querySelectorAll('[data-cmd]').forEach((btn) => {
      if (!hasSelection) { btn.classList.remove('is-active'); return; }
      const cmd = btn.dataset.cmd;
      let active = false;
      try {
        if (cmd === 'insertUnorderedList') active = document.queryCommandState('insertUnorderedList');
        else if (cmd === 'insertOrderedList') active = document.queryCommandState('insertOrderedList');
        else if (['bold', 'italic', 'underline', 'strikeThrough'].includes(cmd)) {
          active = document.queryCommandState(cmd);
        }
      } catch (_) { /* noop */ }
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const block = currentBlockElement();
    const label = block?.classList?.contains('check-item')
      ? 'Tugas'
      : (BLOCK_LABELS[block?.tagName] || 'Teks');
    const styleLabel = toolbar.querySelector('#ed-style-label');
    if (styleLabel) styleLabel.textContent = label;
  }

  /* ---------- Commands ---------- */

  function focusBody() {
    if (document.activeElement !== body) {
      try { body.focus({ preventScroll: true }); } catch (_) { body.focus(); }
    }
  }

  function exec(cmd, arg = null) {
    focusBody();
    restoreSelection();
    try {
      document.execCommand('styleWithCSS', false, true);
      const ok = document.execCommand(cmd, false, arg);
      saveSelection();
      notifyInput();
      return ok;
    } catch (err) {
      console.warn('[editor exec]', cmd, err);
      return false;
    }
  }

  function applyBlock(tag) {
    focusBody();
    restoreSelection();
    const range = selectionInBody();
    if (!range) return;
    // Pastikan formatBlock bekerja pada blok saat ini, bukan seluruh seleksi.
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('formatBlock', false, `<${tag}>`);
    } catch (_) {
      try { document.execCommand('formatBlock', false, tag.toUpperCase()); } catch (__) { /* noop */ }
    }
    notifyInput();
    closePopover();
  }

  function insertHTML(html) {
    focusBody();
    restoreSelection();
    try {
      document.execCommand('insertHTML', false, html);
    } catch (_) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const tpl = document.createElement('template');
        tpl.innerHTML = html;
        range.insertNode(tpl.content);
        range.collapse(false);
      }
    }
    saveSelection();
    notifyInput();
  }

  function insertParagraphAfter(el) {
    const p = makeParagraph();
    if (el && el.parentNode) el.after(p);
    else body.appendChild(p);
    placeCaret(p, true);
    return p;
  }

  /* ---------- Checklist ---------- */

  function checklistItemsAround(item) {
    const items = [item];
    let prev = item.previousElementSibling;
    while (prev && prev.classList.contains('check-item')) { items.unshift(prev); prev = prev.previousElementSibling; }
    let next = item.nextElementSibling;
    while (next && next.classList.contains('check-item')) { items.push(next); next = next.nextElementSibling; }
    return items;
  }

  function toggleChecklist() {
    focusBody();
    restoreSelection();
    const block = currentBlockElement();

    // Ubah item tugas kembali menjadi paragraf.
    if (block?.classList?.contains('check-item')) {
      const text = block.querySelector('.check-text');
      const p = document.createElement('p');
      p.innerHTML = text?.innerHTML || '<br>';
      if (!p.textContent.trim() && !p.querySelector('img,audio')) p.innerHTML = '<br>';
      block.replaceWith(p);
      placeCaretAtEnd(p);
      notifyInput();
      return;
    }

    const item = makeCheckItem();
    const span = item.querySelector('.check-text');

    if (!block) {
      body.appendChild(item);
    } else if (block.tagName === 'LI') {
      const list = block.closest('ul,ol');
      list.after(item);
      if (list.children.length === 0) list.remove();
    } else if (['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE'].includes(block.tagName) &&
               !block.textContent.trim() && !block.querySelector('img,audio')) {
      block.replaceWith(item);
    } else {
      block.after(item);
    }

    placeCaret(span, true);
    notifyInput();
  }

  function toggleCheckbox(cb) {
    const item = cb.closest('.check-item');
    if (!item) return;
    cb.setAttribute('checked', cb.checked ? 'checked' : '');
    if (!cb.checked) cb.removeAttribute('checked');
    item.classList.toggle('is-done', cb.checked);
    if (settings.moveChecked && cb.checked) {
      const siblings = checklistItemsAround(item);
      const last = siblings[siblings.length - 1];
      if (last && last !== item) last.after(item);
    }
    if (settings.haptics !== false) haptic(6);
    notifyInput();
  }

  function handleChecklistEnter(item, e) {
    e.preventDefault();
    const textEl = item.querySelector('.check-text');
    const isEmpty = !item.textContent.trim();
    if (isEmpty) {
      const p = makeParagraph();
      item.replaceWith(p);
      placeCaret(p, true);
      notifyInput();
      return;
    }
    const next = makeCheckItem();
    item.after(next);
    placeCaret(next.querySelector('.check-text'), true);
    notifyInput();
  }

  /* ---------- Lists ---------- */

  function transformBlockToList(block, ordered = false) {
    const list = document.createElement(ordered ? 'ol' : 'ul');
    const li = document.createElement('li');
    li.innerHTML = '<br>';
    list.appendChild(li);
    if (block && block.parentNode) block.replaceWith(list);
    else body.appendChild(list);
    placeCaret(li, true);
    notifyInput();
    return li;
  }

  function handleListEnter(li, e) {
    if (li.textContent.trim()) return false;
    e.preventDefault();
    const list = li.closest('ul,ol');
    if (!list) return true;
    if (list.children.length === 1) {
      const p = makeParagraph();
      list.replaceWith(p);
      placeCaret(p, true);
    } else {
      // Keluar dari list: item kosong menjadi paragraf setelah list (list dipecah bila perlu).
      const p = makeParagraph();
      const after = [];
      let sib = li.nextElementSibling;
      while (sib) { after.push(sib); sib = sib.nextElementSibling; }
      li.remove();
      list.after(p);
      if (after.length) {
        const tail = document.createElement(list.tagName.toLowerCase());
        after.forEach((n) => tail.appendChild(n));
        p.after(tail);
      }
      placeCaret(p, true);
    }
    notifyInput();
    return true;
  }

  /* ---------- Markdown shortcuts ---------- */

  function getTextBeforeCaretInBlock(block) {
    const range = selectionInBody();
    if (!range || !block) return '';
    const pre = document.createRange();
    try {
      pre.setStart(block, 0);
      pre.setEnd(range.startContainer, range.startOffset);
    } catch (_) {
      return '';
    }
    return pre.toString();
  }

  function clearBlockStartToCaret(block) {
    const range = selectionInBody();
    if (!range || !block) return;
    const pre = document.createRange();
    try {
      pre.setStart(block, 0);
      pre.setEnd(range.startContainer, range.startOffset);
      pre.deleteContents();
    } catch (_) { /* noop */ }
    // Range asli bisa jadi tidak valid setelah delete; buat ulang di awal blok.
    const r = document.createRange();
    r.setStart(block, 0);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    savedRange = r.cloneRange();
  }

  function applyMarkdownShortcut(block, before) {
    const patterns = [
      { text: '# ', block: 'h1' },
      { text: '## ', block: 'h2' },
      { text: '### ', block: 'h3' },
      { text: '> ', block: 'blockquote' }
    ];
    for (const p of patterns) {
      if (before === p.text) {
        clearBlockStartToCaret(block);
        applyBlock(p.block);
        return true;
      }
    }
    if (before === '- ' || before === '* ') {
      clearBlockStartToCaret(block);
      transformBlockToList(block, false);
      return true;
    }
    if (before === '1. ') {
      clearBlockStartToCaret(block);
      transformBlockToList(block, true);
      return true;
    }
    if (before === '[] ' || before === '[ ] ') {
      clearBlockStartToCaret(block);
      toggleChecklist();
      return true;
    }
    return false;
  }

  /* ---------- Table ---------- */

  function insertTable({ rows = 3, cols = 3, header = true } = {}) {
    rows = Math.max(1, Math.min(12, Number(rows) || 3));
    cols = Math.max(1, Math.min(8, Number(cols) || 3));
    let html = '<table class="note-table"><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        const tag = header && r === 0 ? 'th' : 'td';
        html += `<${tag}><br></${tag}>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';
    insertHTML(html);
    const first = body.querySelector('table.note-table th, table.note-table td');
    if (first) placeCaret(first, true);
    return first;
  }

  function moveTableCell(backward) {
    const range = selectionInBody();
    if (!range) return false;
    const cell = elementOf(range.startContainer)?.closest('td,th');
    const table = cell?.closest('table');
    if (!cell || !table) return false;
    const cells = Array.from(table.querySelectorAll('td,th'));
    const idx = cells.indexOf(cell);
    if (backward) {
      if (idx <= 0) { placeCaret(cell, true); return true; }
      placeCaret(cells[idx - 1], true);
      return true;
    }
    if (idx < cells.length - 1) {
      placeCaret(cells[idx + 1], true);
      return true;
    }
    // Tambah baris baru saat Tab di sel terakhir.
    const row = cell.closest('tr');
    const colCount = row.children.length;
    const newRow = document.createElement('tr');
    for (let i = 0; i < colCount; i++) {
      const td = document.createElement('td');
      td.innerHTML = '<br>';
      newRow.appendChild(td);
    }
    row.after(newRow);
    placeCaret(newRow.firstElementChild, true);
    notifyInput();
    return true;
  }

  function updateImage(img, { width, alt } = {}) {
    if (!img || !body.contains(img)) return;
    if (width !== undefined) {
      img.style.width = width === null ? '' : `${width}%`;
      img.style.maxWidth = '100%';
    }
    if (alt !== undefined) img.setAttribute('alt', alt || 'Gambar catatan');
    saveSelection();
    notifyInput();
  }

  function removeImage(img) {
    if (!img) return;
    const parent = img.parentElement;
    img.remove();
    if (parent && parent !== body && !parent.textContent.trim() && !parent.querySelector('img,audio')) {
      parent.remove();
    }
    notifyInput();
  }

  /* ---------- Images / audio ---------- */

  async function insertFiles(files) {
    const images = Array.from(files || []).filter((f) => /^image\//i.test(f.type || ''));
    if (!images.length) {
      callbacks.onToast?.('File bukan gambar.', 'error');
      return;
    }
    callbacks.onImageProcessing?.(true, `Memproses ${images.length} gambar…`);
    try {
      for (const file of images) {
        const dataUrl = await compressImage(file);
        insertImage(dataUrl, file.name?.replace(/\.[^.]+$/, '') || 'Gambar catatan');
      }
    } catch (err) {
      console.error(err);
      callbacks.onToast?.(err.message || 'Gagal menambahkan gambar.', 'error');
    } finally {
      callbacks.onImageProcessing?.(false);
    }
  }

  function insertImage(dataUrl, alt = 'Gambar catatan', className = '') {
    const html = `<img src="${dataUrl}" alt="${esc(alt)}" class="note-image ${esc(className)}" style="max-width:100%"><p><br></p>`;
    insertHTML(html);
  }

  function insertAudio(dataUrl) {
    const html = `<audio controls src="${dataUrl}" preload="metadata"></audio><p><br></p>`;
    insertHTML(html);
  }

  /* ---------- Find in note ---------- */

  const findBar = document.createElement('div');
  findBar.className = 'ed-find';
  findBar.hidden = true;
  findBar.innerHTML = `
    <span class="ed-find-ico">${icon('search', 17)}</span>
    <input id="ed-find-input" type="search" placeholder="Cari di catatan" autocomplete="off" />
    <span class="ed-find-count" id="ed-find-count">0/0</span>
    <button type="button" class="ed-find-btn" data-find="prev" aria-label="Sebelumnya">${icon('chevronUp', 17)}</button>
    <button type="button" class="ed-find-btn" data-find="next" aria-label="Berikutnya">${icon('chevronDown', 17)}</button>
    <button type="button" class="ed-find-btn" data-find="close" aria-label="Tutup">${icon('close', 17)}</button>`;
  (bodyEl.closest('.editor-scroll') || toolbarEl).prepend(findBar);

  const findInput = findBar.querySelector('#ed-find-input');
  const findCount = findBar.querySelector('#ed-find-count');

  function refreshFindMatches() {
    findQuery = findInput.value.trim();
    findMatches = [];
    findIndex = -1;
    if (!findQuery) {
      findCount.textContent = '0/0';
      return;
    }
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const q = findQuery.toLowerCase();
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue.toLowerCase();
      let idx = 0;
      while ((idx = text.indexOf(q, idx)) !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + q.length);
        findMatches.push(range);
        idx += Math.max(1, q.length);
      }
    }
    findCount.textContent = `0/${findMatches.length}`;
  }

  function findNext(backward = false) {
    if (!findQuery) refreshFindMatches();
    if (!findQuery) return;
    if (!findMatches.length) refreshFindMatches();
    if (!findMatches.length) {
      findCount.textContent = '0/0';
      return;
    }
    findIndex = backward
      ? (findIndex - 1 + findMatches.length) % findMatches.length
      : (findIndex + 1) % findMatches.length;
    const range = findMatches[findIndex];
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const el = elementOf(range.startContainer);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    findCount.textContent = `${findIndex + 1}/${findMatches.length}`;
  }

  function openFind() {
    const range = selectionInBody();
    if (range && !range.collapsed) findInput.value = range.toString().slice(0, 80);
    findBar.hidden = false;
    findBar.classList.add('is-open');
    findInput.focus();
    findInput.select();
    refreshFindMatches();
    if (findQuery) findNext(false);
  }

  function closeFind() {
    findBar.hidden = true;
    findBar.classList.remove('is-open');
    findMatches = [];
    findIndex = -1;
    focusBody();
    restoreSelection();
  }

  findBar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-find]');
    if (!btn) return;
    e.preventDefault();
    if (btn.dataset.find === 'next') findNext(false);
    else if (btn.dataset.find === 'prev') findNext(true);
    else closeFind();
  }, { signal });

  findInput.addEventListener('input', () => {
    refreshFindMatches();
    if (findQuery) findNext(false);
  }, { signal });

  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      findNext(e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeFind();
    }
  }, { signal });

  /* ---------- Popovers ---------- */

  function closePopover() {
    if (!popover) return;
    popover.hidden = true;
    popover.innerHTML = '';
    toolbar.querySelectorAll('[data-popover]').forEach((b) => b.classList.remove('is-active'));
    const moreBtn = toolbar.querySelector('[data-action="more"]');
    moreBtn?.setAttribute('aria-expanded', 'false');
  }

  function buildStylePopover() {
    return `
      <div class="ed-pop-title">Gaya teks</div>
      <div class="ed-style-list">
        ${BLOCK_STYLES.map((s) => `
          <button type="button" class="ed-style-item" data-style="${s.tag}">
            <span class="${s.cls}">${esc(s.sample)}</span>
            <span class="ed-style-name">${esc(s.label)}</span>
          </button>`).join('')}
      </div>`;
  }

  function buildColorPopover() {
    return `
      <div class="ed-pop-title">Warna teks</div>
      <div class="ed-swatches">
        ${TEXT_COLORS.map(([name, color]) => `
          <button type="button" class="ed-swatch ${color === 'inherit' ? 'is-default' : ''}"
                  data-text-color="${color}" title="${name}" aria-label="Warna ${name}"
                  style="--sw:${color === 'inherit' ? 'currentColor' : color}"></button>
        `).join('')}
      </div>
      <div class="ed-pop-title">Sorotan</div>
      <div class="ed-swatches">
        ${HIGHLIGHT_COLORS.map(([name, color]) => `
          <button type="button" class="ed-swatch ${color === 'transparent' ? 'is-none' : ''}"
                  data-highlight="${color}" title="${name}" aria-label="Sorot ${name}"
                  style="--sw:${color === 'transparent' ? 'transparent' : color}"></button>
        `).join('')}
      </div>
      <div class="ed-pop-hint">Pilih teks lalu ketuk warna.</div>`;
  }

  function buildMorePopover() {
    const items = [
      ['insert-image', 'image', 'Gambar'],
      ['insert-drawing', 'draw', 'Gambar tangan'],
      ['insert-table', 'table', 'Tabel'],
      ['insert-link', 'link', 'Tautan'],
      ['insert-audio', 'mic', 'Rekaman'],
      ['insert-quote', 'quote', 'Kutipan'],
      ['insert-code', 'code', 'Kode'],
      ['insert-divider', 'divider', 'Garis'],
      ['align-left', 'alignLeft', 'Kiri'],
      ['align-center', 'alignCenter', 'Tengah'],
      ['align-right', 'alignRight', 'Kanan'],
      ['indent', 'indent', 'Indentasi'],
      ['outdent', 'outdent', 'Kurangi indentasi'],
      ['clear-format', 'refresh', 'Hapus format'],
      ['find', 'search', 'Cari']
    ];
    return `
      <div class="ed-more-grid">
        ${items.map(([action, ico, label]) => `
          <button type="button" class="ed-more-item" data-action="${action}">
            <span class="ed-more-ico">${icon(ico, 20)}</span>
            <span>${label}</span>
          </button>`).join('')}
      </div>`;
  }

  function togglePopover(kind) {
    if (!popover) return;
    if (!popover.hidden && popover.dataset.kind === kind) { closePopover(); return; }
    popover.dataset.kind = kind;
    if (kind === 'style') popover.innerHTML = buildStylePopover();
    else if (kind === 'color') popover.innerHTML = buildColorPopover();
    else if (kind === 'more') popover.innerHTML = buildMorePopover();
    popover.hidden = false;
    toolbar.querySelectorAll('[data-popover]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.popover === kind);
    });
    toolbar.querySelector('[data-action="more"]')?.setAttribute(
      'aria-expanded', kind === 'more' ? 'true' : 'false'
    );
    saveSelection();
  }

  /* ---------- Toolbar events ---------- */

  toolbar.addEventListener('pointerdown', (e) => {
    // Jangan kehilangan seleksi saat menekan tombol toolbar.
    if (e.target.closest('button')) e.preventDefault();
  }, { signal });

  toolbar.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.cmd) {
      e.preventDefault();
      exec(btn.dataset.cmd);
      return;
    }
    if (btn.dataset.popover) {
      e.preventDefault();
      togglePopover(btn.dataset.popover);
      return;
    }
    if (btn.dataset.style) {
      e.preventDefault();
      applyBlock(btn.dataset.style);
      return;
    }
    if (btn.dataset.textColor) {
      e.preventDefault();
      const color = btn.dataset.textColor;
      exec('foreColor', color === 'inherit' ? 'inherit' : color);
      closePopover();
      return;
    }
    if (btn.dataset.highlight) {
      e.preventDefault();
      const color = btn.dataset.highlight;
      exec('hiliteColor', color);
      closePopover();
      return;
    }

    const action = btn.dataset.action;
    if (!action) return;
    e.preventDefault();

    switch (action) {
      case 'checklist':
        toggleChecklist();
        break;
      case 'more':
        togglePopover('more');
        break;
      case 'insert-image':
        closePopover();
        saveSelection();
        fileInput.click();
        break;
      case 'insert-drawing': {
        closePopover();
        saveSelection();
        const dataUrl = await callbacks.requestDrawing?.();
        if (dataUrl) {
          restoreSelection();
          insertImage(dataUrl, 'Gambar tangan', 'note-drawing');
        }
        break;
      }
      case 'insert-table': {
        closePopover();
        saveSelection();
        const result = await callbacks.requestTable?.();
        if (result) {
          restoreSelection();
          insertTable(result);
        }
        break;
      }
      case 'insert-link': {
        closePopover();
        saveSelection();
        const range = selectionInBody();
        const selectedText = range && !range.collapsed ? range.toString() : '';
        const result = await callbacks.requestLink?.({ text: selectedText });
        if (result) {
          restoreSelection();
          if (selectedText) {
            exec('createLink', result.url);
          } else {
            const html = `<a href="${esc(result.url)}">${esc(result.text || result.url)}</a>`;
            insertHTML(html);
          }
        }
        break;
      }
      case 'insert-audio': {
        closePopover();
        saveSelection();
        const dataUrl = await callbacks.requestAudio?.();
        if (dataUrl) {
          restoreSelection();
          insertAudio(dataUrl);
        }
        break;
      }
      case 'insert-quote':
        closePopover();
        applyBlock('blockquote');
        break;
      case 'insert-code':
        closePopover();
        applyBlock('pre');
        break;
      case 'insert-divider':
        closePopover();
        exec('insertHorizontalRule');
        break;
      case 'align-left':
        closePopover();
        exec('justifyLeft');
        break;
      case 'align-center':
        closePopover();
        exec('justifyCenter');
        break;
      case 'align-right':
        closePopover();
        exec('justifyRight');
        break;
      case 'indent':
        closePopover();
        exec('indent');
        break;
      case 'outdent':
        closePopover();
        exec('outdent');
        break;
      case 'clear-format':
        closePopover();
        focusBody();
        restoreSelection();
        try {
          document.execCommand('removeFormat');
          document.execCommand('formatBlock', false, '<p>');
        } catch (_) { /* noop */ }
        notifyInput();
        break;
      case 'find':
        closePopover();
        openFind();
        break;
      default:
        break;
    }
  }, { signal });

  document.addEventListener('pointerdown', (e) => {
    if (popover && !popover.hidden && !e.target.closest('#ed-toolbar')) closePopover();
  }, { signal });

  /* ---------- File input ---------- */

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = '';
    if (!files.length) return;
    restoreSelection();
    await insertFiles(files);
    saveSelection();
  }, { signal });

  /* ---------- Paste / drop ---------- */

  function insertPlainTextFast(text) {
    focusBody();
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const lines = String(text).replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').split('\n');
    const range = sel.getRangeAt(0);
    range.deleteContents();

    const block = currentBlockElement();
    const frag = document.createDocumentFragment();
    let lastEl = null;
    const mk = (line) => {
      const p = document.createElement('p');
      if (line) p.textContent = line; else p.innerHTML = '<br>';
      return p;
    };

    // Baris pertama disambung ke blok saat ini (bila ada), sisanya jadi paragraf baru.
    let startIndex = 0;
    if (block && !block.classList.contains('check-item') && block.tagName !== 'PRE' && lines[0] !== undefined) {
      const first = document.createTextNode(lines[0]);
      range.insertNode(first);
      if (block.querySelector(':scope > br') && block.textContent.length === lines[0].length) {
        block.querySelectorAll(':scope > br').forEach((br) => br.remove());
      }
      startIndex = 1;
      for (let i = startIndex; i < lines.length; i++) { lastEl = mk(lines[i]); frag.appendChild(lastEl); }
      // Letakkan paragraf setelah blok (atau setelah list induknya).
      const anchor = block.tagName === 'LI' ? block.closest('ul,ol') : block;
      if (frag.childNodes.length) anchor.after(frag);
      if (!lastEl) { const r = document.createRange(); r.setStart(first, first.length); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
    } else {
      for (const line of lines) { lastEl = mk(line); frag.appendChild(lastEl); }
      range.insertNode(frag);
    }
    if (lastEl) placeCaretAtEnd(lastEl);
    saveSelection();
    notifyInput();
    try { lastEl?.scrollIntoView({ block: 'nearest' }); } catch (_) { /* noop */ }
  }


  body.addEventListener('paste', async (e) => {
    const data = e.clipboardData;
    if (!data) return;
    const imageFiles = Array.from(data.files || []).filter((f) => /^image\//i.test(f.type || ''));
    if (imageFiles.length) {
      e.preventDefault();
      await insertFiles(imageFiles);
      return;
    }
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    const bigText = text.length > 4000 || (text.match(/\n/g) || []).length > 60;
    if (bigText && (e.shiftKey || !html || html.length > 200000 || text.length > 4000)) {
      /* Tempel besar: execCommand sangat lambat (kuadratik) -> bangun DOM langsung. */
      e.preventDefault();
      insertPlainTextFast(text);
      return;
    }
    if (e.shiftKey || !html) {
      e.preventDefault();
      focusBody();
      document.execCommand('insertText', false, text);
      saveSelection();
      notifyInput();
      return;
    }
    e.preventDefault();
    const clean = sanitizeHTML(html);
    if (clean.trim()) insertHTML(clean);
    else {
      focusBody();
      document.execCommand('insertText', false, text);
      saveSelection();
      notifyInput();
    }
  }, { signal });

  body.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  }, { signal });

  body.addEventListener('drop', async (e) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    const files = Array.from(dt.files || []).filter((f) => /^image\//i.test(f.type || ''));
    if (files.length) {
      e.preventDefault();
      // Posisikan caret pada titik drop.
      let range = null;
      try {
        if (document.caretRangeFromPoint) {
          range = document.caretRangeFromPoint(e.clientX, e.clientY);
        } else if (document.caretPositionFromPoint) {
          const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
          if (pos) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
          }
        }
      } catch (_) { /* noop */ }
      if (range && isNodeInside(range.startContainer, body)) {
        savedRange = range.cloneRange();
      } else saveSelection();
      await insertFiles(files);
    }
  }, { signal });

  /* ---------- Click / change ---------- */

  body.addEventListener('click', (e) => {
    const target = e.target;
    if (target.tagName === 'IMG' && target.classList.contains('note-image')) {
      e.preventDefault();
      saveSelection();
      callbacks.onImageClick?.(target, api);
      return;
    }
    const link = target.closest?.('a[href]');
    if (link && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.open(link.getAttribute('href'), '_blank', 'noopener');
    }
  }, { signal });

  body.addEventListener('dblclick', (e) => {
    const link = e.target.closest?.('a[href]');
    if (link) {
      e.preventDefault();
      window.open(link.getAttribute('href'), '_blank', 'noopener');
    }
  }, { signal });

  body.addEventListener('change', (e) => {
    if (e.target?.matches?.('input[type="checkbox"]')) toggleCheckbox(e.target);
  }, { signal });

  /* ---------- Keyboard ---------- */

  body.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;

    if (e.isComposing) return;

    // Simpan seleksi sebelum kombinasi khusus.
    saveSelection();

    if (mod && !e.shiftKey && key.toLowerCase() === 'k') {
      e.preventDefault();
      (async () => {
        const range = selectionInBody();
        const selectedText = range && !range.collapsed ? range.toString() : '';
        const result = await callbacks.requestLink?.({ text: selectedText });
        if (result) {
          restoreSelection();
          if (selectedText) exec('createLink', result.url);
          else insertHTML(`<a href="${esc(result.url)}">${esc(result.text || result.url)}</a>`);
        }
      })();
      return;
    }

    if (mod && key.toLowerCase() === 'f') {
      e.preventDefault();
      openFind();
      return;
    }

    if (mod && e.shiftKey && key.toLowerCase() === 'x') {
      e.preventDefault();
      exec('strikeThrough');
      return;
    }

    if (mod && e.shiftKey && key.toLowerCase() === 'h') {
      e.preventDefault();
      exec('hiliteColor', '#fef08a');
      return;
    }

    if (mod && key.toLowerCase() === 'e') {
      e.preventDefault();
      exec('justifyCenter');
      return;
    }

    if (e.key === 'Tab') {
      const cell = caretElement(e.target)?.closest?.('td,th');
      if (cell) {
        e.preventDefault();
        moveTableCell(e.shiftKey);
        return;
      }
      const li = caretElement(e.target)?.closest?.('li');
      if (li) {
        e.preventDefault();
        exec(e.shiftKey ? 'outdent' : 'indent');
        return;
      }
      // Di luar tabel/list, sisipkan tab sebagai spasi.
      e.preventDefault();
      document.execCommand('insertText', false, '    ');
      saveSelection();
      notifyInput();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !mod) {
      const item = caretElement(e.target)?.closest?.('.check-item');
      if (item) {
        handleChecklistEnter(item, e);
        return;
      }
      const li = caretElement(e.target)?.closest?.('li');
      if (li && handleListEnter(li, e)) return;
    }

    if (e.key === 'Backspace' && !mod) {
      const item = caretElement(e.target)?.closest?.('.check-item');
      if (item && !item.textContent.trim()) {
        e.preventDefault();
        const p = makeParagraph();
        item.replaceWith(p);
        placeCaret(p, true);
        notifyInput();
        return;
      }
    }

    if (e.key === ' ' && !mod && !e.altKey) {
      const block = currentBlockElement();
      if (block && !block.classList.contains('check-item') && block.tagName !== 'PRE') {
        // keydown: spasi belum masuk ke teks, jadi tambahkan secara manual.
        const before = getTextBeforeCaretInBlock(block) + ' ';
        if ((before === '- ' || before === '* ' || before === '1. ' ||
             before === '[] ' || before === '[ ] ' ||
             before === '# ' || before === '## ' || before === '### ' ||
             before === '> ')) {
          if (applyMarkdownShortcut(block, before)) {
            e.preventDefault();
            return;
          }
        }
      }
    }

    if (e.key === '`' && !mod) {
      const block = currentBlockElement();
      if (block) {
        const before = getTextBeforeCaretInBlock(block);
        if (before === '``') {
          e.preventDefault();
          clearBlockStartToCaret(block);
          applyBlock('pre');
          return;
        }
      }
    }

    if (e.key === 'Escape') {
      if (!findBar.hidden) { e.preventDefault(); closeFind(); return; }
      if (!popover.hidden) { e.preventDefault(); closePopover(); return; }
    }

    // Pintasan heading: Ctrl/⌘ + Alt + 0..3
    if (mod && e.altKey && ['0', '1', '2', '3'].includes(key)) {
      e.preventDefault();
      applyBlock(key === '0' ? 'p' : `h${key}`);
      return;
    }
  }, { signal });

  titleEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      focusBody();
      placeCaretAtEnd(body);
    }
  }, { signal });

  titleEl?.addEventListener('input', () => {
    callbacks.onInput?.();
  }, { signal });

  /* Teks yang diketik langsung di root editor dibungkus <p> agar perintah blok
     (checklist, # judul, - daftar) selalu punya blok induk yang valid. */
  function wrapBareText() {
    const sel = window.getSelection();
    const anchor = sel && sel.rangeCount ? sel.anchorNode : null;
    const offset = sel && sel.rangeCount ? sel.anchorOffset : 0;
    for (const node of Array.from(body.childNodes)) {
      const bareText = node.nodeType === 3 && node.textContent.length > 0;
      const bareInline = node.nodeType === 1 && /^(B|I|U|STRONG|EM|SPAN|A|CODE|S|MARK|FONT)$/.test(node.tagName);
      if (!bareText && !bareInline) continue;
      if (bareText && !node.textContent.trim() && body.childNodes.length > 1) continue;
      const p = document.createElement('p');
      node.replaceWith(p);
      p.appendChild(node);
      if (anchor === node && sel) {
        const r = document.createRange();
        r.setStart(node, Math.min(offset, node.textContent.length));
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
  }

  body.addEventListener('input', () => {
    try { wrapBareText(); } catch (_) { /* noop */ }
    notifyInput();
  }, { signal });

  body.addEventListener('focus', () => {
    if (body.classList.contains('is-empty')) updatePlaceholder();
  }, { signal });

  /* ---------- Clean empty blocks on blur ---------- */

  body.addEventListener('blur', () => {
    // Jangan bersihkan saat modal editor terbuka; cukup rapikan blok kosong berlebih.
    body.querySelectorAll('div:empty, p:empty').forEach((el) => {
      if (el !== body && el.parentElement === body) el.innerHTML = '<br>';
    });
  }, { signal });

  /* ---------- API ---------- */

  const api = {
    getData() {
      syncCheckboxAttrs(body);
      return {
        title: (titleEl?.value || '').trim(),
        content: sanitizeHTML(body.innerHTML)
      };
    },
    getStats() { return { ...lastStats }; },
    focusTitle() { try { titleEl?.focus(); titleEl?.select(); } catch (_) {} },
    focusBody() { focusBody(); placeCaretAtEnd(body); },
    insertFiles,
    insertImage,
    insertAudio,
    insertTable,
    updateImage,
    removeImage,
    openFind,
    closeFind,
    exec,
    applyBlock,
    focus() { focusBody(); },
    setSpellcheck(value) { body.spellcheck = Boolean(value); },
    isFindOpen() { return !findBar.hidden; },
    destroy() {
      isDestroyed = true;
      controller.abort();
      fileInput.remove();
      findBar.remove();
    }
  };

  /* ---------- Init ---------- */

  if (titleEl) titleEl.value = note?.title || '';
  body.innerHTML = sanitizeHTML(note?.content || '');
  updatePlaceholder();
  updateStats();
  updateToolbarState();

  // Bersihkan atribut checked agar konsisten.
  body.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    const item = cb.closest('.check-item');
    if (item) item.classList.toggle('is-done', cb.checked);
  });

  return api;
}
