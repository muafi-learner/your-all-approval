// Signature setup page (index.html): draw or upload, then save per demo user.
import { CONFIG } from '../config.js';
import { STAMP_LABEL } from '../people.js';
import { getSignature, saveSignature, deleteSignature } from '../signature.js';
import { sha256 } from '../crypto.js';
import { esc, fmtDateTime, fmtKB } from '../format.js';
import { mountShell, onUserChange, toast, openDialog } from '../ui.js';

const INK = '#0a0a0a';
const LINE = 2.5; // pen width in CSS px
const $ = (id) => document.getElementById(id);

let user = mountShell({ active: 'signature' });
onUserChange((u) => { user = u; renderUser(); renderSaved(); });

function renderUser() {
  $('signingAs').textContent = `${user.name} · ${user.title}`;
}

// ---------- Tabs ----------
let mode = 'draw';
const tabs = document.querySelectorAll('[data-tab]');
tabs.forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.tab)));

function setMode(next) {
  mode = next;
  tabs.forEach((btn) => {
    const active = btn.dataset.tab === next;
    btn.setAttribute('aria-selected', String(active));
    btn.classList.toggle('bg-white', active);
    btn.classList.toggle('shadow-sm', active);
    btn.classList.toggle('text-neutral-900', active);
    btn.classList.toggle('text-neutral-500', !active);
  });
  $('panel-draw').classList.toggle('hidden', next !== 'draw');
  $('panel-upload').classList.toggle('hidden', next !== 'upload');
  updateSaveState();
}

// ---------- Draw pad ----------
const canvas = $('padCanvas');
const ctx = canvas.getContext('2d');
const padWrap = $('padWrap');
let strokes = []; // each stroke = [{x, y}], normalised to the pad width
let activeStroke = null;
let cssW = 0;
let cssH = 0;
let rafId = 0;

function resizePad() {
  const rect = padWrap.getBoundingClientRect();
  if (!rect.width || !rect.height) return; // panel hidden
  cssW = rect.width;
  cssH = rect.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
}
new ResizeObserver(resizePad).observe(padWrap);

function applyPen(c, scale) {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.fillStyle = INK;
  c.lineWidth = LINE * scale;
}

// Smooth stroke using quadratic curves through midpoints
function drawStroke(c, points, width) {
  if (!points.length) return;
  const p = points.map((pt) => ({ x: pt.x * width, y: pt.y * width }));
  if (p.length === 1) {
    c.beginPath();
    c.arc(p[0].x, p[0].y, c.lineWidth / 2, 0, Math.PI * 2);
    c.fill();
    return;
  }
  c.beginPath();
  c.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length - 1; i++) {
    c.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
  }
  c.lineTo(p[p.length - 1].x, p[p.length - 1].y);
  c.stroke();
}

function redraw() {
  ctx.clearRect(0, 0, cssW, cssH);
  applyPen(ctx, 1);
  strokes.forEach((s) => drawStroke(ctx, s, cssW));
  const empty = strokes.length === 0;
  $('padPlaceholder').classList.toggle('opacity-0', !empty);
  $('undoBtn').disabled = empty;
  $('clearBtn').disabled = empty;
}

const scheduleRedraw = () => {
  if (rafId) return;
  rafId = requestAnimationFrame(() => { rafId = 0; redraw(); });
};

function toPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.width };
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  activeStroke = [toPoint(e)];
  strokes.push(activeStroke);
  scheduleRedraw();
  updateSaveState();
});

canvas.addEventListener('pointermove', (e) => {
  if (!activeStroke) return;
  const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  const events = coalesced.length ? coalesced : [e];
  for (const ev of events) {
    const pt = toPoint(ev);
    const last = activeStroke[activeStroke.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) * cssW > 0.6) activeStroke.push(pt);
  }
  scheduleRedraw();
});

const endStroke = () => {
  if (!activeStroke) return;
  activeStroke = null;
  scheduleRedraw();
  updateSaveState();
};
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
canvas.addEventListener('lostpointercapture', endStroke);

