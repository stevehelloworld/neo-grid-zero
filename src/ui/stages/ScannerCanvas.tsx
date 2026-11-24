import React, { useEffect, useRef } from 'react';
import { TraceFrame } from '../../engine/vm';

export interface ScannerCanvasProps {
  mode: 'recon' | 'battle';
  stream: string;
  cursorIndex: number;
  currentRun: number;
  bestRun: number;
  activeFrame?: TraceFrame | null;
  bossShields?: number;
  brokenShields?: number;
  status?: 'idle' | 'ok' | 'error';
}

export const ScannerCanvas: React.FC<ScannerCanvasProps> = ({
  mode,
  stream,
  cursorIndex,
  currentRun,
  bestRun,
  activeFrame = null,
  bossShields = 3,
  brokenShields = 0,
  status = 'idle',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({
    mode,
    stream,
    cursorIndex,
    currentRun,
    bestRun,
    activeFrame,
    bossShields,
    brokenShields,
    status,
  });
  propsRef.current = {
    mode,
    stream,
    cursorIndex,
    currentRun,
    bestRun,
    activeFrame,
    bossShields,
    brokenShields,
    status,
  };

  const byteImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = './assets/byte-unit.png';
    img.onload = () => {
      byteImgRef.current = img;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;

    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const tw = Math.max(300, Math.round(rect.width * dpr));
      const th = Math.max(200, Math.round(rect.height * dpr));
      if (canvas.width !== tw || canvas.height !== th) {
        canvas.width = tw;
        canvas.height = th;
      }
    };
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);
    syncSize();

    const render = (now: number) => {
      const t = now / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const p = propsRef.current;

      ctx.save();
      ctx.scale(dpr, dpr);

      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#07101d');
      bg.addColorStop(1, '#040811');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.055)';
      for (let gx = 0; gx < w; gx += 36) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }

      const locals = p.activeFrame?.locals ?? {};
      const liveIdx =
        locals.i !== undefined ? Number(locals.i.value) : p.cursorIndex;
      const liveCur =
        locals.cur !== undefined
          ? Number(locals.cur.value)
          : locals.current !== undefined
            ? Number(locals.current.value)
            : locals.currentRun !== undefined
              ? Number(locals.currentRun.value)
              : p.currentRun;
      const liveBest =
        locals.best !== undefined
          ? Number(locals.best.value)
          : locals.max !== undefined
            ? Number(locals.max.value)
            : locals.bestRun !== undefined
              ? Number(locals.bestRun.value)
              : p.bestRun;

      const chars = p.stream.length ? p.stream.split('') : ['(empty)'];
      const slotW = Math.min(54, (w * 0.78) / chars.length - 6);
      const startX = Math.max(40, (w - chars.length * (slotW + 6)) / 2);
      const baseY = h * 0.62;

      // Signal Waveform Bars
      chars.forEach((ch, idx) => {
        const sx = startX + idx * (slotW + 6);
        const isO = ch === 'O';
        const isEmpty = ch === '(empty)';
        const isHot = idx === liveIdx && !isEmpty;
        const barH = isEmpty ? 16 : isO ? 94 : 36;

        ctx.fillStyle = isHot
          ? 'rgba(255, 149, 0, 0.25)'
          : isEmpty
            ? 'rgba(124, 155, 176, 0.14)'
            : isO
              ? 'rgba(184, 255, 60, 0.2)'
              : 'rgba(255, 42, 95, 0.18)';
        ctx.fillRect(sx, baseY - barH, slotW, barH);
        ctx.strokeStyle = isHot
          ? '#FF9500'
          : isEmpty
            ? '#7C9BB0'
            : isO
              ? '#B8FF3C'
              : '#FF2A5F';
        ctx.lineWidth = isHot ? 2.5 : 1.5;
        ctx.strokeRect(sx, baseY - barH, slotW, barH);

        ctx.fillStyle = isEmpty ? '#7C9BB0' : isO ? '#B8FF3C' : '#FF6B90';
        ctx.font = `700 ${isEmpty ? 10 : 16}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(ch, sx + slotW / 2, baseY + 20);
      });

      // BYTE Scanner Hovering over active cursor
      const scanIdx = Math.max(0, Math.min(chars.length - 1, liveIdx));
      const scanX =
        liveIdx >= 0
          ? startX + scanIdx * (slotW + 6) + slotW / 2
          : w * 0.14;
      const scanY = 92 + Math.sin(t * 3) * 3;
      ctx.save();
      ctx.beginPath();
      ctx.arc(scanX, scanY, 24, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
      ctx.fill();
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.clip();
      if (byteImgRef.current) ctx.drawImage(byteImgRef.current, scanX - 24, scanY - 24, 48, 48);
      ctx.restore();

      if (liveIdx >= 0 && p.stream.length > 0) {
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(scanX, scanY + 24);
        ctx.lineTo(scanX, baseY - 96);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Bottom Counter Gauges (CURRENT vs BEST)
      const gY = h - 54;
      ctx.fillStyle = 'rgba(6, 11, 18, 0.94)';
      ctx.fillRect(w * 0.14, gY, w * 0.32, 38);
      ctx.strokeStyle = '#00F0FF';
      ctx.strokeRect(w * 0.14, gY, w * 0.32, 38);
      ctx.fillStyle = '#00F0FF';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`CURRENT RUN: ${liveCur}`, w * 0.3, gY + 24);

      ctx.fillStyle = 'rgba(6, 11, 18, 0.94)';
      ctx.fillRect(w * 0.54, gY, w * 0.32, 38);
      ctx.strokeStyle = '#B8FF3C';
      ctx.strokeRect(w * 0.54, gY, w * 0.32, 38);
      ctx.fillStyle = '#B8FF3C';
      ctx.fillText(`BEST PEAK: ${liveBest}`, w * 0.7, gY + 24);

      // Boss Shield Dome
      if (p.mode === 'battle') {
        const px = w * 0.9;
        const py = 54;
        for (let s = 0; s < p.bossShields; s++) {
          const broken = s < p.brokenShields;
          ctx.beginPath();
          ctx.arc(px, py, 15 + s * 6, 0, Math.PI * 2);
          ctx.strokeStyle = broken ? 'rgba(184, 255, 60, 0.4)' : '#FF2A5F';
          ctx.lineWidth = broken ? 1.2 : 2.2;
          ctx.stroke();
        }
        ctx.fillStyle = p.brokenShields >= p.bossShields ? '#B8FF3C' : '#FF2A5F';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.fillText('PHANTOM', px, py + 3);
      }

      ctx.restore();
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className={`stage-frame chamfer ${status === 'error' ? 'shake-hit' : ''}`}>
      <canvas ref={canvasRef} className="stage-canvas" aria-label="Pulse signal waveform scanner arena" />
      <div className="stage-hud-overlay" style={{ justifyContent: 'flex-start' }}>
        <span className="tac-tag cyan">PULSE SIGNAL STREAM</span>
        {mode === 'battle' && (
          <span className={`tac-tag ${brokenShields >= bossShields ? 'lime' : 'crimson'}`}>
            PHANTOM SHIELDS: {Math.max(0, bossShields - brokenShields)} / {bossShields}
          </span>
        )}
      </div>
    </div>
  );
};
