import { store, PaperPresets } from './state/store.js';
import { bleClient } from './bluetooth/bleClient.js';
import { ViewportManager } from './canvas/viewportManager.js';
import { drawTestPattern } from './generators/testPatterns.js';
import { renderTextToCanvas } from './generators/textRenderer.js';
import { renderCode128, renderQrCode } from './generators/barcode.js';
import { DrawingPad } from './generators/drawingPad.js';

// DOM Element References
const sourceCanvas = document.getElementById('sourceCanvas');
const previewCanvas = document.getElementById('previewCanvas');
const canvasInfo = document.getElementById('canvasInfo');
const previewViewport = document.getElementById('previewViewport');

const btnConnect = document.getElementById('btnConnect');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const batteryBadge = document.getElementById('batteryBadge');
const batteryVal = document.getElementById('batteryVal');

const btnPrint = document.getElementById('btnPrint');
const printPayloadSize = document.getElementById('printPayloadSize');
const printModal = document.getElementById('printModal');
const printProgressBar = document.getElementById('printProgressBar');
const printProgressPercent = document.getElementById('printProgressPercent');
const printStatusText = document.getElementById('printStatusText');
const btnCancelPrint = document.getElementById('btnCancelPrint');

const btnOpenManual = document.getElementById('btnOpenManual');
const manualModal = document.getElementById('manualModal');

// Create Viewport Manager
const viewport = new ViewportManager(sourceCanvas, previewCanvas, canvasInfo);

// Initialize Drawing Pad
const drawPad = new DrawingPad(previewCanvas, () => {
  // If drawing tab active, copy from preview to source and update
  if (store.get('activeTab') === 'draw') {
    const sCtx = sourceCanvas.getContext('2d');
    sourceCanvas.width = previewCanvas.width;
    sourceCanvas.height = previewCanvas.height;
    sCtx.drawImage(previewCanvas, 0, 0);
  }
});

// PDF State
let currentPdf = null;
let currentPdfPage = 1;

// --- Initialize Default Content (1.0 cm Calibration Test) ---
function loadDefaultContent() {
  sourceCanvas.width = 1632;
  sourceCanvas.height = 340;
  drawTestPattern(sourceCanvas, 'band-1cm');
  viewport.update();
  updatePayloadSize();
}

function updatePayloadSize() {
  const payload = viewport.getPrintPayload();
  if (payload) {
    printPayloadSize.textContent = `Rozmiar: ${Math.round(payload.fullJob.length / 1024)} KB (${payload.totalFeedMm} mm wysuwu)`;
  }
}

// --- Bluetooth Connection Handlers ---
btnConnect.addEventListener('click', async () => {
  if (store.get('connected')) {
    bleClient.disconnect();
    return;
  }

  btnConnect.disabled = true;
  btnConnect.innerHTML = '<span>⏳ Łączenie z BLE...</span>';

  try {
    await bleClient.connect();
  } catch (err) {
    alert(err.message || 'Nie udało się połączyć z urządzeniem Bluetooth.');
  } finally {
    btnConnect.disabled = false;
  }
});

// Sync Bluetooth Store with Header UI
store.subscribe('connected', (connected) => {
  if (connected) {
    statusDot.classList.add('connected');
    statusText.textContent = store.get('deviceName') || 'Połączono';
    btnConnect.className = 'btn btn-secondary';
    btnConnect.innerHTML = '<span>🔌 Rozłącz</span>';
  } else {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Rozłączono';
    btnConnect.className = 'btn btn-primary';
    btnConnect.innerHTML = '<span>📡 Połącz z Drukarką (BT)</span>';
    batteryBadge.style.display = 'none';
  }
});

store.subscribe('batteryPercent', (pct) => {
  if (pct !== null && pct !== undefined && store.get('connected')) {
    batteryBadge.style.display = 'flex';
    batteryVal.textContent = `${pct}%`;
  }
});

// --- Tab Switching ---
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

    btn.classList.add('active');
    const tabName = btn.dataset.tab;
    document.getElementById(`tab-${tabName}`).classList.add('active');
    store.set('activeTab', tabName);

    // Specific tab activations
    if (tabName === 'text') {
      renderTextInput();
    } else if (tabName === 'test') {
      // test tab
    }
  });
});

