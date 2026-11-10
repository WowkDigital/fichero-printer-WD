import { store } from '../state/store.js';
import { processDithering } from '../dithering/ditherEngine.js';
import { buildRasterJob } from '../protocol/escpos.js';

export class ViewportManager {
  constructor(sourceCanvas, previewCanvas, infoElement) {
    this.sourceCanvas = sourceCanvas;
    this.previewCanvas = previewCanvas;
    this.infoElement = infoElement;

    // Offscreen render canvas matching the exact printhead width
    this.renderCanvas = document.createElement('canvas');
    this.renderCtx = this.renderCanvas.getContext('2d', { willReadFrequently: true });

    this.latestBinary = null;
    this.latestWidth = 0;
    this.latestHeight = 0;
  }

  /**
   * Re-renders the content from sourceCanvas according to current working area
   * and runs the selected dithering algorithm.
   */
  update() {
    if (!this.sourceCanvas.width || !this.sourceCanvas.height) return;

    const printheadDots = store.get('printheadDots') || 1632;
    const mediaWidthMm = store.get('mediaWidthMm') || 204;
    const isContinuous = store.get('isContinuous');
    const fixedPageHeightMm = store.get('fixedPageHeightMm') || 297;
    const alignment = store.get('alignment') || 'center';

    // 1. Calculate target dimensions in dots
    const targetWidthDots = Math.round(mediaWidthMm * 8);

    // Scaling source canvas to targetWidthDots
    const srcW = this.sourceCanvas.width;
    const srcH = this.sourceCanvas.height;
    const scale = targetWidthDots / srcW;
    const contentHeightDots = Math.round(srcH * scale);

    let finalHeightDots = contentHeightDots;
    if (!isContinuous) {
      finalHeightDots = Math.round(fixedPageHeightMm * 8);
    }

    // Set render canvas dimensions
    this.renderCanvas.width = targetWidthDots;
    this.renderCanvas.height = Math.max(80, finalHeightDots);

    // Clear with white
    this.renderCtx.fillStyle = '#ffffff';
    this.renderCtx.fillRect(0, 0, this.renderCanvas.width, this.renderCanvas.height);

    // Draw source canvas scaled
    this.renderCtx.drawImage(
      this.sourceCanvas,
      0,
      0,
      srcW,
      srcH,
      0,
      0,
      targetWidthDots,
      contentHeightDots
    );

    // 2. Fetch ImageData and apply Dithering
    const srcImageData = this.renderCtx.getImageData(
      0,
      0,
      this.renderCanvas.width,
      this.renderCanvas.height
    );

    const algorithm = store.get('algorithm') || 'atkinson';
    const adjustments = {
      brightness: store.get('brightness') || 0,
      contrast: store.get('contrast') || 0,
      gamma: store.get('gamma') || 1.0,
      thresholdVal: store.get('thresholdVal') ?? 128,
      invert: store.get('invert') || false,
      sharpen: store.get('sharpen') || false,
      halftoneCellSize: store.get('halftoneCellSize') || 6,
    };

    const ditherResult = processDithering(this.renderCtx, srcImageData, algorithm, adjustments);
    this.latestBinary = ditherResult.binary;
    this.latestWidth = ditherResult.width;
    this.latestHeight = ditherResult.height;

    // 3. Draw onto Preview Canvas
    this.previewCanvas.width = ditherResult.width;
    this.previewCanvas.height = ditherResult.height;
    const prevCtx = this.previewCanvas.getContext('2d');

    const previewMode = store.get('previewMode') || 'dither';
    if (previewMode === 'original') {
      prevCtx.drawImage(this.renderCanvas, 0, 0);
    } else if (previewMode === 'split') {
      // Half original, half dithered
      prevCtx.putImageData(ditherResult.previewImageData, 0, 0);
      const splitX = Math.round(ditherResult.width / 2);
      prevCtx.drawImage(
        this.renderCanvas,
        0,
        0,
        splitX,
        ditherResult.height,
        0,
        0,
        splitX,
        ditherResult.height
      );
      // Divider line
      prevCtx.strokeStyle = '#22c55e';
      prevCtx.lineWidth = 4;
      prevCtx.beginPath();
      prevCtx.moveTo(splitX, 0);
      prevCtx.lineTo(splitX, ditherResult.height);
      prevCtx.stroke();
    } else {
      prevCtx.putImageData(ditherResult.previewImageData, 0, 0);
    }

    // 4. Update Info Element
    if (this.infoElement) {
      const widthMm = (ditherResult.width / 8).toFixed(1);
      const heightMm = (ditherResult.height / 8).toFixed(1);
      const heightCm = (ditherResult.height / 80).toFixed(2);
      this.infoElement.textContent = `${widthMm} × ${heightMm} mm (${heightCm} cm)  |  ${ditherResult.width} × ${ditherResult.height} px (203 DPI)`;
    }
  }

  /**
   * Generates the ready-to-send ESC/POS raster payload
   */
  getPrintPayload() {
    if (!this.latestBinary) return null;

    const printheadDots = store.get('printheadDots') || 1632;
    const alignment = store.get('alignment') || 'center';
    const feedAfterMm = store.get('feedAfterPrintMm') ?? 20;
    const feedAfterDots = Math.round(feedAfterMm * 8);

    return buildRasterJob(
      this.latestBinary,
      this.latestWidth,
      this.latestHeight,
      printheadDots,
      alignment,
      feedAfterDots
    );
  }
}
