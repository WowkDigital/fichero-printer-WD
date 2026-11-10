// High-performance In-browser Dithering and Image Processing Engine

const BAYER_2X2 = [
  [0, 2],
  [3, 1],
];

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const BAYER_8X8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

function preprocessGrayscale(imageData, adj) {
  const { width, height, data } = imageData;
  const gray = new Float32Array(width * height);

  const gammaInv = 1.0 / Math.max(0.1, adj.gamma || 1.0);
  const contrastFactor = (259 * ((adj.contrast || 0) + 255)) / (255 * (259 - (adj.contrast || 0)));
  const brightness = adj.brightness || 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3] / 255;

    // Luminance formula
    let lum = 0.299 * r + 0.587 * g + 0.114 * b;
    // Blend with white background if transparent
    lum = lum * a + 255 * (1 - a);

    // Brightness
    lum += brightness;

    // Contrast
    lum = contrastFactor * (lum - 128) + 128;

    // Clamp
    lum = Math.max(0, Math.min(255, lum));

    // Gamma
    lum = 255 * Math.pow(lum / 255, gammaInv);

    // Invert
    if (adj.invert) {
      lum = 255 - lum;
    }

    gray[i >> 2] = lum;
  }

  // Optional 3x3 Laplacian Sharpening
  if (adj.sharpen) {
    const sharpened = new Float32Array(gray.length);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const center = gray[idx];
        const laplacian =
          5 * center -
          gray[idx - 1] -
          gray[idx + 1] -
          gray[idx - width] -
          gray[idx + width];
        sharpened[idx] = Math.max(0, Math.min(255, laplacian));
      }
    }
    return sharpened;
  }

  return gray;
}

function calculateOtsuThreshold(gray) {
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) {
    const val = Math.min(255, Math.max(0, Math.round(gray[i])));
    histogram[val]++;
  }

  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  return threshold;
}

