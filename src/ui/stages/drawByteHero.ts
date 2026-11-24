export type ByteHeroStatus = 'idle' | 'ok' | 'error' | 'stale';

export interface ByteHeroMetrics {
  emitterX: number;
  emitterY: number;
  rightEdge: number;
  drawW: number;
  drawH: number;
}

const STATUS_ACCENT: Record<ByteHeroStatus, string> = {
  idle: '#00F0FF',
  ok: '#B8FF3C',
  error: '#FF2A5F',
  stale: '#FF9500',
};

const STATUS_GLOW_RGBA: Record<ByteHeroStatus, string> = {
  idle: 'rgba(0, 240, 255, 0.18)',
  ok: 'rgba(184, 255, 60, 0.2)',
  error: 'rgba(255, 42, 95, 0.24)',
  stale: 'rgba(255, 149, 0, 0.2)',
};

export function drawArenaAtmosphere(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  accent = '#00F0FF',
): void {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#071322');
  bg.addColorStop(1, '#040811');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Left hero bay radial spotlight
  const bayGlow = ctx.createRadialGradient(w * 0.2, h * 0.52, 8, w * 0.2, h * 0.52, Math.max(w * 0.38, 160));
  bayGlow.addColorStop(0, 'rgba(0, 240, 255, 0.08)');
  bayGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = bayGlow;
  ctx.fillRect(0, 0, w, h);

  // Subtle tactical grid
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.055)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx < w; gx += 36) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, h);
    ctx.stroke();
  }
  for (let gy = 0; gy < h; gy += 36) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }

  // Horizon floor line & scale ticks
  const floorY = h - 16;
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.22)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(12, floorY);
  ctx.lineTo(w - 12, floorY);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(124, 155, 176, 0.22)';
  ctx.lineWidth = 1;
  for (let tx = 24; tx < w - 20; tx += 36) {
    ctx.beginPath();
    ctx.moveTo(tx, floorY);
    ctx.lineTo(tx, floorY + 5);
    ctx.stroke();
  }

  // Subtle corner reticle brackets
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 1.4;
  const b = 12;
  const m = 8;
  const corners = [
    [m, m, 1, 1],
    [w - m, m, -1, 1],
    [m, h - m, 1, -1],
    [w - m, h - m, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * b);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * b, cy);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawByteHero(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number,
  cy: number,
  targetHeight: number,
  t: number,
  status: ByteHeroStatus = 'idle',
  label?: string,
): ByteHeroMetrics {
  const aspect =
    img && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 0.845;
  const drawH = targetHeight;
  const drawW = drawH * aspect;
  const hoverOffset = Math.sin(t * 2.3) * 5;
  const bobY = cy + hoverOffset;
  const accent = STATUS_ACCENT[status];
  const glowColor = STATUS_GLOW_RGBA[status];

  ctx.save();

  // Radial mecha aura behind BYTE
  const auraR = Math.max(drawW, drawH) * 0.56;
  const aura = ctx.createRadialGradient(cx, bobY, auraR * 0.12, cx, bobY, auraR);
  aura.addColorStop(0, glowColor);
  aura.addColorStop(0.55, 'rgba(0, 240, 255, 0.05)');
  aura.addColorStop(1, 'transparent');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx, bobY, auraR, 0, Math.PI * 2);
  ctx.fill();

  // Glowing hover-pad ellipse beneath BYTE's feet
  const padY = cy + drawH * 0.49;
  const padScale = 1 - hoverOffset * 0.012;
  const padRx = Math.max(24, drawW * 0.34 * padScale);
  const padRy = Math.max(5, padRx * 0.19);
  ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, padY, padRx, padRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Full-body transparent mecha render (no circular clipping)
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, cx - drawW / 2, bobY - drawH / 2, drawW, drawH);
  } else {
    ctx.fillStyle = 'rgba(232, 244, 242, 0.9)';
    ctx.fillRect(cx - drawW * 0.24, bobY - drawH * 0.35, drawW * 0.48, drawH * 0.65);
    ctx.fillStyle = accent;
    ctx.fillRect(cx - drawW * 0.14, bobY - drawH * 0.28, drawW * 0.28, drawH * 0.1);
  }

  if (label) {
    const labelY = Math.min(padY + padRy + 14, ctx.canvas.clientHeight > 0 ? ctx.canvas.clientHeight - 6 : padY + padRy + 14);
    ctx.fillStyle = accent;
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, labelY);
  }

  ctx.restore();

  return {
    emitterX: cx + drawW * 0.34,
    emitterY: bobY - drawH * 0.04,
    rightEdge: cx + drawW * 0.48,
    drawW,
    drawH,
  };
}
