import { store, PaperPresets } from './state/store.js';
import { bleClient } from './bluetooth/bleClient.js';
import { ViewportManager } from './canvas/viewportManager.js';
import { drawTestPattern } from './generators/testPatterns.js';
import { renderTextToCanvas } from './generators/textRenderer.js';
import { renderCode128, renderQrCode } from './generators/barcode.js';
import { DrawingPad } from './generators/drawingPad.js';
import { $, $$, toast, paintRange, setActive, debounce, loadSettings, saveSettings } from './ui/ui.js';

const DOTS_PER_MM = 8;
const REAL_SIZE_ZOOM = 96 / 25.4 / DOTS_PER_MM; // CSS px per printer dot at physical size
const mobileMQ = window.matchMedia('(max-width: 767px)');
const narrowMQ = window.matchMedia('(max-width: 420px)');

const ALGO_HINTS = {
  atkinson: 'Crisp, high-contrast dots. Great all-rounder for photos on thermal paper.',
  'floyd-steinberg': 'Classic error diffusion. Smooth tones, slightly darker overall.',
  stucki: 'Very fine detail with soft gradients. Best for large, detailed photos.',
  burkes: 'Smooth transitions with less noise than Floyd–Steinberg.',
  'sierra-3': 'Balanced detail and smoothness.',
  'bayer-8': 'Regular cross-hatch pattern. Clean and predictable.',
  'bayer-4': 'Coarse retro pattern reminiscent of old computer graphics.',
  halftone: 'Newspaper-style dot screen. Adjust the dot size below.',
  otsu: 'Automatic black/white threshold. Ideal for text documents and receipts.',
  sobel: 'Extracts edges for a pencil-sketch look. Threshold controls line strength.',
  threshold: 'Pure black/white cut-off. Use the slider to choose the level.',
};

const PAPER_LABELS = {
  A4_STD: { name: 'A4 standard', sub: 'Recommended for A4 sheets', group: 'Sheets' },
  A4_FULL: { name: 'A4 full printhead', sub: 'Edge-to-edge', group: 'Sheets' },
  LETTER: { name: 'US Letter', sub: '8.5 in wide', group: 'Sheets' },
  A5: { name: 'A5 roll', sub: 'Half-width documents', group: 'Rolls' },
  ROLL_105: { name: '105 mm roll', sub: 'Shipping labels', group: 'Rolls' },
  ROLL_80: { name: '80 mm roll', sub: 'Receipts', group: 'Rolls' },
  ROLL_58: { name: '58 mm roll', sub: 'Narrow receipts', group: 'Rolls' },
};

const ADJUST_DEFAULTS = {
  algorithm: 'atkinson',
  brightness: 0,
  contrast: 0,
  gamma: 1,
  thresholdVal: 128,
  halftoneCellSize: 6,
  invert: false,
  sharpen: false,
};

// ==========================================================================
// Settings persistence
// ==========================================================================
const PERSIST_KEYS = [
  'algorithm', 'brightness', 'contrast', 'gamma', 'thresholdVal', 'invert', 'sharpen', 'halftoneCellSize',
  'paperPreset', 'mediaWidthMm', 'printheadDots', 'fixedPageHeightMm', 'isContinuous', 'alignment',
  'feedAfterPrintMm', 'chunkSize', 'chunkDelayMs', 'density', 'copies', 'previewMode', 'activeTab',
];

const saved = loadSettings();
{
  const patch = {};
  for (const k of PERSIST_KEYS) if (k in saved && saved[k] !== null) patch[k] = saved[k];
  if (patch.paperPreset && !PaperPresets[patch.paperPreset]) {
    delete patch.paperPreset;
    delete patch.mediaWidthMm;
    delete patch.printheadDots;
    delete patch.fixedPageHeightMm;
  }
  store.update(patch);
}

const persist = debounce(() => {
  const out = {};
  for (const k of PERSIST_KEYS) out[k] = store.get(k);
  saveSettings(out);
}, 400);

store.subscribe('*', (key) => {
  if (key && PERSIST_KEYS.includes(key)) persist();
});

// ==========================================================================
// Core elements & preview pipeline
// ==========================================================================
const sourceCanvas = $('#sourceCanvas');
const previewCanvas = $('#previewCanvas');
const drawCanvas = $('#drawCanvas');
const stage = $('#stage');
const paper = $('#paper');
const canvasInfo = $('#canvasInfo');
const printPayloadSize = $('#printPayloadSize');

const viewport = new ViewportManager(sourceCanvas, previewCanvas, null);

const mediaDots = () => Math.round((store.get('mediaWidthMm') || 204) * DOTS_PER_MM);
const fmt1 = (v) => String(Math.round(v * 10) / 10);

let renderQueued = false;

/** Coalesces preview re-renders into one per animation frame. */
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    if (!renderQueued) return;
    renderNow();
  });
}

function renderNow() {
  renderQueued = false;
  try {
    viewport.update();
  } catch (err) {
    console.error(err);
    toast(`Preview error: ${err.message}`, { type: 'error' });
    return;
  }
  updateInfo();
  applyZoom();
  schedulePayload();
}

function updateInfo() {
  const w = viewport.latestWidth;
  const h = viewport.latestHeight;
  if (!w) return;
  canvasInfo.textContent = `${fmt1(w / DOTS_PER_MM)} × ${fmt1(h / DOTS_PER_MM)} mm · ${w}×${h} px`;
}

const schedulePayload = debounce(() => {
  const p = viewport.getPrintPayload();
  if (!p || !p.fullJob) {
    printPayloadSize.textContent = '—';
    return;
  }
  const kb = p.fullJob.length / 1024;
  const size = kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`;
  const copies = store.get('copies') || 1;
  const len = `${fmt1(viewport.latestHeight / DOTS_PER_MM)} mm`;
  printPayloadSize.textContent = `${len} · ${size}${copies > 1 ? ` · ×${copies}` : ''}`;
}, 200);

// ==========================================================================
// Theme
// ==========================================================================
function syncThemeColor() {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && color) meta.setAttribute('content', color);
}

$('#btnTheme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('fichero-theme', next);
  } catch {
    /* ignore */
  }
  syncThemeColor();
});

// ==========================================================================
// Inspector panels (sidebar on desktop, bottom sheet on mobile)
// ==========================================================================
const inspector = $('#inspector');
const inspectorBody = $('#inspectorBody');
const itabs = $$('.itab');
let currentPanel = 'content';

const isSheetOpen = () => inspector.dataset.open === 'true';
const openSheet = () => (inspector.dataset.open = 'true');
const closeSheet = () => (inspector.dataset.open = 'false');

function showPanel(name, { open = true, toggle = false } = {}) {
  const mobile = mobileMQ.matches;
  if (mobile && toggle && isSheetOpen() && currentPanel === name) {
    closeSheet();
    return;
  }
  if (currentPanel !== name) inspectorBody.scrollTop = 0;
  currentPanel = name;
  setActive(itabs, (b) => b.dataset.panel === name);
  for (const p of $$('.panel')) p.classList.toggle('active', p.id === `panel-${name}`);
  if (mobile && open) openSheet();
}

itabs.forEach((b) => b.addEventListener('click', () => showPanel(b.dataset.panel, { toggle: true })));

$$('[data-goto]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    showPanel(a.dataset.goto);
  })
);

// Sheet handle: tap or swipe down to close
{
  const handle = $('#sheetHandle');
  let startY = null;
  handle.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointerup', (e) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    startY = null;
    if (dy > 30 || Math.abs(dy) < 8) closeSheet();
  });
  handle.addEventListener('pointercancel', () => (startY = null));
}

// Keep preview area above the mobile dock / sheet
function updateDock() {
  document.documentElement.style.setProperty('--dock-h', mobileMQ.matches ? `${inspector.offsetHeight}px` : '0px');
}
new ResizeObserver(updateDock).observe(inspector);
mobileMQ.addEventListener('change', () => {
  if (!mobileMQ.matches) closeSheet();
  updateDock();
});

// ==========================================================================
// Printer connection
// ==========================================================================
const btnConnect = $('#btnConnect');
const connLabel = $('#connLabel');
const connBattery = $('#connBattery');
const connBatteryVal = $('#connBatteryVal');
const deviceCard = $('#deviceCard');
const btnDeviceConnect = $('#btnDeviceConnect');
let connecting = false;

async function connectPrinter() {
  if (store.get('connected')) return true;
  if (connecting) return false;
  if (!bleClient.isSupported()) {
    toast('Web Bluetooth is not available in this browser. Try Chrome or Edge.', { type: 'error', duration: 6000 });
    showPanel('printer');
    return false;
  }
  connecting = true;
  syncConnectionUI();
  try {
    await bleClient.connect();
    toast(`Connected to ${store.get('deviceName') || 'printer'}`, { type: 'success' });
    return true;
  } catch (err) {
    const msg = err?.message || 'Could not connect to the printer.';
    if (!/cancel/i.test(msg)) toast(msg, { type: 'error', duration: 6000 });
    return false;
  } finally {
    connecting = false;
    syncConnectionUI();
  }
}

function syncConnectionUI() {
  const connected = !!store.get('connected');
  const state = connecting ? 'connecting' : connected ? 'connected' : 'disconnected';
  const name = store.get('deviceName') || 'Fichero 6181';
  const pct = store.get('batteryPercent');
  const hasPct = connected && pct !== null && pct !== undefined;

  // Top bar button
  btnConnect.dataset.state = state;
  connLabel.textContent =
    state === 'connecting' ? 'Connecting…' : connected ? name : narrowMQ.matches ? 'Connect' : 'Connect printer';
  btnConnect.title = connected ? 'Printer settings' : 'Connect via Bluetooth';
  connBattery.hidden = !hasPct;
  if (hasPct) connBatteryVal.textContent = `${pct}%`;

  // Device card
  deviceCard.dataset.state = state;
  $('#deviceName').textContent = connected ? name : state === 'connecting' ? 'Connecting…' : 'No printer connected';

  const problems = [];
  if (store.get('isCoverOpen')) problems.push('cover open');
  if (store.get('isNoPaper')) problems.push('no paper');
  if (store.get('isOverheated')) problems.push('overheated');
  $('#deviceSub').textContent = connected
    ? problems.length
      ? `Attention: ${problems.join(', ')}`
      : store.get('isPrinting')
        ? 'Printing…'
        : 'Ready to print'
    : state === 'connecting'
      ? 'Choose your printer in the browser dialog'
      : 'Turn the printer on and tap Connect';

  btnDeviceConnect.disabled = state === 'connecting';
  btnDeviceConnect.className = connected ? 'btn btn-secondary' : 'btn btn-primary';
  btnDeviceConnect.querySelector('span').textContent = connected ? 'Disconnect' : 'Connect';

  // Status chips
  $('#statusChips').hidden = !connected;
  $('#chipBattery').hidden = !hasPct;
  if (hasPct) $('#chipBatteryVal').textContent = `${pct}%`;
  $('#chipCover').hidden = !store.get('isCoverOpen');
  $('#chipPaper').hidden = !store.get('isNoPaper');
  $('#chipHeat').hidden = !store.get('isOverheated');
  $('#chipCharging').hidden = !store.get('isCharging');

  $('#printerTabDot').hidden = !connected;
}

btnConnect.addEventListener('click', () => {
  if (store.get('connected')) showPanel('printer');
  else connectPrinter();
});

btnDeviceConnect.addEventListener('click', () => {
  if (store.get('connected')) {
    bleClient.disconnect();
    toast('Printer disconnected', { type: 'info' });
  } else {
    connectPrinter();
  }
});

$('#btnDiagnosticStatus').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    await bleClient.refreshStatus();
    toast('Printer status updated', { type: 'success', duration: 2000 });
  } finally {
    btn.disabled = false;
  }
});

$('#btUnsupported').hidden = bleClient.isSupported();
narrowMQ.addEventListener('change', syncConnectionUI);

// ==========================================================================
// Content sources
// ==========================================================================
const sourceTiles = $$('.source-tile');
let activeSource = 'text';

function showCanvas(c) {
  sourceCanvas.width = c.width;
  sourceCanvas.height = c.height;
  sourceCanvas.getContext('2d').drawImage(c, 0, 0);
  render();
}

function cloneCanvas(c) {
  const out = document.createElement('canvas');
  out.width = c.width;
  out.height = c.height;
  out.getContext('2d').drawImage(c, 0, 0);
  return out;
}

function setSource(name) {
  activeSource = name;
  store.set('activeTab', name);
  setActive(sourceTiles, (t) => t.dataset.source === name);
  for (const p of $$('.source-pane')) p.classList.toggle('active', p.id === `src-${name}`);
  setDrawMode(name === 'draw');

  switch (name) {
    case 'image':
      if (imageState.canvas) showCanvas(imageState.canvas);
      break;
    case 'pdf':
      if (pdfState.canvas) showCanvas(pdfState.canvas);
      break;
    case 'text':
      renderText();
      break;
    case 'barcode':
      generateBarcode();
      break;
    case 'draw':
      commitDrawing();
      break;
    case 'test':
      renderTest(testPattern);
      break;
  }
}

/** Re-generates content that depends on the paper width. */
function refreshActiveSource() {
  if (activeSource === 'text') renderText();
  else if (activeSource === 'barcode') generateBarcode();
  else if (activeSource === 'test') renderTest(testPattern);
  else if (activeSource === 'draw') {
    ensureDrawCanvas();
    commitDrawing();
  } else render();
}

sourceTiles.forEach((t) => t.addEventListener('click', () => setSource(t.dataset.source)));

// ---------- Generic file loading (picker, drag & drop, paste) ----------
function loadFile(file) {
  if (!file) return;
  const name = file.name || '';
  if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) {
    loadPdfFile(file);
  } else if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif|svg)$/i.test(name)) {
    loadImageFile(file);
  } else {
    toast('Unsupported file. Use an image or a PDF document.', { type: 'error' });
  }
}

{
  const overlay = $('#dropOverlay');
  let depth = 0;
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    overlay.classList.add('show');
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) overlay.classList.remove('show');
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.classList.remove('show');
    loadFile(e.dataTransfer.files?.[0]);
  });
}

window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) loadImageFile(file, 'Pasted image');
      return;
    }
  }
});

// ---------- Image ----------
const imageState = { canvas: null, name: '', w: 0, h: 0 };
const imageFileInput = $('#imageFileInput');

async function decodeImage(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

async function loadImageFile(file, fallbackName = 'Image') {
  try {
    const img = await decodeImage(file);
    const w = img.width;
    const h = img.height;
    const scale = Math.min(1, 2400 / w); // cap memory use; output is ≤ 1728 dots wide anyway
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    img.close?.();

    Object.assign(imageState, { canvas: c, name: file.name || fallbackName, w, h });
    $('#imageName').textContent = imageState.name;
    $('#imageDims').textContent = `${w} × ${h} px`;
    $('#imageMeta').hidden = false;
    $('#btnPickImage').hidden = true;
    setSource('image');
  } catch {
    toast('Could not open this image.', { type: 'error' });
  }
}

const pickImage = () => imageFileInput.click();
$('#btnPickImage').addEventListener('click', pickImage);
$('#btnReplaceImage').addEventListener('click', pickImage);
imageFileInput.addEventListener('change', (e) => {
  loadFile(e.target.files?.[0]);
  e.target.value = '';
});

// ---------- PDF ----------
const pdfState = { doc: null, page: 1, name: '', canvas: null, busy: false, pending: null };
const pdfFileInput = $('#pdfFileInput');

function initPdfWorker() {
  if (window.pdfjsLib?.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
}

async function loadPdfFile(file) {
  if (!window.pdfjsLib) {
    toast('PDF engine is not loaded. Check your internet connection and reload.', { type: 'error' });
    return;
  }
  try {
    const data = await file.arrayBuffer();
    const doc = await window.pdfjsLib.getDocument({ data }).promise;
    pdfState.doc?.destroy?.();
    Object.assign(pdfState, { doc, page: 1, name: file.name || 'document.pdf', canvas: null });
    $('#pdfName').textContent = pdfState.name;
    $('#pdfMeta').hidden = false;
    $('#btnPickPdf').hidden = true;
    $('#pdfPager').hidden = doc.numPages < 2;
    $('#pdfTotalPages').textContent = doc.numPages;
    activeSource !== 'pdf' && setSource('pdf');
    await renderPdfPage(1);
  } catch (err) {
    toast(`Could not open PDF: ${err.message}`, { type: 'error' });
  }
}

async function renderPdfPage(n) {
  const doc = pdfState.doc;
  if (!doc) return;
  if (pdfState.busy) {
    pdfState.pending = n;
    return;
  }
  pdfState.busy = true;
  try {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: mediaDots() / base.width });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width);
    c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    pdfState.page = n;
    pdfState.canvas = c;
    updatePdfPager();
    if (activeSource === 'pdf') showCanvas(c);
  } catch (err) {
    toast(`PDF render error: ${err.message}`, { type: 'error' });
  } finally {
    pdfState.busy = false;
    if (pdfState.pending !== null) {
      const next = pdfState.pending;
      pdfState.pending = null;
      renderPdfPage(next);
    }
  }
}

function updatePdfPager() {
  const total = pdfState.doc?.numPages || 1;
  $('#pdfCurrentPage').textContent = pdfState.page;
  $('#pdfInfo').textContent = `${total} page${total > 1 ? 's' : ''} · showing page ${pdfState.page}`;
  $('#btnPdfPrev').disabled = pdfState.page <= 1;
  $('#btnPdfNext').disabled = pdfState.page >= total;
}

const pickPdf = () => pdfFileInput.click();
$('#btnPickPdf').addEventListener('click', pickPdf);
$('#btnReplacePdf').addEventListener('click', pickPdf);
pdfFileInput.addEventListener('change', (e) => {
  loadFile(e.target.files?.[0]);
  e.target.value = '';
});
$('#btnPdfPrev').addEventListener('click', () => pdfState.page > 1 && renderPdfPage(pdfState.page - 1));
$('#btnPdfNext').addEventListener('click', () => {
  if (pdfState.doc && pdfState.page < pdfState.doc.numPages) renderPdfPage(pdfState.page + 1);
});

// ---------- Text ----------
const textInput = $('#textInput');
const textFontSize = $('#textFontSize');
const textFont = $('#textFont');
const textBold = $('#textBold');
const textBorder = $('#textBorder');
const textAlignBtns = $$('[data-text-align]');
let textAlign = 'center';

function renderText() {
  sourceCanvas.width = mediaDots();
  renderTextToCanvas(sourceCanvas, {
    text: textInput.value,
    fontSize: parseInt(textFontSize.value, 10) || 32,
    align: textAlign,
    bold: textBold.checked,
    border: textBorder.checked,
    padding: 40,
    fontFamily: textFont.value,
  });
  render();
}

const renderTextDebounced = debounce(renderText, 150);
textInput.addEventListener('input', renderTextDebounced);
textFontSize.addEventListener('input', () => {
  $('#valTextFontSize').textContent = `${textFontSize.value} px`;
  paintRange(textFontSize);
  renderTextDebounced();
});
textFont.addEventListener('change', renderText);
textBold.addEventListener('change', renderText);
textBorder.addEventListener('change', renderText);
textAlignBtns.forEach((b) =>
  b.addEventListener('click', () => {
    textAlign = b.dataset.textAlign;
    setActive(textAlignBtns, (x) => x === b);
    renderText();
  })
);

// ---------- Barcode / QR ----------
const barcodeValue = $('#barcodeValue');
const qrSize = $('#qrSize');
const barModule = $('#barModule');
const barHeight = $('#barHeight');
const qrCaption = $('#qrCaption');
const codeHint = $('#codeHint');
const codeTypeBtns = $$('[data-code-type]');
let codeType = 'qr';
let barcodeJob = 0;

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function showCodeHint(msg) {
  codeHint.hidden = !msg;
  codeHint.textContent = msg || '';
}

async function generateBarcode() {
  const job = ++barcodeJob;
  const value = barcodeValue.value.trim();
  const W = mediaDots();
  const tmp = document.createElement('canvas');
  showCodeHint('');

  if (!value) {
    sourceCanvas.width = W;
    sourceCanvas.height = 160;
    const ctx = sourceCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, 160);
    showCodeHint('Enter some content to generate a code.');
    render();
    return;
  }

  if (codeType === 'qr') {
    const size = Math.min(W - 32, Math.round(parseInt(qrSize.value, 10) * DOTS_PER_MM));
    await renderQrCode(tmp, value, size);
    if (job !== barcodeJob) return; // a newer request superseded this one

    const pad = 32;
    const capH = qrCaption.checked ? 80 : 0;
    sourceCanvas.width = W;
    sourceCanvas.height = size + pad * 2 + capH;
    const ctx = sourceCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, sourceCanvas.height);
    ctx.drawImage(tmp, Math.round((W - size) / 2), pad, size, size);
    if (capH) {
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 34px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitText(ctx, value, W - 80), W / 2, pad + size + capH / 2);
    }
  } else {
    if (/[^\x20-\x7e]/.test(value)) {
      showCodeHint('Code 128 supports basic ASCII only — other characters are skipped.');
    }
    renderCode128(tmp, value, parseInt(barModule.value, 10), Math.round(parseInt(barHeight.value, 10) * DOTS_PER_MM));
    let w = tmp.width;
    let h = tmp.height;
    if (w > W) {
      const s = W / w;
      w = W;
      h = Math.round(h * s);
      showCodeHint('The barcode is wider than the paper and was scaled down. Reduce the bar width or shorten the content.');
    }
    sourceCanvas.width = W;
    sourceCanvas.height = h + 40;
    const ctx = sourceCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, sourceCanvas.height);
    ctx.drawImage(tmp, Math.round((W - w) / 2), 20, w, h);
  }
  render();
}

const generateBarcodeDebounced = debounce(generateBarcode, 200);
barcodeValue.addEventListener('input', generateBarcodeDebounced);
qrCaption.addEventListener('change', generateBarcode);

for (const [input, out, unit] of [
  [qrSize, '#valQrSize', 'mm'],
  [barModule, '#valBarModule', 'dots'],
  [barHeight, '#valBarHeight', 'mm'],
]) {
  input.addEventListener('input', () => {
    $(out).textContent = `${input.value} ${unit}`;
    paintRange(input);
    generateBarcodeDebounced();
  });
}

codeTypeBtns.forEach((b) =>
  b.addEventListener('click', () => {
    codeType = b.dataset.codeType;
    setActive(codeTypeBtns, (x) => x === b);
    for (const el of $$('[data-code-only]')) el.hidden = el.dataset.codeOnly !== codeType;
    generateBarcode();
  })
);

// ---------- Draw ----------
const drawPad = new DrawingPad(drawCanvas, () => {
  commitDrawing();
  updateUndoBtn();
});
const drawHeightBtns = $$('[data-draw-h]');
const btnUndoDrawing = $('#btnUndoDrawing');
let drawHeightMm = 100;
let drawInitialized = false;

function ensureDrawCanvas() {
  const W = mediaDots();
  const H = drawHeightMm * DOTS_PER_MM;
  if (!drawInitialized) {
    drawCanvas.width = W;
    drawCanvas.height = H;
    const ctx = drawCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    drawInitialized = true;
  } else {
    drawPad.resize(W, H);
  }
  updateUndoBtn();
}

function commitDrawing() {
  if (activeSource !== 'draw') return;
  showCanvas(drawCanvas);
}

function updateUndoBtn() {
  btnUndoDrawing.disabled = !drawPad.canUndo();
}

function setDrawMode(on) {
  drawPad.enabled = on;
  drawCanvas.hidden = !on;
  previewCanvas.hidden = on;
  $('#drawBadge').hidden = !on;
  $('#previewModeSeg').hidden = on;
  if (on) ensureDrawCanvas();
  applyZoom();
}

$('#drawLineWidth').addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  drawPad.setLineWidth(v);
  $('#valDrawLineWidth').textContent = `${v} px`;
  paintRange(e.target);
});
btnUndoDrawing.addEventListener('click', () => {
  drawPad.undo();
  updateUndoBtn();
});
$('#btnClearDrawing').addEventListener('click', () => {
  drawPad.clear();
  updateUndoBtn();
});
drawHeightBtns.forEach((b) =>
  b.addEventListener('click', () => {
    drawHeightMm = parseInt(b.dataset.drawH, 10);
    setActive(drawHeightBtns, (x) => x === b);
    ensureDrawCanvas();
    commitDrawing();
  })
);

// ---------- Test patterns ----------
const testBtns = $$('[data-test]');
let testPattern = 'band-1cm';

function renderTest(pattern) {
  testPattern = pattern;
  setActive(testBtns, (b) => b.dataset.test === pattern);
  sourceCanvas.width = mediaDots();
  sourceCanvas.height = pattern === 'band-1cm' ? 340 : 600;
  drawTestPattern(sourceCanvas, pattern);
  render();
}

testBtns.forEach((b) => b.addEventListener('click', () => renderTest(b.dataset.test)));

// ==========================================================================
// Adjustments
// ==========================================================================
const rangeSyncs = [];

function bindRange(id, outId, key, format, after = render) {
  const input = $(`#${id}`);
  const out = $(`#${outId}`);
  const sync = () => {
    input.value = store.get(key);
    out.textContent = format(parseFloat(input.value));
    paintRange(input);
  };
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    store.set(key, v);
    out.textContent = format(v);
    paintRange(input);
    after?.();
  });
  input.addEventListener('dblclick', () => {
    if (input.dataset.default === undefined) return;
    input.value = input.dataset.default;
    input.dispatchEvent(new Event('input'));
  });
  rangeSyncs.push(sync);
  sync();
}

const signed = (v) => (v > 0 ? `+${v}` : String(v));
bindRange('rangeBrightness', 'valBrightness', 'brightness', signed);
bindRange('rangeContrast', 'valContrast', 'contrast', signed);
bindRange('rangeGamma', 'valGamma', 'gamma', (v) => v.toFixed(1));
bindRange('rangeThreshold', 'valThreshold', 'thresholdVal', String);
bindRange('rangeHalftone', 'valHalftone', 'halftoneCellSize', (v) => `${v} px`);
bindRange('rangeFeedAfter', 'valFeedAfter', 'feedAfterPrintMm', (v) => `${v} mm`, schedulePayload);
bindRange('rangeChunkDelay', 'valChunkDelay', 'chunkDelayMs', (v) => `${v} ms`, null);

const selectAlgorithm = $('#selectAlgorithm');
const styleChips = $$('[data-style]');

function syncAlgorithmUI() {
  const alg = store.get('algorithm');
  selectAlgorithm.value = alg;
  $('#groupThreshold').hidden = !(alg === 'threshold' || alg === 'sobel');
  $('#groupHalftone').hidden = alg !== 'halftone';
  $('#algoHint').textContent = ALGO_HINTS[alg] || '';
  setActive(styleChips, (c) => c.dataset.style === alg);
}

function setAlgorithm(alg) {
  store.set('algorithm', alg);
  syncAlgorithmUI();
  render();
}

selectAlgorithm.addEventListener('change', (e) => setAlgorithm(e.target.value));
styleChips.forEach((c) => c.addEventListener('click', () => setAlgorithm(c.dataset.style)));

const switchInvert = $('#switchInvert');
const switchSharpen = $('#switchSharpen');
switchInvert.addEventListener('change', (e) => {
  store.set('invert', e.target.checked);
  render();
});
switchSharpen.addEventListener('change', (e) => {
  store.set('sharpen', e.target.checked);
  render();
});

$('#btnResetAdjust').addEventListener('click', () => {
  store.update(ADJUST_DEFAULTS);
  syncAdjustUI();
  render();
  toast('Adjustments reset', { type: 'info', duration: 1800 });
});

function syncAdjustUI() {
  rangeSyncs.forEach((s) => s());
  syncAlgorithmUI();
  switchInvert.checked = !!store.get('invert');
  switchSharpen.checked = !!store.get('sharpen');
}

$('#btnRotate').addEventListener('click', () => {
  if (activeSource === 'draw') {
    toast('Rotation is not available while drawing.', { type: 'info' });
    return;
  }
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const tmp = cloneCanvas(sourceCanvas);
  sourceCanvas.width = h;
  sourceCanvas.height = w;
  const ctx = sourceCanvas.getContext('2d');
  ctx.save();
  ctx.translate(h / 2, w / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(tmp, -w / 2, -h / 2);
  ctx.restore();

  if (activeSource === 'image' && imageState.canvas) imageState.canvas = cloneCanvas(sourceCanvas);
  if (activeSource === 'pdf' && pdfState.canvas) pdfState.canvas = cloneCanvas(sourceCanvas);
  render();
});

// ==========================================================================
// Paper
// ==========================================================================
const paperList = $('#paperPresetList');

function buildPaperList() {
  let group = null;
  for (const [key, p] of Object.entries(PaperPresets)) {
    const meta = PAPER_LABELS[key] || { name: p.name, sub: '', group: 'Other' };
    if (meta.group !== group) {
      group = meta.group;
      const label = document.createElement('div');
      label.className = 'option-group-label';
      label.textContent = group;
      paperList.appendChild(label);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option';
    btn.dataset.preset = key;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', 'false');
    btn.innerHTML = `
      <span class="radio-dot" aria-hidden="true"></span>
      <span class="option-text"><strong></strong><span></span></span>
      <span class="option-meta">${p.widthMm} mm</span>`;
    btn.querySelector('strong').textContent = meta.name;
    btn.querySelector('.option-text span').textContent = meta.sub;
    btn.addEventListener('click', () => selectPaper(key));
    paperList.appendChild(btn);
  }
}

function selectPaper(key) {
  const p = PaperPresets[key];
  if (!p) return;
  store.update({
    paperPreset: key,
    mediaWidthMm: p.widthMm,
    printheadDots: p.dots,
    fixedPageHeightMm: p.fullPageH,
  });
  syncPaperUI();
  refreshActiveSource();
}

const lengthBtns = $$('[data-mode]');
const alignBtns = $$('[data-align]');

function syncPaperUI() {
  setActive($$('[data-preset]'), (b) => b.dataset.preset === store.get('paperPreset'));
  const continuous = !!store.get('isContinuous');
  setActive(lengthBtns, (b) => (b.dataset.mode === 'continuous') === continuous);
  $('#fixedPageLabel').textContent = `${store.get('fixedPageHeightMm')} mm`;
  setActive(alignBtns, (b) => b.dataset.align === store.get('alignment'));
  paper.classList.toggle('roll', continuous);
}

lengthBtns.forEach((b) =>
  b.addEventListener('click', () => {
    store.set('isContinuous', b.dataset.mode === 'continuous');
    syncPaperUI();
    render();
  })
);

alignBtns.forEach((b) =>
  b.addEventListener('click', () => {
    store.set('alignment', b.dataset.align);
    syncPaperUI();
    schedulePayload();
  })
);

// ==========================================================================
// Printer settings, feed & copies
// ==========================================================================
const densityBtns = $$('[data-density]');
densityBtns.forEach((b) =>
  b.addEventListener('click', () => {
    store.set('density', parseInt(b.dataset.density, 10));
    setActive(densityBtns, (x) => x === b);
  })
);

const selectChunkSize = $('#selectChunkSize');
selectChunkSize.addEventListener('change', (e) => store.set('chunkSize', parseInt(e.target.value, 10)));

$$('[data-feed]').forEach((btn) =>
  btn.addEventListener('click', async () => {
    if (!store.get('connected')) {
      toast('Connect the printer first.', { type: 'warn' });
      return;
    }
    btn.disabled = true;
    try {
      await bleClient.feedPaper(parseInt(btn.dataset.feed, 10));
    } catch (err) {
      toast(`Feed error: ${err.message}`, { type: 'error' });
    } finally {
      btn.disabled = false;
    }
  })
);

const copiesInput = $('#copiesInput');
const btnCopiesDec = $('#btnCopiesDec');
const btnCopiesInc = $('#btnCopiesInc');

function setCopies(n) {
  const v = Math.min(99, Math.max(1, parseInt(n, 10) || 1));
  store.set('copies', v);
  copiesInput.value = v;
  btnCopiesDec.disabled = v <= 1;
  btnCopiesInc.disabled = v >= 99;
  schedulePayload();
}

btnCopiesDec.addEventListener('click', () => setCopies((store.get('copies') || 1) - 1));
btnCopiesInc.addEventListener('click', () => setCopies((store.get('copies') || 1) + 1));
copiesInput.addEventListener('change', () => setCopies(copiesInput.value));
copiesInput.addEventListener('focus', () => copiesInput.select());

function syncPrinterUI() {
  setActive(densityBtns, (b) => parseInt(b.dataset.density, 10) === store.get('density'));
  selectChunkSize.value = String(store.get('chunkSize'));
  setCopies(store.get('copies'));
}

// ==========================================================================
// Preview mode & zoom
// ==========================================================================
const prevBtns = $$('[data-prev]');
prevBtns.forEach((b) =>
  b.addEventListener('click', () => {
    store.set('previewMode', b.dataset.prev);
    setActive(prevBtns, (x) => x === b);
    render();
  })
);

const zoomLabel = $('#zoomLabel');
const btnZoomFit = $('#btnZoomFit');
const btnZoomReal = $('#btnZoomReal');
let zoom = 'fit';

const baseWidth = () => (activeSource === 'draw' ? drawCanvas.width : viewport.latestWidth || previewCanvas.width);
const currentScale = () => {
  const bw = baseWidth();
  return bw ? paper.getBoundingClientRect().width / bw : 1;
};
const numericZoom = () => (zoom === 'fit' ? currentScale() : zoom);

function setZoom(z) {
  zoom = z === 'fit' ? 'fit' : Math.min(4, Math.max(0.05, z));
  applyZoom();
}

function applyZoom() {
  const fit = zoom === 'fit';
  stage.classList.toggle('fit', fit);
  paper.style.width = fit ? '' : `${Math.round(baseWidth() * zoom)}px`;
  zoomLabel.textContent = fit ? 'Fit' : `${Math.round(zoom * 100)}%`;
  zoomLabel.title = fit ? 'Show at 100%' : 'Fit to width';
  btnZoomFit.classList.toggle('active', fit);
  btnZoomReal.classList.toggle('active', !fit && Math.abs(zoom - REAL_SIZE_ZOOM) < 0.005);
}

$('#btnZoomIn').addEventListener('click', () => setZoom(numericZoom() * 1.25));
$('#btnZoomOut').addEventListener('click', () => setZoom(numericZoom() / 1.25));
zoomLabel.addEventListener('click', () => setZoom(zoom === 'fit' ? 1 : 'fit'));
btnZoomFit.addEventListener('click', () => setZoom('fit'));
btnZoomReal.addEventListener('click', () => setZoom(REAL_SIZE_ZOOM));

// Ctrl / ⌘ + wheel zoom
stage.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(numericZoom() * Math.exp(-e.deltaY * 0.002));
  },
  { passive: false }
);

