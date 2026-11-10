// Calibration and Diagnostic Test Patterns Generator

export function drawTestPattern(canvas, pattern) {
  const width = canvas.width;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;

  switch (pattern) {
    case 'band-1cm': {
      // Exactly 80 dots high (10.0 mm at 8 dots/mm)
      const bandHeight = 80;
      const top = 60;

      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FICHERO 6181  |  PRECYZYJNA KALIBRACJA 1.0 CM', width / 2, 35);

      // Solid black band
      ctx.fillRect(16, top, width - 32, bandHeight);

      // White text inside the black band
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('[ DOKŁADNIE 10.0 mm (1.00 cm) ZADRUKU NA CZARNO ]', width / 2, top + 48);

      // Bottom info
      ctx.fillStyle = '#000000';
      ctx.font = '18px monospace';
      ctx.fillText(
        '<--- 1632 piksele (204 mm) roboczej szerokości głowicy termicznej --->',
        width / 2,
        top + bandHeight + 40
      );
      break;
    }

    case 'ruler': {
      // Millimeter ruler with 8 dots/mm ticks
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LINIJKA KALIBRACYJNA TERMICZNA (SKALA 1:1, 203 DPI)', width / 2, 35);

      const rulerY = 70;
      const totalMm = Math.floor(width / 8);

      // Baseline
      ctx.beginPath();
      ctx.moveTo(16, rulerY);
      ctx.lineTo(width - 16, rulerY);
      ctx.stroke();

      ctx.font = '14px monospace';
      for (let mm = 0; mm <= totalMm; mm++) {
        const x = mm * 8;
        if (x < 16 || x > width - 16) continue;

        let tickH = 6;
        if (mm % 10 === 0) {
          tickH = 25;
          ctx.fillText(`${mm / 10}cm`, x, rulerY + tickH + 18);
        } else if (mm % 5 === 0) {
          tickH = 14;
        }

        ctx.beginPath();
        ctx.moveTo(x, rulerY);
        ctx.lineTo(x, rulerY + tickH);
        ctx.stroke();
      }
      break;
    }

    case 'gradient': {
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TEST GRADIENTU I ODDANIA TONÓW DITHERINGU', width / 2, 35);

      const gradY = 60;
      const gradH = 100;
      const gradient = ctx.createLinearGradient(20, 0, width - 20, 0);
      gradient.addColorStop(0, '#000000');
      gradient.addColorStop(1, '#ffffff');

      ctx.fillStyle = gradient;
      ctx.fillRect(20, gradY, width - 40, gradH);

      const steps = 8;
      const stepW = (width - 40) / steps;
      const stepY = gradY + gradH + 20;
      const stepH = 60;

      for (let i = 0; i < steps; i++) {
        const grayVal = Math.round((i / (steps - 1)) * 255);
        ctx.fillStyle = `rgb(${grayVal},${grayVal},${grayVal})`;
        ctx.fillRect(20 + i * stepW, stepY, stepW, stepH);
        ctx.strokeRect(20 + i * stepW, stepY, stepW, stepH);
      }
      break;
    }

    case 'alignment-grid': {
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SIATKA KALIBRACYJNA MARGINESÓW I OSTROŚCI', width / 2, 35);

      const gridY = 60;
      const gridH = canvas.height - 90;

      ctx.strokeRect(16, gridY, width - 32, gridH);

      ctx.beginPath();
      ctx.moveTo(16, gridY);
      ctx.lineTo(width - 16, gridY + gridH);
      ctx.moveTo(width - 16, gridY);
      ctx.lineTo(16, gridY + gridH);
      ctx.stroke();

      ctx.fillRect(width / 2 - 20, gridY + gridH / 2 - 2, 40, 4);
      ctx.fillRect(width / 2 - 2, gridY + gridH / 2 - 20, 4, 40);
      break;
    }
  }
}