// --- Tab 1: Image File Upload & Clipboard Paste ---
const imageFileInput = document.getElementById('imageFileInput');
imageFileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      sourceCanvas.width = img.width;
      sourceCanvas.height = img.height;
      const ctx = sourceCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      viewport.update();
      updatePayloadSize();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// Paste from Clipboard (Ctrl+V)
window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          sourceCanvas.width = img.width;
          sourceCanvas.height = img.height;
          const ctx = sourceCanvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          viewport.update();
          updatePayloadSize();
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(blob);
      break;
    }
  }
});

// --- Tab 2: PDF Document Loading ---
const pdfFileInput = document.getElementById('pdfFileInput');
const pdfControls = document.getElementById('pdfControls');
const pdfCurrentPage = document.getElementById('pdfCurrentPage');
const pdfTotalPages = document.getElementById('pdfTotalPages');
const btnPdfPrev = document.getElementById('btnPdfPrev');
const btnPdfNext = document.getElementById('btnPdfNext');

pdfFileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file || typeof window.pdfjsLib === 'undefined') return;

  try {
    const arrayBuffer = await file.arrayBuffer();
    currentPdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    currentPdfPage = 1;

    pdfControls.style.display = 'flex';
    pdfTotalPages.textContent = currentPdf.numPages;
    await renderPdfPage(currentPdfPage);
  } catch (err) {
    alert('Błąd odczytu pliku PDF: ' + err.message);
  }
});

async function renderPdfPage(pageNumber) {
  if (!currentPdf) return;
  const page = await currentPdf.getPage(pageNumber);
  const targetWidth = store.get('printheadDots') || 1632;
  const unscaledViewport = page.getViewport({ scale: 1 });
  const scale = targetWidth / unscaledViewport.width;
  const vp = page.getViewport({ scale });

  sourceCanvas.width = Math.round(vp.width);
  sourceCanvas.height = Math.round(vp.height);
  const ctx = sourceCanvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);

  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  pdfCurrentPage.textContent = pageNumber;
  viewport.update();
  updatePayloadSize();
}

btnPdfPrev.addEventListener('click', () => {
  if (currentPdf && currentPdfPage > 1) {
    currentPdfPage--;
    renderPdfPage(currentPdfPage);
  }
});

btnPdfNext.addEventListener('click', () => {
  if (currentPdf && currentPdfPage < currentPdf.numPages) {
    currentPdfPage++;
    renderPdfPage(currentPdfPage);
  }
});

// --- Tab 3: Text / Label Editor ---
const textInput = document.getElementById('textInput');
const textFontSize = document.getElementById('textFontSize');
const textBold = document.getElementById('textBold');
const textBorder = document.getElementById('textBorder');
const textAlign = document.getElementById('textAlign');
const btnUpdateText = document.getElementById('btnUpdateText');

function renderTextInput() {
  sourceCanvas.width = store.get('printheadDots') || 1632;
  renderTextToCanvas(sourceCanvas, {
    text: textInput.value,
    fontSize: parseInt(textFontSize.value, 10) || 32,
    align: textAlign.value,
    bold: textBold.checked,
    border: textBorder.checked,
    padding: 40,
  });
  viewport.update();
  updatePayloadSize();
}

btnUpdateText.addEventListener('click', renderTextInput);
textInput.addEventListener('input', () => {
  clearTimeout(textInput._t);
  textInput._t = setTimeout(renderTextInput, 300);
});

// --- Tab 4: Barcode & QR Code ---
const barcodeType = document.getElementById('barcodeType');
const barcodeValue = document.getElementById('barcodeValue');
const btnGenerateBarcode = document.getElementById('btnGenerateBarcode');

async function generateBarcode() {
  const val = barcodeValue.value.trim() || '12345678';
  if (barcodeType.value === 'code128') {
    renderCode128(sourceCanvas, val, 4, 140);
  } else {
    await renderQrCode(sourceCanvas, val, 600);
  }
  viewport.update();
  updatePayloadSize();
}

