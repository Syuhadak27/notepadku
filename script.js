    /**
     * NOTEPADKU - Vanilla JS + IndexedDB
     * PERUBAHAN: View Mode + Modal Delete
     * Struktur  { id, title, content, createdAt, updatedAt }
     */

    // ============ INDEXEDDB SETUP ============
    const DB_NAME = 'NotepadKuDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'notes';
    
    let db;
    
    /**
     * Inisialisasi IndexedDB
     * Membuat database dan object store jika belum ada
     */
    async function initDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (event) => {
          const database = event.target.result;
          
          // Buat object store 'notes' dengan keyPath 'id'
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
            // Buat index untuk pencarian dan sorting
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
            store.createIndex('title', 'title', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
        };
        
        request.onsuccess = (event) => {
          db = event.target.result;
          console.log('✅ IndexedDB terhubung:', DB_NAME);
          resolve(db);
        };
        
        request.onerror = (event) => {
          console.error('❌ Gagal membuka IndexedDB:', event.target.error);
          reject(event.target.error);
        };
      });
    }
    
    /**
     * CRUD OPERATIONS dengan async/await
     * Menggunakan Promise wrapper untuk onsuccess/onerror
     */
    
    // CREATE - Tambah catatan baru
    async function addNote(note) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(note);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    
    // READ - Ambil semua catatan
    async function getAllNotes() {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    
    // READ BY ID - Ambil satu catatan
    async function getNoteById(id) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    
    // UPDATE - Perbarui catatan
    async function updateNote(note) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(note);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    
    // DELETE - Hapus catatan
    async function deleteNote(id) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    
    // CLEAR ALL - Hapus semua catatan
    async function clearAllNotes() {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    // ============ APP STATE & CONFIG ============
    const AppState = {
      notes: [],
      filteredNotes: [],
      currentNoteId: null,
      editorMode: 'view', // 'view' atau 'edit'
      searchQuery: '',
      sortBy: 'newest',
      settings: {
        theme: 'system',
        fontSize: '16px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        autosaveInterval: 2000
      },
      autosaveTimer: null,
      lastSaved: null,
      deleteTargetId: null // Untuk modal delete
    };

    // ============ DOM ELEMENTS ============
    const elements = {
      notesGrid: document.getElementById('notesGrid'),
      emptyState: document.getElementById('emptyState'),
      searchInput: document.getElementById('searchInput'),
      sortSelect: document.getElementById('sortSelect'),
      newNoteBtn: document.getElementById('newNoteBtn'),
      emptyNewNoteBtn: document.getElementById('emptyNewNoteBtn'),
      settingsBtn: document.getElementById('settingsBtn'),
      
      // Editor
      editorModal: document.getElementById('editorModal'),
      editorBackBtn: document.getElementById('editorBackBtn'),
      editorTitle: document.getElementById('editorTitle'),
      editorContent: document.getElementById('editorContent'),
      editorSaveBtn: document.getElementById('editorSaveBtn'),
      editorCancelBtn: document.getElementById('editorCancelBtn'),
      editorEditBtn: document.getElementById('editorEditBtn'),
      editorDeleteBtn: document.getElementById('editorDeleteBtn'),
      exportTxtBtn: document.getElementById('exportTxtBtn'),
      saveStatus: document.getElementById('saveStatus'),
      wordCount: document.getElementById('wordCount'),
      charCount: document.getElementById('charCount'),
      lastSavedTime: document.getElementById('lastSavedTime'),
      savedIndicator: document.getElementById('savedIndicator'),
      modeIndicator: document.getElementById('modeIndicator'),
      
      // Delete Modal
      deleteModal: document.getElementById('deleteModal'),
      deleteModalTitle: document.getElementById('deleteModalTitle'),
      deleteCancelBtn: document.getElementById('deleteCancelBtn'),
      deleteConfirmBtn: document.getElementById('deleteConfirmBtn'),
      
      // Settings
      settingsModal: document.getElementById('settingsModal'),
      closeSettingsBtn: document.getElementById('closeSettingsBtn'),
      themeBtns: document.querySelectorAll('.theme-btn'),
      fontSizeSelect: document.getElementById('fontSizeSelect'),
      fontFamilySelect: document.getElementById('fontFamilySelect'),
      autosaveIntervalSelect: document.getElementById('autosaveIntervalSelect'),
      backupBtn: document.getElementById('backupBtn'),
      importFile: document.getElementById('importFile'),
      clearAllBtn: document.getElementById('clearAllBtn'),
      
      // Stats
      totalNotes: document.getElementById('totalNotes'),
      totalWords: document.getElementById('totalWords'),
      lastBackup: document.getElementById('lastBackup'),
      
      // Toast
      toast: document.getElementById('toast'),
      toastMessage: document.getElementById('toastMessage'),
      toastIcon: document.getElementById('toastIcon')
    };

    // ============ UTILITY FUNCTIONS ============
    
    function generateId() {
      return 'note_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    function formatDate(dateString) {
      const date = new Date(dateString);
      return date.toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    }
    
    function formatRelativeTime(dateString) {
      const now = new Date();
      const date = new Date(dateString);
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) return 'baru saja';
      if (diffMins < 60) return `${diffMins} menit lalu`;
      if (diffHours < 24) return `${diffHours} jam lalu`;
      if (diffDays < 7) return `${diffDays} hari lalu`;
      return formatDate(dateString);
    }
    
    function countWords(text) {
      if (!text || !text.trim()) return 0;
      return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }
    
    function countChars(text) {
      return text ? text.length : 0;
    }
    
    function getPreview(content, maxLength = 150) {
      if (!content) return '';
      const clean = content.replace(/\s+/g, ' ').trim();
      return clean.length > maxLength ? clean.substring(0, maxLength) + '...' : clean;
    }
    
    function showToast(message, type = 'info') {
      const icons = {
        success: '<svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
        error: '<svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
        info: '<svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
      };
      
      elements.toastIcon.innerHTML = icons[type] || icons.info;
      elements.toastMessage.textContent = message;
      elements.toast.classList.remove('translate-y-20', 'opacity-0');
      elements.toast.classList.add('translate-y-0', 'opacity-100');
      
      setTimeout(() => {
        elements.toast.classList.add('translate-y-20', 'opacity-0');
        elements.toast.classList.remove('translate-y-0', 'opacity-100');
      }, 3000);
    }
    
    function debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    // ============ THEME MANAGEMENT ============
    
    function applyTheme(theme) {
      const html = document.documentElement;
      
      if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
      
      elements.themeBtns.forEach(btn => {
        if (btn.dataset.theme === theme) {
          btn.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400', 'font-medium');
          btn.classList.remove('border-gray-200', 'dark:border-gray-600');
        } else {
          btn.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400', 'font-medium');
          btn.classList.add('border-gray-200', 'dark:border-gray-600');
        }
      });
    }
    
    function saveThemePreference(theme) {
      localStorage.setItem('notepadku_theme', theme);
      applyTheme(theme);
    }
    
    function loadThemePreference() {
      const saved = localStorage.getItem('notepadku_theme');
      if (saved) {
        AppState.settings.theme = saved;
      }
      applyTheme(AppState.settings.theme);
    }
    
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (AppState.settings.theme === 'system') {
        applyTheme('system');
      }
    });

    // ============ SETTINGS MANAGEMENT ============
    
    function loadSettings() {
      const saved = localStorage.getItem('notepadku_settings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          AppState.settings = { ...AppState.settings, ...parsed };
        } catch (e) {
          console.error('Gagal load settings:', e);
        }
      }
      
      elements.fontSizeSelect.value = AppState.settings.fontSize;
      elements.fontFamilySelect.value = AppState.settings.fontFamily;
      elements.autosaveIntervalSelect.value = AppState.settings.autosaveInterval;
    }
    
    function saveSettings() {
      localStorage.setItem('notepadku_settings', JSON.stringify(AppState.settings));
    }
    
    function updateEditorStyle() {
      elements.editorContent.style.fontSize = AppState.settings.fontSize;
      elements.editorContent.style.fontFamily = AppState.settings.fontFamily;
    }

    // ============ NOTE CARD RENDERING ============
    
    function createNoteCard(note) {
      const card = document.createElement('div');
      card.className = 'note-card bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 animate-fade-in';
      card.dataset.id = note.id;
      
      const wordCount = countWords(note.content);
      const preview = getPreview(note.content);
      
      card.innerHTML = `
        <div class="flex flex-col h-full">
          <h3 class="font-bold text-gray-800 dark:text-gray-100 mb-2 line-clamp-1" title="${note.title || 'Tanpa judul'}">
            ${note.title || 'Tanpa judul'}
          </h3>
          <p class="content-preview text-sm text-gray-600 dark:text-gray-400 mb-3 flex-1">
            ${preview || '<span class="italic text-gray-400">Isi catatan kosong...</span>'}
          </p>
          <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-700">
            <span title="${formatDate(note.updatedAt)}">${formatRelativeTime(note.updatedAt)}</span>
            <div class="flex items-center gap-3">
              <span>${wordCount} kata</span>
              <div class="flex gap-1" onclick="event.stopPropagation()">
                <button class="edit-btn p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400 transition-colors" title="Edit" data-id="${note.id}">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>
                <button class="delete-btn p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-600 dark:text-red-400 transition-colors" title="Hapus" data-id="${note.id}">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      
      // Click card → buka mode LIHAT (view mode)
      card.addEventListener('click', (e) => {
        if (e.target.closest('.edit-btn') || e.target.closest('.delete-btn')) return;
        openEditor(note.id, 'view'); // Buka dalam mode view
      });
      
      // Tombol edit di card
      card.querySelector('.edit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openEditor(note.id, 'view'); // Juga buka view dulu, user klik edit di editor
      });
      
      // Tombol delete di card → buka modal konfirmasi
      card.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showDeleteModal(note.id, note.title);
      });
      
      return card;
    }
    
    async function renderNotes() {
      elements.notesGrid.innerHTML = '';
      
      if (AppState.filteredNotes.length === 0) {
        elements.emptyState.classList.remove('hidden');
        elements.notesGrid.classList.add('hidden');
      } else {
        elements.emptyState.classList.add('hidden');
        elements.notesGrid.classList.remove('hidden');
        
        for (const note of AppState.filteredNotes) {
          const card = createNoteCard(note);
          elements.notesGrid.appendChild(card);
        }
      }
      
      updateStats();
    }
    
    function filterAndSortNotes() {
      let filtered = [...AppState.notes];
      
      if (AppState.searchQuery) {
        const query = AppState.searchQuery.toLowerCase();
        filtered = filtered.filter(note => 
          (note.title && note.title.toLowerCase().includes(query)) ||
          (note.content && note.content.toLowerCase().includes(query))
        );
      }
      
      switch (AppState.sortBy) {
        case 'newest':
          filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          break;
        case 'oldest':
          filtered.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
          break;
        case 'az':
          filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
          break;
      }
      
      AppState.filteredNotes = filtered;
    }
    
    async function loadAndRenderNotes() {
      try {
        AppState.notes = await getAllNotes();
        filterAndSortNotes();
        renderNotes();
      } catch (err) {
        console.error('Gagal load notes:', err);
        showToast('Gagal memuat catatan', 'error');
      }
    }
    
    function updateStats() {
      const totalNotes = AppState.notes.length;
      const totalWords = AppState.notes.reduce((sum, note) => sum + countWords(note.content), 0);
      const lastBackup = localStorage.getItem('notepadku_last_backup');
      
      elements.totalNotes.textContent = `${totalNotes} catatan`;
      elements.totalWords.textContent = `${totalWords} kata`;
      elements.lastBackup.textContent = `Backup: ${lastBackup ? formatRelativeTime(lastBackup) : '-'}`;
    }

    // ============ EDITOR FUNCTIONS ============
    
    // Buka editor dengan mode tertentu: 'view' atau 'edit'
    async function openEditor(noteId = null, mode = 'view') {
      try {
        AppState.currentNoteId = noteId;
        AppState.editorMode = mode;
        
        if (noteId) {
          const note = await getNoteById(noteId);
          if (note) {
            elements.editorTitle.value = note.title || '';
            elements.editorContent.value = note.content || '';
          }
        } else {
          elements.editorTitle.value = '';
          elements.editorContent.value = '';
        }
        
        updateEditorStyle();
        updateEditorCounts();
        updateEditorMode(); // Set readonly/editable berdasarkan mode
        
        elements.saveStatus.classList.add('opacity-0');
        elements.lastSavedTime.textContent = noteId ? 'Belum disimpan' : 'Catatan baru';
        
        elements.editorModal.classList.remove('hidden');
        
        setTimeout(() => {
          elements.editorTitle.focus();
        }, 100);
        
        // Autosave hanya aktif di mode edit
        if (AppState.editorMode === 'edit') {
          startAutosave();
        }
        
      } catch (err) {
        console.error('Gagal buka editor:', err);
        showToast('Gagal membuka editor', 'error');
      }
    }
    
    // Update UI berdasarkan mode (view/edit)
    function updateEditorMode() {
      const isView = AppState.editorMode === 'view';
      
      // Toggle readonly pada textarea dan title input
      elements.editorContent.readOnly = isView;
      elements.editorTitle.readOnly = isView;
      
      // Toggle class untuk show/hide button groups
      if (isView) {
        elements.editorModal.classList.add('view-mode');
        elements.editorModal.classList.remove('edit-mode');
        elements.modeIndicator.textContent = 'Mode: Lihat';
        elements.modeIndicator.className = 'px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
      } else {
        elements.editorModal.classList.add('edit-mode');
        elements.editorModal.classList.remove('view-mode');
        elements.modeIndicator.textContent = 'Mode: Edit';
        elements.modeIndicator.className = 'px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300';
      }
    }
    
    // Switch dari view ke edit mode
    function switchToEditMode() {
      AppState.editorMode = 'edit';
      updateEditorMode();
      elements.editorTitle.focus();
      startAutosave();
      showToast('Mode Edit diaktifkan', 'info');
    }
    
    function closeEditor() {
      stopAutosave();
      elements.editorModal.classList.add('hidden');
      AppState.currentNoteId = null;
      AppState.editorMode = 'view';
      loadAndRenderNotes();
    }
    
    async function saveNote() {
      const title = elements.editorTitle.value.trim();
      const content = elements.editorContent.value;
      const now = new Date().toISOString();
      
      try {
        if (AppState.currentNoteId) {
          const note = await getNoteById(AppState.currentNoteId);
          if (note) {
            note.title = title;
            note.content = content;
            note.updatedAt = now;
            await updateNote(note);
          }
        } else {
          const newNote = {
            id: generateId(),
            title: title || 'Tanpa judul',
            content: content,
            createdAt: now,
            updatedAt: now
          };
          AppState.currentNoteId = newNote.id;
          await addNote(newNote);
        }
        
        AppState.lastSaved = new Date();
        elements.lastSavedTime.textContent = 'Baru saja';
        elements.saveStatus.classList.remove('opacity-0');
        elements.saveStatus.classList.add('status-saved');
        
        setTimeout(() => {
          elements.saveStatus.classList.remove('status-saved');
        }, 1500);
        
        showToast('Catatan disimpan ✓', 'success');
        return true;
        
      } catch (err) {
        console.error('Gagal menyimpan:', err);
        showToast('Gagal menyimpan catatan', 'error');
        return false;
      }
    }
    
    // Show custom delete modal
    function showDeleteModal(noteId, noteTitle) {
      AppState.deleteTargetId = noteId;
      elements.deleteModalTitle.textContent = `"${noteTitle || 'Tanpa judul'}"`;
      elements.deleteModal.classList.remove('hidden');
    }
    
    // Hide delete modal
    function hideDeleteModal() {
      elements.deleteModal.classList.add('hidden');
      AppState.deleteTargetId = null;
    }
    
    // Execute delete after confirmation
    async function confirmDelete() {
      if (!AppState.deleteTargetId) return;
      
      try {
        await deleteNote(AppState.deleteTargetId);
        hideDeleteModal();
        
        // Jika yang dihapus sedang dibuka di editor, tutup editor
        if (AppState.currentNoteId === AppState.deleteTargetId) {
          closeEditor();
        } else {
          await loadAndRenderNotes();
        }
        
        showToast('Catatan dihapus', 'success');
      } catch (err) {
        console.error('Gagal hapus:', err);
        showToast('Gagal menghapus catatan', 'error');
      }
    }
    
    function updateEditorCounts() {
      const content = elements.editorContent.value;
      elements.wordCount.textContent = `${countWords(content)} kata`;
      elements.charCount.textContent = `${countChars(content)} karakter`;
    }
    
    function startAutosave() {
      stopAutosave();
      const interval = AppState.settings.autosaveInterval;
      if (interval > 0 && AppState.editorMode === 'edit') {
        AppState.autosaveTimer = setInterval(async () => {
          if (AppState.currentNoteId || elements.editorTitle.value || elements.editorContent.value) {
            await saveNote();
          }
        }, interval);
      }
    }
    
    function stopAutosave() {
      if (AppState.autosaveTimer) {
        clearInterval(AppState.autosaveTimer);
        AppState.autosaveTimer = null;
      }
    }
    
    function exportAsTxt() {
      const title = elements.editorTitle.value.trim() || 'catatan';
      const content = elements.editorContent.value;
      const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
      
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('Catatan diexport sebagai .txt', 'success');
    }
    
    async function backupNotes() {
      try {
        const notes = await getAllNotes();
        const backup = {
          version: '1.1',
          exportedAt: new Date().toISOString(),
          notes: notes
        };
        
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notepadku-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        localStorage.setItem('notepadku_last_backup', new Date().toISOString());
        updateStats();
        showToast('Backup berhasil diunduh', 'success');
      } catch (err) {
        console.error('Gagal backup:', err);
        showToast('Gagal membuat backup', 'error');
      }
    }
    
    async function importNotes(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const data = JSON.parse(e.target.result);
            if (!data.notes || !Array.isArray(data.notes)) throw new Error('Format file tidak valid');
            
            let imported = 0, skipped = 0;
            for (const note of data.notes) {
              if (note.id && note.content !== undefined) {
                const existing = await getNoteById(note.id);
                if (existing) { note.id = generateId(); skipped++; }
                await addNote(note);
                imported++;
              }
            }
            resolve({ imported, skipped });
          } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Gagal membaca file'));
        reader.readAsText(file);
      });
    }

    // ============ EVENT LISTENERS ============
    
    function setupEventListeners() {
      // Search
      const debouncedSearch = debounce((query) => {
        AppState.searchQuery = query;
        filterAndSortNotes();
        renderNotes();
      }, 300);
      elements.searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
      
      // Sort
      elements.sortSelect.addEventListener('change', (e) => {
        AppState.sortBy = e.target.value;
        filterAndSortNotes();
        renderNotes();
      });
      
      // New Note
      const createNewNote = () => openEditor(null, 'edit'); // New note langsung edit mode
      elements.newNoteBtn.addEventListener('click', createNewNote);
      elements.emptyNewNoteBtn.addEventListener('click', createNewNote);
      
      // Settings
      elements.settingsBtn.addEventListener('click', () => elements.settingsModal.classList.remove('hidden'));
      elements.closeSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
      elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) elements.settingsModal.classList.add('hidden');
      });
      
      // Theme buttons
      elements.themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          AppState.settings.theme = btn.dataset.theme;
          saveThemePreference(AppState.settings.theme);
          saveSettings();
        });
      });
      
      // Font settings
      elements.fontSizeSelect.addEventListener('change', (e) => {
        AppState.settings.fontSize = e.target.value;
        updateEditorStyle();
        saveSettings();
      });
      elements.fontFamilySelect.addEventListener('change', (e) => {
        AppState.settings.fontFamily = e.target.value;
        updateEditorStyle();
        saveSettings();
      });
      elements.autosaveIntervalSelect.addEventListener('change', (e) => {
        AppState.settings.autosaveInterval = parseInt(e.target.value);
        saveSettings();
        if (AppState.editorMode === 'edit') startAutosave();
      });
      
      // Backup/Import
      elements.backupBtn.addEventListener('click', backupNotes);
      elements.importFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const result = await importNotes(file);
          await loadAndRenderNotes();
          showToast(`Import: ${result.imported} catatan ${result.skipped > 0 ? `(${result.skipped} duplikat)` : ''}`, 'success');
        } catch (err) {
          console.error('Gagal import:', err);
          showToast('Gagal mengimport file', 'error');
        }
        e.target.value = '';
      });
      
      // Clear all (dengan modal delete juga)
      elements.clearAllBtn.addEventListener('click', () => {
        showDeleteModal('ALL', 'SEMUA CATATAN');
        // Override confirm action untuk clear all
        const originalConfirm = confirmDelete;
        const tempHandler = async () => {
          try {
            await clearAllNotes();
            hideDeleteModal();
            await loadAndRenderNotes();
            showToast('Semua catatan dihapus', 'success');
            elements.settingsModal.classList.add('hidden');
          } catch (err) {
            console.error('Gagal clear:', err);
            showToast('Gagal menghapus catatan', 'error');
          }
        };
        // Temporary override
        elements.deleteConfirmBtn.onclick = tempHandler;
        elements.deleteCancelBtn.onclick = () => {
          hideDeleteModal();
          elements.deleteConfirmBtn.onclick = confirmDelete; // Restore
        };
      });
      
      // Editor buttons
      elements.editorBackBtn.addEventListener('click', closeEditor);
      elements.editorEditBtn.addEventListener('click', switchToEditMode);
      elements.editorCancelBtn.addEventListener('click', closeEditor);
      elements.editorSaveBtn.addEventListener('click', async () => { await saveNote(); });
      elements.editorDeleteBtn.addEventListener('click', () => {
        const title = elements.editorTitle.value || 'Tanpa judul';
        showDeleteModal(AppState.currentNoteId, title);
      });
      elements.exportTxtBtn.addEventListener('click', exportAsTxt);
      
      // Editor content events (hanya update count, tidak autosave di view mode)
      elements.editorTitle.addEventListener('input', updateEditorCounts);
      elements.editorContent.addEventListener('input', () => {
        updateEditorCounts();
        if (AppState.editorMode === 'edit') {
          elements.saveStatus.classList.add('opacity-0');
        }
      });
      
      // Delete Modal buttons
      elements.deleteCancelBtn.addEventListener('click', hideDeleteModal);
      elements.deleteConfirmBtn.addEventListener('click', confirmDelete);
      elements.deleteModal.addEventListener('click', (e) => {
        if (e.target === elements.deleteModal) hideDeleteModal();
      });
      
      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'n' && elements.editorModal.classList.contains('hidden')) {
          e.preventDefault();
          createNewNote();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's' && !elements.editorModal.classList.contains('hidden') && AppState.editorMode === 'edit') {
          e.preventDefault();
          saveNote();
        }
        if (e.key === 'Escape') {
          if (!elements.editorModal.classList.contains('hidden')) {
            closeEditor();
          } else if (!elements.settingsModal.classList.contains('hidden')) {
            elements.settingsModal.classList.add('hidden');
          } else if (!elements.deleteModal.classList.contains('hidden')) {
            hideDeleteModal();
          }
        }
      });
    }

    // ============ INITIALIZATION ============
    
    async function init() {
      try {
        await initDB();
        loadThemePreference();
        loadSettings();
        setupEventListeners();
        await loadAndRenderNotes();
        console.log('🚀 NotepadKu v1.1 siap digunakan!');
      } catch (err) {
        console.error('❌ Gagal inisialisasi:', err);
        showToast('Gagal memuat aplikasi', 'error');
      }
    }
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }