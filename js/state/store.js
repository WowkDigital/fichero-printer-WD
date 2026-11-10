// Central reactive state store for Fichero Studio

export const PaperPresets = {
  A4_STD: { name: 'A4 Standard (204 mm)', widthMm: 204, dots: 1632, fullPageH: 297 },
  A4_FULL: { name: 'A4 Pełna głowica (210 mm)', widthMm: 210, dots: 1680, fullPageH: 297 },
  LETTER: { name: 'US Letter (216 mm)', widthMm: 216, dots: 1728, fullPageH: 279 },
  A5: { name: 'A5 Rolka (148 mm)', widthMm: 148, dots: 1184, fullPageH: 210 },
  ROLL_105: { name: 'Rolka 105 mm (Etykiety)', widthMm: 105, dots: 840, fullPageH: 150 },
  ROLL_80: { name: 'Rolka 80 mm (Paragon)', widthMm: 80, dots: 640, fullPageH: 120 },
  ROLL_58: { name: 'Rolka 58 mm (Wąska)', widthMm: 58, dots: 464, fullPageH: 100 },
};

class Store {
  constructor() {
    this.state = {
      // Paper & Canvas settings
      paperPreset: 'A4_STD',
      mediaWidthMm: 204,
      printheadDots: 1632,
      isContinuous: true, // roll paper: dynamic height
      fixedPageHeightMm: 297,
      alignment: 'center', // left, center, right
      feedAfterPrintMm: 20, // feed ~20mm to clear cutter bar

      // Dithering & Adjustments
      algorithm: 'atkinson', // atkinson, floyd-steinberg, stucki, burkes, sierra-3, bayer-8, halftone, otsu, threshold
      brightness: 0,        // -100 to 100
      contrast: 0,          // -100 to 100
      gamma: 1.0,           // 0.2 to 3.0
      thresholdVal: 128,    // 0 to 255
      invert: false,        // black/white swap
      sharpen: false,       // 3x3 Laplacian sharpen
      rotation: 0,          // 0, 90, 180, 270
      halftoneCellSize: 6,  // 3 to 16

      // BLE & Pacing settings
      chunkSize: 200,       // bytes per BLE packet (MTU standard)
      chunkDelayMs: 20,     // inter-packet delay in ms
      density: 2,           // 0=light, 1=medium, 2=dark
      paperType: 2,         // 0=gap, 1=mark, 2=continuous roll
      copies: 1,

      // Printer Live Status
      connected: false,
      deviceName: null,
      batteryPercent: null,
      isPrinting: false,
      isCoverOpen: false,
      isNoPaper: false,
      isOverheated: false,
      isCharging: false,

      // Active Content Tab
      activeTab: 'image', // image, pdf, text, barcode, draw, test
      previewMode: 'dither', // dither, original, split
      zoomLevel: 100, // 50, 100, 150, fit
    };

    this.listeners = new Map();
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    if (this.state[key] === value) return;
    this.state[key] = value;
    this._emit(key, value);
  }

  update(patch) {
    for (const [k, v] of Object.entries(patch)) {
      this.set(k, v);
    }
  }

  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    // initial call
    callback(this.state[key]);

    return () => {
      this.listeners.get(key)?.delete(callback);
    };
  }

  _emit(key, value) {
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      for (const cb of callbacks) {
        cb(value);
      }
    }
    // Also notify wildcard listeners
    const anyCallbacks = this.listeners.get('*');
    if (anyCallbacks) {
      for (const cb of anyCallbacks) {
        cb(key, value);
      }
    }
  }
}

export const store = new Store();
