// ESC/POS Protocol Builder for Fichero 6181 / AiYin A4 Thermal Printers

export const CMD = {
  getModel: new Uint8Array([0x10, 0xff, 0x20, 0xf0]),
  getFirmware: new Uint8Array([0x10, 0xff, 0x20, 0xf1]),
  getSerial: new Uint8Array([0x10, 0xff, 0x20, 0xf2]),
  getBattery: new Uint8Array([0x10, 0xff, 0x50, 0xf1]),
  getStatus: new Uint8Array([0x10, 0xff, 0x40]),
  getAllInfo: new Uint8Array([0x10, 0xff, 0x70]),
  getShutdownTime: new Uint8Array([0x10, 0xff, 0x13]),

  wakeup: new Uint8Array(12), // 12 null bytes

  setDensity: (level) => new Uint8Array([0x10, 0xff, 0x10, 0x00, level]),
  setPaperType: (type) => new Uint8Array([0x10, 0xff, 0x84, type]), // 0=gap, 1=mark, 2=continuous roll
  setShutdownTime: (mins) =>
    new Uint8Array([0x10, 0xff, 0x12, (mins >> 8) & 0xff, mins & 0xff]),

  enablePrinter: new Uint8Array([0x10, 0xff, 0xfe, 0x01]),
  stopPrint: new Uint8Array([0x10, 0xff, 0xfe, 0x45]), // waits for 0xAA / OK

  feedDots: (dots) => new Uint8Array([0x1b, 0x4a, Math.min(255, Math.max(0, dots))]),
  formFeed: new Uint8Array([0x1d, 0x0c]),
  factoryReset: new Uint8Array([0x10, 0xff, 0x04]),
};

/**
 * Packs 1-bit binary raster data (1=black, 0=white) into ESC/POS GS v 0 format
 * with margin alignment and feed margin to clear cutter bar.
 */
export function buildRasterJob(
  binaryData,
  widthPx,
  heightPx,
  targetHeadDots = 1632,
  alignment = 'center',
  feedAfterDots = 160 // 20mm @ 8 dots/mm
) {
  const bytesPerRow = Math.ceil(targetHeadDots / 8);
  const totalRows = heightPx + feedAfterDots;

  let xOffset = 0;
  if (widthPx < targetHeadDots) {
    if (alignment === 'center') {
      xOffset = Math.floor((targetHeadDots - widthPx) / 2);
    } else if (alignment === 'right') {
      xOffset = targetHeadDots - widthPx;
    }
  }

  // Allocate complete raster buffer: totalRows * bytesPerRow
  const rasterData = new Uint8Array(totalRows * bytesPerRow);

  for (let y = 0; y < heightPx; y++) {
    const rowOffset = y * bytesPerRow;
    for (let x = 0; x < widthPx; x++) {
      const pixel = binaryData[y * widthPx + x];
      if (pixel === 1) {
        // Black pixel (heater ON)
        const targetX = x + xOffset;
        if (targetX >= 0 && targetX < targetHeadDots) {
          const byteIdx = rowOffset + (targetX >> 3);
          const bitPos = 7 - (targetX & 7); // MSB first
          rasterData[byteIdx] |= 1 << bitPos;
        }
      }
    }
  }

  // Header: GS v 0 m xL xH yL yH
  const xl = bytesPerRow & 0xff;
  const xh = (bytesPerRow >> 8) & 0xff;
  const yl = totalRows & 0xff;
  const yh = (totalRows >> 8) & 0xff;

  const header = new Uint8Array([0x1d, 0x76, 0x30, 0x00, xl, xh, yl, yh]);

  const fullJob = new Uint8Array(header.length + rasterData.length);
  fullJob.set(header, 0);
  fullJob.set(rasterData, header.length);

  return {
    fullJob,
    bytesPerRow,
    totalRows,
    contentHeightMm: (heightPx / 8).toFixed(1),
    totalFeedMm: (totalRows / 8).toFixed(1),
  };
}