btnGenerateBarcode.addEventListener('click', generateBarcode);

// --- Tab 5: Drawing Pad Clear ---
document.getElementById('btnClearDrawing').addEventListener('click', () => {
  drawPad.clear();
});
document.getElementById('drawLineWidth').addEventListener('input', (e) => {
  drawPad.setLineWidth(parseInt(e.target.value, 10));
});

// --- Tab 6: Calibration Test Patterns ---
document.querySelectorAll('[data-test]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const testPattern = btn.dataset.test;
    sourceCanvas.width = store.get('printheadDots') || 1632;
    sourceCanvas.height = testPattern === 'band-1cm' ? 340 : 600;
    drawTestPattern(sourceCanvas, testPattern);
    viewport.update();
    updatePayloadSize();
  });
});

// --- Dithering Algorithm & Filter Sliders ---
const selectAlgorithm = document.getElementById('selectAlgorithm');
const rangeBrightness = document.getElementById('rangeBrightness');
const valBrightness = document.getElementById('valBrightness');
const rangeContrast = document.getElementById('rangeContrast');
const valContrast = document.getElementById('valContrast');
const rangeGamma = document.getElementById('rangeGamma');
const valGamma = document.getElementById('valGamma');
const rangeThreshold = document.getElementById('rangeThreshold');
const valThreshold = document.getElementById('valThreshold');
const groupThreshold = document.getElementById('groupThreshold');
const rangeHalftone = document.getElementById('rangeHalftone');
const valHalftone = document.getElementById('valHalftone');
const groupHalftone = document.getElementById('groupHalftone');
const switchInvert = document.getElementById('switchInvert');
const switchSharpen = document.getElementById('switchSharpen');
const btnRotate = document.getElementById('btnRotate');

selectAlgorithm.addEventListener('change', (e) => {
  const alg = e.target.value;
  store.set('algorithm', alg);
  groupThreshold.style.display = alg === 'threshold' || alg === 'sobel' ? 'flex' : 'none';
  groupHalftone.style.display = alg === 'halftone' ? 'flex' : 'none';
  viewport.update();
  updatePayloadSize();
});

rangeBrightness.addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  valBrightness.textContent = v;
  store.set('brightness', v);
  viewport.update();
});

rangeContrast.addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  valContrast.textContent = v;
  store.set('contrast', v);
  viewport.update();
});

rangeGamma.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  valGamma.textContent = v.toFixed(1);
  store.set('gamma', v);
  viewport.update();
});

rangeThreshold.addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  valThreshold.textContent = v;
  store.set('thresholdVal', v);
  viewport.update();
});

rangeHalftone.addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  valHalftone.textContent = v;
  store.set('halftoneCellSize', v);
  viewport.update();
});

switchInvert.addEventListener('change', (e) => {
  store.set('invert', e.target.checked);
  viewport.update();
});

switchSharpen.addEventListener('change', (e) => {
  store.set('sharpen', e.target.checked);
  viewport.update();
});

btnRotate.addEventListener('click', () => {
  // Rotate source canvas by 90 degrees
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  tmp.getContext('2d').drawImage(sourceCanvas, 0, 0);

  sourceCanvas.width = h;
  sourceCanvas.height = w;
  const sCtx = sourceCanvas.getContext('2d');
  sCtx.save();
  sCtx.translate(h / 2, w / 2);
  sCtx.rotate(Math.PI / 2);
  sCtx.drawImage(tmp, -w / 2, -h / 2);
  sCtx.restore();

  viewport.update();
  updatePayloadSize();
});

// --- Working Area & Paper Controls ---
const selectPaperPreset = document.getElementById('selectPaperPreset');
selectPaperPreset.addEventListener('change', (e) => {
  const presetKey = e.target.value;
  const p = PaperPresets[presetKey];
  if (p) {
    store.update({
      paperPreset: presetKey,
      mediaWidthMm: p.widthMm,
      printheadDots: p.dots,
      fixedPageHeightMm: p.fullPageH,
    });
    viewport.update();
    updatePayloadSize();
  }
});