// Pinch-to-zoom on touch screens
{
  let pinch = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  stage.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 2 && activeSource !== 'draw') {
        pinch = { d: dist(e.touches), z: numericZoom() };
      }
    },
    { passive: true }
  );
  stage.addEventListener(
    'touchmove',
    (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      setZoom((pinch.z * dist(e.touches)) / pinch.d);
    },
    { passive: false }
  );
  stage.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinch = null;
  });
}

// Tapping the preview closes the mobile sheet
stage.addEventListener('click', () => {
  if (mobileMQ.matches && isSheetOpen() && activeSource !== 'draw') closeSheet();
});

// ==========================================================================
// Printing
// ==========================================================================
const printModal = $('#printModal');
const modalCard = printModal.querySelector('.modal-card');
const printProgressBar = $('#printProgressBar');
const printProgressPercent = $('#printProgressPercent');
const printStatusText = $('#printStatusText');
const printModalTitle = $('#printModalTitle');
const btnCancelPrint = $('#btnCancelPrint');
const btnPrint = $('#btnPrint');
let printing = false;
let modalCloseTimer = null;

function setProgress(pct, text) {
  printProgressBar.style.width = `${pct}%`;
  printProgressPercent.textContent = `${pct}%`;
  if (text) printStatusText.textContent = text;
}

