/* ============================================================
   audio.js — perekam suara untuk catatan
   ============================================================ */

import { icon } from './icons.js';
import { openModal } from './modals.js';
import { formatDuration } from './utils.js';

const MAX_SECONDS = 10 * 60;

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca rekaman.'));
    reader.readAsDataURL(blob);
  });
}

export function openAudioRecorder() {
  let stream = null;
  let recorder = null;
  let chunks = [];
  let recording = false;
  let discard = false;
  let recordedBlob = null;
  let previewUrl = '';
  let startedAt = 0;
  let elapsed = 0;
  let tickTimer = null;
  let destroyed = false;

  const supported = Boolean(
    navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  );

  const modal = openModal({
    title: 'Rekaman suara',
    subtitle: 'Rekam ide, rapat, atau pengingat langsung di catatan.',
    iconName: 'mic',
    className: 'modal-audio',
    body: supported ? `
      <div class="audio-recorder">
        <div class="audio-visual" id="audio-visual" aria-hidden="true">
          ${Array.from({ length: 24 }, (_, i) => `<span style="--i:${i};--h:${18 + ((i * 37) % 52)}%"></span>`).join('')}
        </div>
        <div class="audio-timer" id="audio-timer">00:00</div>
        <p class="audio-status" id="audio-status">Tekan tombol di bawah untuk mulai merekam.</p>
        <div class="audio-controls">
          <button type="button" class="audio-record-btn" id="audio-record" aria-label="Mulai merekam">
            ${icon('mic', 30)}
          </button>
          <button type="button" class="audio-stop-btn" id="audio-stop" hidden aria-label="Berhenti merekam">
            ${icon('stop', 26)}
          </button>
        </div>
        <div class="audio-preview" id="audio-preview" hidden>
          <audio id="audio-player" controls preload="metadata"></audio>
          <button type="button" class="btn btn-ghost btn-sm" id="audio-redo">${icon('refresh', 16)} Rekam ulang</button>
        </div>
        <p class="audio-error" id="audio-error" hidden></p>
        <p class="audio-limit">Rekaman disimpan sebagai bagian dari catatan. Maksimal 10 menit.</p>
      </div>` : `
      <div class="audio-unsupported">
        <span class="audio-unsupported-ico">${icon('mic', 34)}</span>
        <h3>Perekam tidak tersedia</h3>
        <p>Browser ini belum mendukung perekaman audio, atau akses mikrofon diblokir. Coba gunakan Chrome, Edge, atau Safari terbaru.</p>
      </div>`,
    footer: supported ? `
      <button type="button" class="btn btn-ghost" data-modal-close>Batal</button>
      <button type="button" class="btn btn-primary" id="audio-save" disabled>${icon('check', 17)} Sisipkan rekaman</button>`
      : `<button type="button" class="btn btn-primary btn-block" data-modal-close>Tutup</button>`
  });

  if (!supported) return modal.promise;

  const visual = modal.sheet.querySelector('#audio-visual');
  const timerEl = modal.sheet.querySelector('#audio-timer');
  const statusEl = modal.sheet.querySelector('#audio-status');
  const recordBtn = modal.sheet.querySelector('#audio-record');
  const stopBtn = modal.sheet.querySelector('#audio-stop');
  const previewWrap = modal.sheet.querySelector('#audio-preview');
  const player = modal.sheet.querySelector('#audio-player');
  const redoBtn = modal.sheet.querySelector('#audio-redo');
  const errorEl = modal.sheet.querySelector('#audio-error');
  const saveBtn = modal.sheet.querySelector('#audio-save');

  function setError(message) {
    if (!message) {
      errorEl.hidden = true;
      errorEl.textContent = '';
      return;
    }
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function updateTimer() {
    if (!recording) return;
    elapsed = Math.min(MAX_SECONDS, Math.floor((Date.now() - startedAt) / 1000));
    timerEl.textContent = formatDuration(elapsed);
    if (elapsed >= MAX_SECONDS) {
      statusEl.textContent = 'Batas 10 menit tercapai. Rekaman dihentikan otomatis.';
      stopRecording();
    }
  }

  function cleanupStream() {
    try { stream?.getTracks?.().forEach((track) => track.stop()); } catch (_) { /* noop */ }
    stream = null;
  }

  function resetPreview() {
    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (_) { /* noop */ }
      previewUrl = '';
    }
    recordedBlob = null;
    previewWrap.hidden = true;
    player.removeAttribute('src');
    try { player.load(); } catch (_) { /* noop */ }
    saveBtn.disabled = true;
  }

  function setRecordingUI(value) {
    recording = value;
    visual.classList.toggle('recording', value);
    recordBtn.hidden = value;
    stopBtn.hidden = !value;
    timerEl.classList.toggle('recording', value);
    if (value) {
      statusEl.textContent = 'Sedang merekam… ketuk tombol berhenti jika selesai.';
      recordBtn.setAttribute('aria-label', 'Sedang merekam');
    }
  }

  async function startRecording() {
    setError('');
    resetPreview();
    elapsed = 0;
    timerEl.textContent = '00:00';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (err) {
      setError(err?.name === 'NotAllowedError'
        ? 'Akses mikrofon ditolak. Izinkan mikrofon di pengaturan browser lalu coba lagi.'
        : 'Mikrofon tidak dapat diakses. Periksa perangkat dan izin browser.');
      return;
    }
    if (destroyed) {
      cleanupStream();
      return;
    }

    const mimeType = pickMimeType();
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      cleanupStream();
      setError('Format rekaman tidak didukung oleh browser ini.');
      return;
    }

    chunks = [];
    discard = false;
    startedAt = Date.now();

    recorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    });
    recorder.addEventListener('stop', () => {
      clearInterval(tickTimer);
      tickTimer = null;
      cleanupStream();
      setRecordingUI(false);
      if (discard) {
        discard = false;
        return;
      }
      const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
      recordedBlob = new Blob(chunks, { type });
      if (!recordedBlob.size) {
        setError('Rekaman kosong. Coba rekam lagi.');
        return;
      }
      previewUrl = URL.createObjectURL(recordedBlob);
      player.src = previewUrl;
      previewWrap.hidden = false;
      saveBtn.disabled = false;
      statusEl.textContent = 'Rekaman siap. Dengarkan dulu atau sisipkan ke catatan.';
      player.play().catch(() => {});
    });

    recorder.start(250);
    setRecordingUI(true);
    tickTimer = setInterval(updateTimer, 500);
    updateTimer();
  }

  function stopRecording() {
    if (!recording || !recorder) return;
    clearInterval(tickTimer);
    tickTimer = null;
    elapsed = Math.min(MAX_SECONDS, Math.floor((Date.now() - startedAt) / 1000));
    timerEl.textContent = formatDuration(elapsed);
    try { recorder.stop(); } catch (_) { /* noop */ }
  }

  recordBtn.addEventListener('click', startRecording);
  stopBtn.addEventListener('click', stopRecording);
  redoBtn.addEventListener('click', () => {
    resetPreview();
    startRecording();
  });

  saveBtn.addEventListener('click', async () => {
    if (!recordedBlob) return;
    saveBtn.disabled = true;
    saveBtn.innerHTML = 'Menyiapkan…';
    try {
      const dataUrl = await blobToDataURL(recordedBlob);
      modal.close(dataUrl);
    } catch (err) {
      setError(err.message || 'Gagal menyiapkan rekaman.');
      saveBtn.disabled = false;
      saveBtn.innerHTML = `${icon('check', 17)} Sisipkan rekaman`;
    }
  });

  modal.opts.onClose = () => {
    destroyed = true;
    discard = true;
    clearInterval(tickTimer);
    tickTimer = null;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch (_) { /* noop */ }
    }
    cleanupStream();
    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (_) { /* noop */ }
      previewUrl = '';
    }
  };

  return modal.promise;
}
