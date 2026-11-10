// Interactive Drawing & Signature Pad (mouse, touch and stylus via Pointer Events)

export class DrawingPad {
  constructor(canvas, onUpdate) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.onUpdate = onUpdate;
    this.isDrawing = false;
    this.pointerId = null;
    this.lineWidth = 6;
    this.lastX = 0;
    this.lastY = 0;
    this.history = [];
    this.maxHistory = 12;
    this.enabled = true;

    this.initEvents();
  }

  setLineWidth(w) {
    this.lineWidth = w;
  }

  /** Resize while preserving existing content (top-left anchored). */
  resize(width, height) {
    if (this.canvas.width === width && this.canvas.height === height) return;
    const tmp = document.createElement('canvas');
    tmp.width = this.canvas.width;
    tmp.height = this.canvas.height;
    if (tmp.width && tmp.height) tmp.getContext('2d').drawImage(this.canvas, 0, 0);

    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, width, height);
    if (tmp.width && tmp.height) this.ctx.drawImage(tmp, 0, 0);
    this.history = [];
  }

  snapshot() {
    try {
      this.history.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
      if (this.history.length > this.maxHistory) this.history.shift();
    } catch {
      /* ignore */
    }
  }

  canUndo() {
    return this.history.length > 0;
  }

  undo() {
    const snap = this.history.pop();
    if (!snap) return false;
    if (snap.width === this.canvas.width && snap.height === this.canvas.height) {
      this.ctx.putImageData(snap, 0, 0);
      this.onUpdate?.();
    }
    return true;
  }

  clear() {
    this.snapshot();
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.onUpdate?.();
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      scale: scaleX,
    };
  }

  /** Brush size is defined in screen pixels so it feels the same at any zoom level. */
  brushSize(scale) {
    return Math.max(1, this.lineWidth * scale);
  }

  initEvents() {
    const c = this.canvas;

    const start = (e) => {
      if (!this.enabled || this.isDrawing) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.isDrawing = true;
      this.pointerId = e.pointerId;
      c.setPointerCapture?.(e.pointerId);
      this.snapshot();

      const pos = this.getPos(e);
      this.lastX = pos.x;
      this.lastY = pos.y;
      this.ctx.fillStyle = '#000000';
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, this.brushSize(pos.scale) / 2, 0, Math.PI * 2);
      this.ctx.fill();
    };

    const move = (e) => {
      if (!this.isDrawing || e.pointerId !== this.pointerId) return;
      e.preventDefault();
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
      const ctx = this.ctx;
      ctx.strokeStyle = '#000000';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const ev of events.length ? events : [e]) {
        const pos = this.getPos(ev);
        ctx.lineWidth = this.brushSize(pos.scale);
        ctx.beginPath();
        ctx.moveTo(this.lastX, this.lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        this.lastX = pos.x;
        this.lastY = pos.y;
      }
    };

    const stop = (e) => {
      if (!this.isDrawing || (e && e.pointerId !== this.pointerId)) return;
      this.isDrawing = false;
      this.pointerId = null;
      this.onUpdate?.();
    };

    c.addEventListener('pointerdown', start);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', stop);
    c.addEventListener('pointercancel', stop);
    c.addEventListener('lostpointercapture', stop);
  }
}