function openPrintModal() {
  clearTimeout(modalCloseTimer);
  modalCard.dataset.state = 'sending';
  printModalTitle.textContent = 'Sending to printer…';
  btnCancelPrint.textContent = 'Cancel';
  setProgress(0, 'Preparing raster data…');
  printModal.hidden = false;
  btnCancelPrint.focus();
}

function closePrintModal() {
  clearTimeout(modalCloseTimer);
  printModal.hidden = true;
}

async function doPrint() {
  if (printing) return;
  if (!store.get('connected')) {
    const ok = await connectPrinter();
    if (!ok) return;
  }

  renderNow(); // flush any pending preview update
  const payload = viewport.getPrintPayload();
  if (!payload?.fullJob?.length) {
    toast('Nothing to print yet.', { type: 'warn' });
    return;
  }

  printing = true;
  btnPrint.disabled = true;
  openPrintModal();

  try {
    await bleClient.executePrint(payload.fullJob, (p) => setProgress(p.percent, p.statusText));
    modalCard.dataset.state = 'done';
    printModalTitle.textContent = 'Printed!';
    const copies = store.get('copies') || 1;
    setProgress(100, copies > 1 ? `${copies} copies sent to the printer.` : 'Your print is ready.');
    btnCancelPrint.textContent = 'Close';
    window.confetti?.({ particleCount: 80, spread: 70, origin: { y: 0.65 } });
    modalCloseTimer = setTimeout(closePrintModal, 1800);
  } catch (err) {
    const msg = err?.message || 'Print job aborted';
    if (/cancel/i.test(msg)) {
      closePrintModal();
      toast('Print cancelled', { type: 'info' });
    } else {
      modalCard.dataset.state = 'error';
      printModalTitle.textContent = 'Print failed';
      printStatusText.textContent = msg;
      btnCancelPrint.textContent = 'Close';
    }
  } finally {
    printing = false;
    btnPrint.disabled = false;
  }
}

