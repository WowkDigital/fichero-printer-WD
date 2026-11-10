// Lightweight Pure JS Code128 Barcode & QR Code Renderer

// Code 128 Character Set B encoding patterns (6 elements: widths of bars and spaces)
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', // 100-102
  '211412', '211214', '211232', '2331112' // 103 (Start B), 104, 105, Stop
];

export function renderCode128(canvas, text, barWidth = 4, barHeight = 120) {
  const ctx = canvas.getContext('2d');
  const startB = 104; // Start Code B
  const stopCode = 106;

  // Compute checksum
  let checksum = startB;
  const codes = [startB];

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) - 32;
    if (charCode < 0 || charCode > 95) continue;
    codes.push(charCode);
    checksum += charCode * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(stopCode);

  // Convert codes to widths string
  let patternStr = '';
  for (const c of codes) {
    patternStr += CODE128_PATTERNS[c] || '';
  }

  const quietZone = 40;
  let totalUnits = 0;
  for (let i = 0; i < patternStr.length; i++) {
    totalUnits += parseInt(patternStr[i], 10);
  }

  const totalWidth = totalUnits * barWidth + quietZone * 2;
  const totalHeight = barHeight + 60;

  canvas.width = totalWidth;
  canvas.height = totalHeight;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Draw bars
  let curX = quietZone;
  ctx.fillStyle = '#000000';

  for (let i = 0; i < patternStr.length; i++) {
    const width = parseInt(patternStr[i], 10) * barWidth;
    const isBar = i % 2 === 0; // alternating: bar, space, bar, space...

    if (isBar) {
      ctx.fillRect(curX, 20, width, barHeight);
    }
    curX += width;
  }

  // Text under barcode
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, totalWidth / 2, barHeight + 45);
}

/**
 * QR Code Generator via online CDN or dynamic fallback
 */
export async function renderQrCode(canvas, text, size = 500) {
  // If QRCode library is available globally, use it
  if (typeof window.QRCode !== 'undefined') {
    canvas.width = size;
    canvas.height = size;
    await window.QRCode.toCanvas(canvas, text, {
      width: size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' }
    });
    return;
  }

  // Fallback to QR API image rendered on canvas
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      resolve();
    };
    img.onerror = () => {
      // Basic text fallback
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000000';
      ctx.font = '20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Kod QR dla:', size / 2, size / 2 - 20);
      ctx.fillText(text.slice(0, 25), size / 2, size / 2 + 20);
      resolve();
    };
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
  });
}