$('undoBtn').addEventListener('click', () => { strokes.pop(); redraw(); updateSaveState(); });
$('clearBtn').addEventListener('click', () => { strokes = []; redraw(); updateSaveState(); });

// ---------- Image processing ----------
function exportDrawing() {
  const scale = 2; // render at 2x for crisp output
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(cssW * scale));
  c.height = Math.max(1, Math.round(cssH * scale));
  const x = c.getContext('2d');
  applyPen(x, scale);
  strokes.forEach((s) => drawStroke(x, s, cssW * scale));
  return c;
}

// Crop to the visible ink, with a little padding
function trim(src, pad = 8) {
  const w = src.width;
  const h = src.height;
  const d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let minX = w; let minY = h; let maxX = -1; let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d').drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function fitToBounds(src) {
  const s = Math.min(1, CONFIG.SIGNATURE_MAX_W / src.width, CONFIG.SIGNATURE_MAX_H / src.height);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(src.width * s));
  out.height = Math.max(1, Math.round(src.height * s));
  const x = out.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

// Turn paper into transparency and ink into near-black (monochrome)
function removeBackground(x, w, h) {
  const img = x.getImageData(0, 0, w, h);
  const d = img.data;
  const lum = (i) => {
    const a = d[i + 3] / 255;
    return (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * a + 255 * (1 - a);
  };
  let sum = 0; let n = 0;
  for (let i = 0; i < d.length; i += 28) { sum += lum(i); n++; }
  const paper = n ? sum / n : 255;
  const hi = paper * 0.86; // lighter than this → transparent
  const lo = paper * 0.5;  // darker than this → solid ink
  for (let i = 0; i < d.length; i += 4) {
    const L = lum(i);
    const a = L >= hi ? 0 : L <= lo ? 1 : (hi - L) / (hi - lo);
    d[i] = d[i + 1] = d[i + 2] = 10;
    d[i + 3] = Math.round(a * 255);
  }
  x.putImageData(img, 0, 0);
}

// ---------- Upload ----------
const fileInput = $('fileInput');
const dropzone = $('dropzone');
let uploadImg = null;
let uploadResult = null;

fileInput.addEventListener('change', () => {
  handleFile(fileInput.files[0]);
  fileInput.value = '';
});
['dragenter', 'dragover'].forEach((t) => dropzone.addEventListener(t, (e) => {
  e.preventDefault();
  dropzone.classList.add('border-neutral-900', 'bg-neutral-100');
}));
['dragleave', 'drop'].forEach((t) => dropzone.addEventListener(t, (e) => {
  e.preventDefault();
  dropzone.classList.remove('border-neutral-900', 'bg-neutral-100');
}));
dropzone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));
['dragover', 'drop'].forEach((t) => window.addEventListener(t, (e) => e.preventDefault()));

function handleFile(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast('Please use a PNG, JPG or WEBP image.', 'error'); return; }
  if (file.size > CONFIG.SIGNATURE_MAX_UPLOAD) { toast('That image is over 5 MB. Try a smaller one.', 'error'); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { uploadImg = img; URL.revokeObjectURL(url); processUpload(); };
  img.onerror = () => { URL.revokeObjectURL(url); toast("Couldn't read that image.", 'error'); };
  img.src = url;
}