// Continuous Roll vs Fixed Page
document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    store.set('isContinuous', btn.dataset.mode === 'continuous');
    viewport.update();
    updatePayloadSize();
  });
});

// Alignment
document.querySelectorAll('[data-align]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-align]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    store.set('alignment', btn.dataset.align);
    viewport.update();
    updatePayloadSize();
  });
});

const rangeFeedAfter = document.getElementById('rangeFeedAfter');
const valFeedAfter = document.getElementById('valFeedAfter');
rangeFeedAfter.addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  valFeedAfter.textContent = v;
  store.set('feedAfterPrintMm', v);
  updatePayloadSize();
});

// --- BLE Pacing & Density Controls ---
document.querySelectorAll('[data-density]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-density]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    store.set('density', parseInt(btn.dataset.density, 10));
  });
});

const selectChunkSize = document.getElementById('selectChunkSize');
selectChunkSize.addEventListener('change', (e) => {
  store.set('chunkSize', parseInt(e.target.value, 10));
});

const rangeChunkDelay = document.getElementById('rangeChunkDelay');
const valChunkDelay = document.getElementById('valChunkDelay');
rangeChunkDelay.addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  valChunkDelay.textContent = `${v} ms`;
  store.set('chunkDelayMs', v);
});

document.getElementById('copiesInput').addEventListener('input', (e) => {
  store.set('copies', Math.max(1, parseInt(e.target.value, 10) || 1));
});

// --- Preview Viewport Modes & Zoom ---
document.querySelectorAll('[data-prev]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-prev]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    store.set('previewMode', btn.dataset.prev);
    viewport.update();
  });
});

document.querySelectorAll('[data-zoom]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-zoom]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    previewViewport.className = `preview-viewport zoom-${btn.dataset.zoom}`;
  });
});

// --- Print Execution Modal ---
btnPrint.addEventListener('click', async () => {
  if (!store.get('connected')) {
    // Try auto-connect if not connected
    try {
      await bleClient.connect();
    } catch {
      alert('Aby drukować, najpierw połącz się z drukarką (przycisk u góry)!');
      return;
    }
  }

  const payload = viewport.getPrintPayload();
  if (!payload || !payload.fullJob || payload.fullJob.length === 0) {
    alert('Brak danych do wydruku!');
    return;
  }

  printModal.classList.add('open');
  printProgressBar.style.width = '0%';
  printProgressPercent.textContent = '0%';
  printStatusText.textContent = 'Rozpoczynanie wydruku...';

  try {
    await bleClient.executePrint(payload.fullJob, (p) => {
      printProgressBar.style.width = `${p.percent}%`;
      printProgressPercent.textContent = `${p.percent}%`;
      printStatusText.textContent = p.statusText;
    });

    // Success confetti
    if (typeof window.confetti !== 'undefined') {
      window.confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
    }

    setTimeout(() => {
      printModal.classList.remove('open');
    }, 1500);
  } catch (err) {
    printStatusText.textContent = 'Błąd: ' + (err.message || 'Wydruk przerwany');
    setTimeout(() => {
      printModal.classList.remove('open');
    }, 3000);
  }
});

btnCancelPrint.addEventListener('click', () => {
  bleClient.cancelPrint();
  printModal.classList.remove('open');
});

// --- Manual Feed Modal Handlers ---
btnOpenManual.addEventListener('click', () => {
  manualModal.classList.add('open');
});

document.querySelectorAll('[data-feed]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (!store.get('connected')) {
      alert('Drukarka nie jest połączona!');
      return;
    }
    const mm = parseInt(btn.dataset.feed, 10);
    btn.disabled = true;
    try {
      await bleClient.feedPaper(mm);
    } catch (e) {
      alert('Błąd wysuwu: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  });
});

document.getElementById('btnDiagnosticStatus').addEventListener('click', async () => {
  await bleClient.refreshStatus();
  alert(`Status: ${store.get('isPrinting') ? 'Drukuje' : 'Gotowa'}, Bateria: ${store.get('batteryPercent')}%`);
});

// Launch!
loadDefaultContent();