btnPrint.addEventListener('click', doPrint);
btnCancelPrint.addEventListener('click', () => {
  if (printing) bleClient.cancelPrint();
  else closePrintModal();
});

// ==========================================================================
// Keyboard shortcuts
// ==========================================================================
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    doPrint();
    return;
  }
  if (e.key === 'Escape') {
    if (!printModal.hidden && !printing) closePrintModal();
    else if (isSheetOpen()) closeSheet();
  }
});

// ==========================================================================
// Store subscriptions & init
// ==========================================================================
for (const key of ['connected', 'deviceName', 'batteryPercent', 'isCoverOpen', 'isNoPaper', 'isOverheated', 'isCharging', 'isPrinting']) {
  store.subscribe(key, syncConnectionUI);
}

function init() {
  initPdfWorker();
  buildPaperList();
  syncAdjustUI();
  syncPaperUI();
  syncPrinterUI();
  setActive(prevBtns, (b) => b.dataset.prev === store.get('previewMode'));

  // Paint static sliders (text, barcode, draw)
  for (const r of $$('input[type="range"]')) paintRange(r);

  const last = saved.activeTab;
  setSource(['text', 'barcode', 'draw', 'test'].includes(last) ? last : 'text');
  showPanel('content', { open: false });
  syncThemeColor();
  updateDock();
}

init();
