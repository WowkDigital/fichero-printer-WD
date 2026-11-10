// Text and Label Renderer for Thermal Printer

export function renderTextToCanvas(canvas, options) {
  const {
    text = '',
    fontSize = 32,
    lineHeight = 1.4,
    align = 'left',
    bold = false,
    border = false,
    padding = 40,
    fontFamily = 'monospace',
  } = options;

  const ctx = canvas.getContext('2d');
  const width = canvas.width;

  // Split lines
  const rawLines = text.split('\n');
  const fontStr = `${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
  ctx.font = fontStr;

  // Word wrap lines so they fit within canvas width - padding*2
  const maxLineWidth = width - padding * 2;
  const wrappedLines = [];

  for (const rawLine of rawLines) {
    if (rawLine === '') {
      wrappedLines.push('');
      continue;
    }

    const words = rawLine.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxLineWidth && currentLine) {
        wrappedLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      wrappedLines.push(currentLine);
    }
  }

  const lineStep = Math.round(fontSize * lineHeight);
  const contentHeight = padding * 2 + wrappedLines.length * lineStep;
  const targetHeight = Math.max(160, contentHeight);

  // Resize canvas height dynamically if needed
  canvas.height = targetHeight;

  // Re-fetch context after resize
  const c = canvas.getContext('2d');
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, width, targetHeight);

  c.fillStyle = '#000000';
  c.strokeStyle = '#000000';
  c.font = fontStr;
  c.textBaseline = 'top';

  if (border) {
    c.lineWidth = 4;
    c.strokeRect(padding / 2, padding / 2, width - padding, targetHeight - padding);
  }

  let y = padding;
  for (const line of wrappedLines) {
    let x = padding;
    if (align === 'center') {
      const w = c.measureText(line).width;
      x = (width - w) / 2;
    } else if (align === 'right') {
      const w = c.measureText(line).width;
      x = width - padding - w;
    }

    c.fillText(line, x, y);
    y += lineStep;
  }
}
