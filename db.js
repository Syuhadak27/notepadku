/* ============================================================
   db.js — wrapper IndexedDB berbasis Promise
   Database: catatan-premium-db
   Stores  : notes, categories, settings, revisions
   ============================================================ */

const DB_NAME = 'catatan-premium-db';
const DB_VERSION = 2;

let _dbPromise = null;

function ensureIndex(store, name, keyPath, options = { unique: false }) {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, options);
  }
}

export function openDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('IndexedDB tidak didukung oleh browser ini.'));
      return;
    }

    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(new Error('Gagal membuka database: ' + err.message));
      return;
    }

    req.onupgradeneeded = () => {
      const db = req.result;

      let notes;
      if (!db.objectStoreNames.contains('notes')) {
        notes = db.createObjectStore('notes', { keyPath: 'id' });
      } else {
        notes = req.transaction.objectStore('notes');
      }
      ensureIndex(notes, 'createdAt', 'createdAt');
      ensureIndex(notes, 'updatedAt', 'updatedAt');
      ensureIndex(notes, 'categoryId', 'categoryId');
      ensureIndex(notes, 'deletedAt', 'deletedAt');

      if (!db.objectStoreNames.contains('categories')) {
        const cats = db.createObjectStore('categories', { keyPath: 'id' });
        ensureIndex(cats, 'name', 'name');
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('revisions')) {
        const revisions = db.createObjectStore('revisions', { keyPath: 'id' });
        ensureIndex(revisions, 'noteId', 'noteId');
        ensureIndex(revisions, 'createdAt', 'createdAt');
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        try { db.close(); } catch (_) {}
        _dbPromise = null;
        window.dispatchEvent(new CustomEvent('notes-db-versionchange'));
      };
      db.onclose = () => { _dbPromise = null; };
      resolve(db);
    };

    req.onerror = () => {
      _dbPromise = null;
      reject(req.error || new Error('Gagal membuka database.'));
    };
    req.onblocked = () => {
      _dbPromise = null;
      reject(new Error('Database sedang dipakai tab lain. Tutup tab lain lalu coba lagi.'));
    };
  });

  return _dbPromise;
}

/* ---------------- helper ---------------- */

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function runTransaction(db, storeNames, mode, executor) {
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeNames, mode);
    } catch (err) {
      reject(err);
      return;
    }
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Transaksi database gagal.'));
    tx.onabort = () => reject(tx.error || new Error('Transaksi database dibatalkan.'));
    try {
      result = executor(tx);
    } catch (err) {
      try { tx.abort(); } catch (_) {}
      reject(err);
    }
  });
}

/* ---------------- CRUD umum ---------------- */

export async function getAll(store) {
  const db = await openDB();
  const tx = db.transaction(store, 'readonly');
  return promisifyRequest(tx.objectStore(store).getAll());
}

export async function getOne(store, key) {
  const db = await openDB();
  const tx = db.transaction(store, 'readonly');
  return promisifyRequest(tx.objectStore(store).get(key));
}

export async function putOne(store, value) {
  const db = await openDB();
  await runTransaction(db, store, 'readwrite', (tx) => tx.objectStore(store).put(value));
  return value;
}

export async function putMany(store, values) {
  const db = await openDB();
  await runTransaction(db, store, 'readwrite', (tx) => {
    const os = tx.objectStore(store);
    for (const value of values) os.put(value);
  });
  return values.length;
}

export async function deleteOne(store, key) {
  const db = await openDB();
  await runTransaction(db, store, 'readwrite', (tx) => tx.objectStore(store).delete(key));
}

export async function deleteMany(store, keys) {
  const db = await openDB();
  await runTransaction(db, store, 'readwrite', (tx) => {
    const os = tx.objectStore(store);
    for (const key of keys) os.delete(key);
  });
  return keys.length;
}

export async function clearStore(store) {
  const db = await openDB();
  await runTransaction(db, store, 'readwrite', (tx) => tx.objectStore(store).clear());
}

/* ---------------- Settings ---------------- */

export async function getSetting(key, fallback = null) {
  const row = await getOne('settings', key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  return putOne('settings', { key, value });
}

export async function setSettings(map) {
  const entries = Object.entries(map).map(([key, value]) => ({ key, value }));
  return putMany('settings', entries);
}

export async function getAllSettings() {
  return getAll('settings');
}

export async function removeSetting(key) {
  return deleteOne('settings', key);
}

/* ---------------- Revisi / riwayat versi ---------------- */

export async function addRevision(revision) {
  return putOne('revisions', revision);
}

export async function getRevisions(noteId) {
  const db = await openDB();
  const tx = db.transaction('revisions', 'readonly');
  const index = tx.objectStore('revisions').index('noteId');
  const rows = await promisifyRequest(index.getAll(noteId));
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRevision(id) {
  return getOne('revisions', id);
}

export async function pruneRevisions(noteId, keep = 24) {
  const rows = await getRevisions(noteId);
  if (rows.length <= keep) return 0;
  const remove = rows.slice(keep);
  await deleteMany('revisions', remove.map((r) => r.id));
  return remove.length;
}

export async function deleteRevisions(noteId) {
  const db = await openDB();
  await runTransaction(db, 'revisions', 'readwrite', (tx) => {
    const index = tx.objectStore('revisions').index('noteId');
    const req = index.openKeyCursor(noteId);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      tx.objectStore('revisions').delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}

/* ---------------- Bulk / transaksional ---------------- */

export async function replaceAll({
  notes = [], categories = [], settings = [], revisions = []
} = {}) {
  const db = await openDB();
  await runTransaction(db, ['notes', 'categories', 'settings', 'revisions'], 'readwrite', (tx) => {
    const nOs = tx.objectStore('notes');
    const cOs = tx.objectStore('categories');
    const sOs = tx.objectStore('settings');
    const rOs = tx.objectStore('revisions');
    nOs.clear(); cOs.clear(); sOs.clear(); rOs.clear();
    for (const n of notes) nOs.put(n);
    for (const c of categories) cOs.put(c);
    for (const s of settings) sOs.put(s);
    for (const r of revisions) rOs.put(r);
  });
}

export async function mergeAll({
  notes = [], categories = [], settings = [], revisions = []
} = {}) {
  const db = await openDB();
  await runTransaction(db, ['notes', 'categories', 'settings', 'revisions'], 'readwrite', (tx) => {
    const nOs = tx.objectStore('notes');
    const cOs = tx.objectStore('categories');
    const sOs = tx.objectStore('settings');
    const rOs = tx.objectStore('revisions');
    for (const n of notes) nOs.put(n);
    for (const c of categories) cOs.put(c);
    for (const s of settings) sOs.put(s);
    for (const r of revisions) rOs.put(r);
  });
}

export async function clearEverything() {
  const db = await openDB();
  await runTransaction(db, ['notes', 'categories', 'settings', 'revisions'], 'readwrite', (tx) => {
    tx.objectStore('notes').clear();
    tx.objectStore('categories').clear();
    tx.objectStore('settings').clear();
    tx.objectStore('revisions').clear();
  });
}

export async function storageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    try { return await navigator.storage.estimate(); } catch (_) { return null; }
  }
  return null;
}