function processUpload() {
  if (!uploadImg) return;
  const s = Math.min(1, 1600 / Math.max(uploadImg.naturalWidth, uploadImg.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(uploadImg.naturalWidth * s));
  c.height = Math.max(1, Math.round(uploadImg.naturalHeight * s));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(uploadImg, 0, 0, c.width, c.height);
  if ($('removeBg').checked) removeBackground(x, c.width, c.height);
  uploadResult = trim(c);
  if (uploadResult) {
    $('uploadPreview').src = uploadResult.toDataURL('image/png');
  } else {
    $('uploadPreview').removeAttribute('src');
    toast('No signature detected. Try turning off "Remove background".', 'error');
  }
  dropzone.classList.add('hidden');
  $('uploadPreviewWrap').classList.remove('hidden');
  updateSaveState();
}

function resetUpload() {
  uploadImg = null;
  uploadResult = null;
  $('uploadPreview').removeAttribute('src');
  dropzone.classList.remove('hidden');
  $('uploadPreviewWrap').classList.add('hidden');
}

$('removeBg').addEventListener('change', processUpload);
$('chooseAnother').addEventListener('click', () => fileInput.click());

// ---------- Save ----------
function updateSaveState() {
  const ready = mode === 'draw' ? strokes.length > 0 : !!uploadResult;
  $('saveBtn').disabled = !ready;
}

const approxBytes = (dataUrl) => {
  const b64 = dataUrl.split(',')[1] || '';
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.round((b64.length * 3) / 4) - pad;
};

$('saveBtn').addEventListener('click', async () => {
  const src = mode === 'draw' ? (strokes.length ? trim(exportDrawing()) : null) : uploadResult;
  if (!src) { toast('Nothing to save yet.', 'error'); return; }

  $('saveBtn').disabled = true;
  const out = fitToBounds(src);
  const dataUrl = out.toDataURL('image/png');
  const record = {
    userId: user.id,
    dataUrl,
    sha256: await sha256(dataUrl),
    width: out.width,
    height: out.height,
    bytes: approxBytes(dataUrl),
    source: mode,
    updatedAt: new Date().toISOString(),
  };

  const existed = !!getSignature(user.id);
  if (!saveSignature(user.id, record)) {
    toast('Browser storage is full or blocked. Not saved.', 'error');
    updateSaveState();
    return;
  }

  if (mode === 'draw') { strokes = []; redraw(); } else { resetUpload(); }
  renderSaved();
  updateSaveState();
  toast(existed ? 'Signature updated' : 'Signature saved. Ready for 1-click approval.');
  $('savedSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---------- Saved signature view ----------
function renderSaved() {
  const rec = getSignature(user.id);
  const has = !!rec;

  $('savedEmpty').classList.toggle('hidden', has);
  $('savedFilled').classList.toggle('hidden', !has);

  const chip = $('statusChip');
  chip.textContent = has ? 'Ready' : 'Not set';
  chip.classList.toggle('bg-neutral-900', has);
  chip.classList.toggle('text-white', has);
  chip.classList.toggle('border-neutral-900', has);
  chip.classList.toggle('text-neutral-500', !has);
  chip.classList.toggle('border-neutral-300', !has);

  $('saveBtnLabel').textContent = has ? 'Replace signature' : 'Save signature';
  if (!has) return;

  $('savedImg').src = rec.dataUrl;
  $('stampLabel').textContent = STAMP_LABEL[user.role] || 'Signed by';
  $('stampName').textContent = user.name;
  $('stampRole').textContent = `${user.title} · ${user.division}`;
  $('stampDate').textContent = fmtDateTime(rec.updatedAt);
  $('metaDims').textContent = `${rec.width} × ${rec.height}`;
  $('metaSize').textContent = fmtKB(rec.bytes);
  $('metaSource').textContent = rec.source === 'upload' ? 'Uploaded' : 'Drawn';
  $('metaHash').textContent = rec.sha256 || 'Unavailable (needs HTTPS)';
  $('metaHash').title = rec.sha256 || '';
}

$('replaceBtn').addEventListener('click', () => {
  $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('deleteBtn').addEventListener('click', async () => {
  const ok = await openDialog({
    title: 'Delete signature?',
    html: `<span class="font-medium text-neutral-900">${esc(user.name)}</span> won't be able to submit or approve documents until a new signature is saved.`,
    confirmLabel: 'Delete',
  });
  if (!ok) return;
  deleteSignature(user.id);
  renderSaved();
  toast('Signature deleted');
});

// ---------- Init ----------
renderUser();
renderSaved();
setMode('draw');
resizePad();