export function processDithering(ctx, sourceImageData, algorithm, adj) {
  const width = sourceImageData.width;
  const height = sourceImageData.height;
  const pixels = preprocessGrayscale(sourceImageData, adj);
  const binary = new Uint8Array(width * height);

  switch (algorithm) {
    case 'floyd-steinberg': {
      // 7/16, 3/16, 5/16, 1/16
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const oldVal = pixels[idx];
          const newVal = oldVal < 128 ? 0 : 255;
          binary[idx] = newVal === 0 ? 1 : 0;
          const err = oldVal - newVal;

          if (x + 1 < width) pixels[idx + 1] += (err * 7) / 16;
          if (y + 1 < height) {
            if (x - 1 >= 0) pixels[idx + width - 1] += (err * 3) / 16;
            pixels[idx + width] += (err * 5) / 16;
            if (x + 1 < width) pixels[idx + width + 1] += (err * 1) / 16;
          }
        }
      }
      break;
    }

    case 'atkinson': {
      // Bill Atkinson (MacPaint) - crisp dots, doesn't muddy
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const oldVal = pixels[idx];
          const newVal = oldVal < 128 ? 0 : 255;
          binary[idx] = newVal === 0 ? 1 : 0;
          const err = (oldVal - newVal) / 8;

          if (x + 1 < width) pixels[idx + 1] += err;
          if (x + 2 < width) pixels[idx + 2] += err;
          if (y + 1 < height) {
            if (x - 1 >= 0) pixels[idx + width - 1] += err;
            pixels[idx + width] += err;
            if (x + 1 < width) pixels[idx + width + 1] += err;
          }
          if (y + 2 < height) {
            pixels[idx + width * 2] += err;
          }
        }
      }
      break;
    }

    case 'stucki': {
      // Stucki 48-divisor matrix
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const oldVal = pixels[idx];
          const newVal = oldVal < 128 ? 0 : 255;
          binary[idx] = newVal === 0 ? 1 : 0;
          const err = oldVal - newVal;

          if (x + 1 < width) pixels[idx + 1] += (err * 8) / 48;
          if (x + 2 < width) pixels[idx + 2] += (err * 4) / 48;

          if (y + 1 < height) {
            const r1 = idx + width;
            if (x - 2 >= 0) pixels[r1 - 2] += (err * 2) / 48;
            if (x - 1 >= 0) pixels[r1 - 1] += (err * 4) / 48;
            pixels[r1] += (err * 8) / 48;
            if (x + 1 < width) pixels[r1 + 1] += (err * 4) / 48;
            if (x + 2 < width) pixels[r1 + 2] += (err * 2) / 48;
          }

          if (y + 2 < height) {
            const r2 = idx + width * 2;
            if (x - 2 >= 0) pixels[r2 - 2] += (err * 1) / 48;
            if (x - 1 >= 0) pixels[r2 - 1] += (err * 2) / 48;
            pixels[r2] += (err * 4) / 48;
            if (x + 1 < width) pixels[r2 + 1] += (err * 2) / 48;
            if (x + 2 < width) pixels[r2 + 2] += (err * 1) / 48;
          }
        }
      }
      break;
    }

    case 'burkes': {
      // Burkes 32-divisor matrix
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const oldVal = pixels[idx];
          const newVal = oldVal < 128 ? 0 : 255;
          binary[idx] = newVal === 0 ? 1 : 0;
          const err = oldVal - newVal;

          if (x + 1 < width) pixels[idx + 1] += (err * 8) / 32;
          if (x + 2 < width) pixels[idx + 2] += (err * 4) / 32;

          if (y + 1 < height) {
            const r1 = idx + width;
            if (x - 2 >= 0) pixels[r1 - 2] += (err * 2) / 32;
            if (x - 1 >= 0) pixels[r1 - 1] += (err * 4) / 32;
            pixels[r1] += (err * 8) / 32;
            if (x + 1 < width) pixels[r1 + 1] += (err * 4) / 32;
            if (x + 2 < width) pixels[r1 + 2] += (err * 2) / 32;
          }
        }
      }
      break;
    }

    case 'sierra-3': {
      // Sierra 3-row matrix (divisor 32)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const oldVal = pixels[idx];
          const newVal = oldVal < 128 ? 0 : 255;
          binary[idx] = newVal === 0 ? 1 : 0;
          const err = oldVal - newVal;

          if (x + 1 < width) pixels[idx + 1] += (err * 5) / 32;
          if (x + 2 < width) pixels[idx + 2] += (err * 3) / 32;

          if (y + 1 < height) {
            const r1 = idx + width;
            if (x - 2 >= 0) pixels[r1 - 2] += (err * 2) / 32;
            if (x - 1 >= 0) pixels[r1 - 1] += (err * 4) / 32;
            pixels[r1] += (err * 5) / 32;
            if (x + 1 < width) pixels[r1 + 1] += (err * 4) / 32;
            if (x + 2 < width) pixels[r1 + 2] += (err * 2) / 32;
          }

          if (y + 2 < height) {
            const r2 = idx + width * 2;
            if (x - 1 >= 0) pixels[r2 - 1] += (err * 2) / 32;
            pixels[r2] += (err * 3) / 32;
            if (x + 1 < width) pixels[r2 + 1] += (err * 2) / 32;
          }
        }
      }
      break;
    }

    case 'bayer-8': {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const threshold = (BAYER_8X8[y % 8][x % 8] + 0.5) * (255 / 64);
          binary[idx] = pixels[idx] < threshold ? 1 : 0;
        }
      }
      break;
    }

    case 'bayer-4': {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const threshold = (BAYER_4X4[y % 4][x % 4] + 0.5) * (255 / 16);
          binary[idx] = pixels[idx] < threshold ? 1 : 0;
        }
      }
      break;
    }

    case 'halftone': {
      const cellSize = Math.max(3, adj.halftoneCellSize || 6);
      const half = cellSize / 2;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const cx = (x % cellSize) - half;
          const cy = (y % cellSize) - half;
          const dist = Math.sqrt(cx * cx + cy * cy) / (half * 1.414);

          const lumNorm = pixels[idx] / 255;
          binary[idx] = dist > lumNorm ? 1 : 0;
        }
      }
      break;
    }

    case 'otsu': {
      const th = calculateOtsuThreshold(pixels);
      for (let i = 0; i < pixels.length; i++) {
        binary[i] = pixels[i] < th ? 1 : 0;
      }
      break;
    }

    case 'sobel': {
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          const gx =
            -pixels[idx - width - 1] +
            pixels[idx - width + 1] -
            2 * pixels[idx - 1] +
            2 * pixels[idx + 1] -
            pixels[idx + width - 1] +
            pixels[idx + width + 1];

          const gy =
            -pixels[idx - width - 1] -
            2 * pixels[idx - width] -
            pixels[idx - width + 1] +
            pixels[idx + width - 1] +
            2 * pixels[idx + width] +
            pixels[idx + width + 1];

          const mag = Math.sqrt(gx * gx + gy * gy);
          binary[idx] = mag > (adj.thresholdVal || 90) ? 1 : 0;
        }
      }
      break;
    }

    case 'threshold':
    default: {
      const th = adj.thresholdVal ?? 128;
      for (let i = 0; i < pixels.length; i++) {
        binary[i] = pixels[i] < th ? 1 : 0;
      }
      break;
    }
  }

  // Create RGBA ImageData for rendering on canvas
  const previewImageData = ctx.createImageData(width, height);
  const pData = previewImageData.data;
  for (let i = 0; i < binary.length; i++) {
    const isBlack = binary[i] === 1;
    const pxVal = isBlack ? 15 : 252;
    const outIdx = i * 4;
    pData[outIdx] = pxVal;
    pData[outIdx + 1] = pxVal;
    pData[outIdx + 2] = pxVal;
    pData[outIdx + 3] = 255;
  }

  return { binary, previewImageData, width, height };
}
