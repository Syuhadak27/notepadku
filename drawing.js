/* ============================================================
   drawing.js — kanvas gambar tangan untuk disisipkan ke catatan
   ============================================================ */

import { icon } from './icons.js';
import { openModal, confirmDialog } from './modals.js';

const COLORS = ['#111827', '#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#ec4899'];
const SIZES = [2, 4, 8, 14];
const TOOLS = [
  ['pen', 'pencil', 'Pena'],
  ['marker', 'highlight', 'Stabilo'],
  ['eraser', 'close', 'Penghapus']
];

export function openDrawingModal({ title = 'Gambar tangan' } = {}) {
  let tool = 'pen';
  let color = COLORS[0];
  let size = 4;
  let strokes = [];
  let activeStroke = null;
  let lastPoint = null;
  let resizeObserver = null;
  let destroyed = false;

  const modal = openModal({
    title,
    subtitle: 'Gambar dengan jari, mouse, atau stylus.',
    iconName: 'draw',
    className: 'modal-draw',
    dismissible: true,
    body: `
      <div class="draw-wrap">
        <div class="draw-tools">
          <div class="draw-tool-group">
            ${TOOLS.map(([value, ico, label]) => `
              <button type="button" class="draw-tool${value === tool ? ' active' : ''}"
                      data-draw-tool="${value}" title="${label}" aria-label="${label}">${icon(ico, 18)}</button>`).join('')}
          </div>
          <div class="draw-tool-group draw-colors">
            ${COLORS.map((c) => `
              <button type="button" class="draw-color${c === color ? ' active' : ''}"
                      style="--sw:${c}" data-draw-color="${c}" aria-label="Warna ${c}"></button>`).join('')}
          </div>
          <div class="draw-tool-group draw-sizes">
            ${SIZES.map((s) => `
              <button type="button" class="draw-size${s === size ? ' active' : ''}" data-draw-size="${s}"
                      aria-label="Ketebalan ${s}"><span style="width:${Math.max(4, s + 3)}px;height:${Math.max(4, s + 3)}px"></span></button>`).join('')}
          </div>
          <div class="draw-tool-group draw-actions">
            <button type="button" class="draw-tool" id="draw-undo" title="Urungkan" aria-label="Urungkan">${icon('undo', 18)}</button>
            <button type="button" class="draw-tool" id="draw-clear" title="Bersihkan" aria-label="Bersihkan">${icon('trash', 18)}</button>
          </div>
        </div>
        <div class="draw-canvas-wrap" id="draw-canvas-wrap">
          <canvas id="draw-canvas" aria-label="Kanvas gambar"></canvas>
          <div class="draw-hint" id="draw-hint">Mulai menggambar di sini</div>
        </div>
      </div>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-modal-close>Batal</button>
      <button type="button" class="btn btn-primary" id="draw-save" disabled>${icon('check', 17)} Sisipkan gambar</button>`
  });

  const canvas = modal.sheet.querySelector('#draw-canvas');
  const wrap = modal.sheet.querySelector('#draw-canvas-wrap');
  const hint = modal.sheet.querySelector('#draw-hint');
  const saveBtn = modal.sheet.querySelector('#draw-save');
  const undoBtn = modal.sheet.querySelector('#draw-undo');
  const clearBtn = modal.sheet.querySelector('#draw-clear');
  const ctx = canvas.getContext('2d');

  let cssWidth = 320;
  let cssHeight = 320;

  function updateButtons() {
    undoBtn.disabled = !strokes.length;
    saveBtn.disabled = !strokes.length;
    hint.hidden = strokes.length > 0 || Boolean(activeStroke);
  }

  function resizeCanvas() {
    if (destroyed) return;
    const rect = wrap.getBoundingClientRect();
    cssWidth = Math.max(200, Math.round(rect.width));
    cssHeight = Math.max(220, Math.round(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function strokePath(stroke, targetCtx = ctx) {
    const points = stroke.points;
    if (!points.length) return;
    targetCtx.save();
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.lineWidth = stroke.size;
    targetCtx.strokeStyle = stroke.color;
    targetCtx.globalAlpha = stroke.tool === 'marker' ? 0.32 : 1;
    targetCtx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';

    if (points.length === 1) {
      targetCtx.beginPath();
      targetCtx.arc(points[0].x * cssWidth, points[0].y * cssHeight, stroke.size / 2, 0, Math.PI * 2);
      targetCtx.fillStyle = stroke.color;
      targetCtx.globalAlpha = stroke.tool === 'marker' ? 0.32 : 1;
      targetCtx.fill();
    } else {
      targetCtx.beginPath();
      targetCtx.moveTo(points[0].x * cssWidth, points[0].y * cssHeight);
      for (let i = 1; i < points.length; i++) {
        const p = points[i];
        targetCtx.lineTo(p.x * cssWidth, p.y * cssHeight);
      }
      targetCtx.stroke();
    }
    targetCtx.restore();
  }

  function redraw() {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const stroke of strokes) strokePath(stroke);
    if (activeStroke) strokePath(activeStroke);
  }

  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    };
  }

  function startStroke(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const p = pointFromEvent(e);
    activeStroke = { tool, color, size, points: [p] };
    lastPoint = p;
    updateButtons();
    redraw();
  }

  function moveStroke(e) {
    if (!activeStroke) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    const dx = (p.x - lastPoint.x) * cssWidth;
    const dy = (p.y - lastPoint.y) * cssHeight;
    if (dx * dx + dy * dy < 1.2) return;
    activeStroke.points.push(p);
    lastPoint = p;
    // Gambar segmen terakhir saja agar tetap ringan.
    const pts = activeStroke.points;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = activeStroke.size;
    ctx.strokeStyle = activeStroke.color;
    ctx.globalAlpha = activeStroke.tool === 'marker' ? 0.32 : 1;
    ctx.globalCompositeOperation = activeStroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.beginPath();
    ctx.moveTo(pts[pts.length - 2].x * cssWidth, pts[pts.length - 2].y * cssHeight);
    ctx.lineTo(pts[pts.length - 1].x * cssWidth, pts[pts.length - 1].y * cssHeight);
    ctx.stroke();
    ctx.restore();
  }

  function endStroke() {
    if (!activeStroke) return;
    if (activeStroke.points.length === 1) {
      const p = activeStroke.points[0];
      ctx.save();
      ctx.globalCompositeOperation = activeStroke.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.fillStyle = activeStroke.color;
      ctx.globalAlpha = activeStroke.tool === 'marker' ? 0.32 : 1;
      ctx.beginPath();
      ctx.arc(p.x * cssWidth, p.y * cssHeight, activeStroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    strokes.push(activeStroke);
    activeStroke = null;
    lastPoint = null;
    updateButtons();
  }

  canvas.addEventListener('pointerdown', startStroke);
  canvas.addEventListener('pointermove', moveStroke);
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', (e) => {
    if (activeStroke && e.buttons === 0) endStroke();
  });

  modal.sheet.querySelectorAll('[data-draw-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tool = btn.dataset.drawTool;
      modal.sheet.querySelectorAll('[data-draw-tool]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });
  modal.sheet.querySelectorAll('[data-draw-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
      color = btn.dataset.drawColor;
      modal.sheet.querySelectorAll('[data-draw-color]').forEach((b) => b.classList.toggle('active', b === btn));
      if (tool === 'eraser') {
        tool = 'pen';
        modal.sheet.querySelectorAll('[data-draw-tool]').forEach((b) => b.classList.toggle('active', b.dataset.drawTool === 'pen'));
      }
    });
  });
  modal.sheet.querySelectorAll('[data-draw-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      size = Number(btn.dataset.drawSize);
      modal.sheet.querySelectorAll('[data-draw-size]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  undoBtn.addEventListener('click', () => {
    strokes.pop();
    redraw();
    updateButtons();
  });
  clearBtn.addEventListener('click', async () => {
    if (!strokes.length) return;
    const ok = await confirmDialog({
      title: 'Bersihkan gambar?',
      message: 'Semua goresan pada kanvas akan dihapus.',
      confirmText: 'Bersihkan',
      danger: true,
      iconName: 'trash'
    });
    if (!ok) return;
    strokes = [];
    redraw();
    updateButtons();
  });

  function exportDataURL() {
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const outCtx = out.getContext('2d');
    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, out.width, out.height);
    outCtx.drawImage(canvas, 0, 0);
    return out.toDataURL('image/png');
  }

  saveBtn.addEventListener('click', () => {
    if (!strokes.length) return;
    modal.close(exportDataURL());
  });

  modal.opts.onClose = () => {
    destroyed = true;
    resizeObserver?.disconnect();
  };

  // Ukuran awal dan responsif.
  requestAnimationFrame(() => {
    resizeCanvas();
    updateButtons();
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => resizeCanvas());
      resizeObserver.observe(wrap);
    } else {
      window.addEventListener('resize', resizeCanvas);
    }
  });

  return modal.promise;
}
