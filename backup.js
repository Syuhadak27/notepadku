/* ============================================================
   backup.js — ekspor, impor, dan validasi backup JSON
   ============================================================ */

import { getAll, replaceAll, mergeAll } from './db.js';

export const BACKUP_APP_ID = 'Catatan Premium';
export const BACKUP_VERSION = 2;
export const APP_VERSION = '2.0.0';

/* ---------------- Ekstrak / ekspor ---------------- */

export async function buildBackup() {
  const [notes, categories, settings, revisions] = await Promise.all([
    getAll('notes'),
    getAll('categories'),
    getAll('settings'),
    getAll('revisions')
  ]);

  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      notes: notes.length,
      categories: categories.length,
      revisions: revisions.length,
      settings: settings.length
    },
    data: { notes, categories, settings, revisions }
  };
}

export async function exportToFile() {
  const payload = await buildBackup();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });

  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `catatan-backup-${ts}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 1800);

  return payload;
}

/* ---------------- Validasi ---------------- */

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateBackup(obj) {
  if (!isPlainObject(obj)) throw new Error('File bukan objek JSON yang valid.');
  if (obj.app !== BACKUP_APP_ID && obj.app !== 'Catatan') {
    throw new Error('File ini bukan backup aplikasi Catatan.');
  }
  if (typeof obj.version !== 'number') throw new Error('Versi backup tidak dikenali.');

  const data = obj.data;
  if (!isPlainObject(data)) throw new Error('Struktur data backup tidak dikenali.');
  if (!Array.isArray(data.notes)) throw new Error('Data catatan pada backup tidak valid.');
  if (!Array.isArray(data.categories)) throw new Error('Data folder pada backup tidak valid.');
  if (!Array.isArray(data.settings)) throw new Error('Data pengaturan pada backup tidak valid.');
  if (data.revisions !== undefined && !Array.isArray(data.revisions)) {
    throw new Error('Data riwayat versi pada backup tidak valid.');
  }

  for (const note of data.notes) {
    if (!isPlainObject(note) || typeof note.id !== 'string' || !note.id) {
      throw new Error('Ditemukan catatan tanpa ID yang valid pada backup.');
    }
  }
  for (const cat of data.categories) {
    if (!isPlainObject(cat) || typeof cat.id !== 'string' || !cat.id) {
      throw new Error('Ditemukan folder tanpa ID yang valid pada backup.');
    }
  }
  for (const setting of data.settings) {
    if (!isPlainObject(setting) || typeof setting.key !== 'string') {
      throw new Error('Ditemukan pengaturan tanpa kunci yang valid pada backup.');
    }
  }
  for (const rev of data.revisions || []) {
    if (!isPlainObject(rev) || typeof rev.id !== 'string' || !rev.id || typeof rev.noteId !== 'string') {
      throw new Error('Ditemukan riwayat versi yang tidak valid pada backup.');
    }
  }

  return true;
}

export async function readBackupFile(file) {
  if (!file) throw new Error('Tidak ada file yang dipilih.');
  if (file.size > 100 * 1024 * 1024) {
    throw new Error('Ukuran file terlalu besar (maksimal 100 MB).');
  }

  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    throw new Error('File JSON rusak atau tidak dapat dibaca.');
  }
  validateBackup(parsed);
  return parsed;
}

/* ---------------- Restore ---------------- */

export async function restoreBackup(obj, mode = 'replace') {
  validateBackup(obj);
  const notes = obj.data.notes || [];
  const categories = obj.data.categories || [];
  const settings = obj.data.settings || [];
  const revisions = obj.data.revisions || [];

  if (mode === 'replace') {
    await replaceAll({ notes, categories, settings, revisions });
  } else {
    await mergeAll({ notes, categories, settings, revisions });
  }

  return {
    notes: notes.length,
    categories: categories.length,
    settings: settings.length,
    revisions: revisions.length
  };
}

export function summarizeBackup(obj) {
  const data = obj.data || {};
  const notes = data.notes || [];
  const active = notes.filter((n) => !n.isDeleted && !n.isArchived);
  return {
    total: notes.length,
    active: active.length,
    archived: notes.filter((n) => n.isArchived && !n.isDeleted).length,
    trash: notes.filter((n) => n.isDeleted).length,
    favorites: notes.filter((n) => n.isFavorite && !n.isDeleted).length,
    pinned: notes.filter((n) => n.isPinned && !n.isDeleted && !n.isArchived).length,
    withImages: notes.filter((n) => /<img[\s>]/i.test(n.content || '')).length,
    categories: (data.categories || []).length,
    settings: (data.settings || []).length,
    revisions: (data.revisions || []).length,
    exportedAt: obj.exportedAt || null,
    version: obj.version || 1
  };
}

/* ---------------- Ekspor Markdown ---------------- */

function htmlToMarkdown(html) {
  // Konversi ringan tanpa dependensi, cukup untuk catatan sehari-hari.
  let out = String(html || '');
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<hr[^>]*>/gi, '\n---\n');
  out = out.replace(/<h1[^>]*>(.*?)<\/h1>/gis, '\n# $1\n');
  out = out.replace(/<h2[^>]*>(.*?)<\/h2>/gis, '\n## $1\n');
  out = out.replace(/<h3[^>]*>(.*?)<\/h3>/gis, '\n### $1\n');
  out = out.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, '\n> $1\n');
  out = out.replace(/<li[^>]*>(.*?)<\/li>/gis, '\n- $1');
  out = out.replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gis, '**$2**');
  out = out.replace(/<(em|i)[^>]*>(.*?)<\/\1>/gis, '*$2*');
  out = out.replace(/<(s|strike|del)[^>]*>(.*?)<\/\1>/gis, '~~$2~~');
  out = out.replace(/<code[^>]*>(.*?)<\/code>/gis, '`$1`');
  out = out.replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis, '[$2]($1)');
  out = out.replace(/<img[^>]+alt="([^"]*)"[^>]*>/gi, '![$1]');
  out = out.replace(/<input[^>]*type="checkbox"[^>]*checked[^>]*>/gi, '- [x] ');
  out = out.replace(/<input[^>]*type="checkbox"[^>]*>/gi, '- [ ] ');
  out = out.replace(/<[^>]+>/g, '');
  out = out.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

export function notesToMarkdown(notes, categories = []) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const lines = [];
  for (const note of notes) {
    lines.push(`# ${note.title || 'Tanpa judul'}`);
    const meta = [];
    const cat = catMap.get(note.categoryId);
    if (cat) meta.push(`Folder: ${cat.name}`);
    if ((note.tags || []).length) meta.push(`Tag: ${note.tags.map((t) => '#' + t).join(' ')}`);
    if (note.createdAt) meta.push(`Dibuat: ${new Date(note.createdAt).toLocaleString('id-ID')}`);
    if (note.updatedAt) meta.push(`Diperbarui: ${new Date(note.updatedAt).toLocaleString('id-ID')}`);
    if (meta.length) lines.push(meta.join(' · '));
    lines.push('');
    lines.push(htmlToMarkdown(note.content || '') || '_Tidak ada isi._');
    lines.push('\n---\n');
  }
  return lines.join('\n');
}
