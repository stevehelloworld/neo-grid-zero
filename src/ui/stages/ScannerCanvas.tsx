import React, { useEffect, useRef } from 'react';
import { TraceFrame } from '../../engine/vm';
import { drawArenaAtmosphere, drawByteHero } from './drawByteHero';

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

      drawArenaAtmosphere(ctx, w, h, p.status === 'error' ? '#FF2A5F' : '#00F0FF');

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

      // Full-body transparent Hero BYTE on left
      const byteH =
        w >= 560
          ? Math.min(320, Math.max(178, h * 0.68))
          : w >= 430
            ? Math.min(188, Math.max(138, h * 0.54))
            : Math.min(138, Math.max(106, h * 0.5));
      const approxW = byteH * 0.845;
      const bx = Math.max(approxW * 0.5 + 8, w * 0.15);
      const by = Math.max(byteH * 0.5 + 34, h * 0.52);
      const byte = drawByteHero(
        ctx,
        byteImgRef.current,
        bx,
        by,
        byteH,
        t,
        p.status,
        w >= 430 ? 'UNIT-01 // SCANNER' : undefined,
      );

      const contentLeft = byte.rightEdge + (w < 430 ? 8 : 14);
      const contentRight = w - (w < 430 ? 10 : 16);
      const contentW = Math.max(150, contentRight - contentLeft);

      const chars = p.stream.length ? p.stream.split('') : ['(empty)'];
      const gap = w < 430 ? 3 : 6;
      const slotW = Math.min(58, Math.max(12, (contentW * 0.96) / chars.length - gap));
      const totalBarsW = chars.length * (slotW + gap) - gap;
      const startX = contentLeft + Math.max(0, (contentW - totalBarsW) / 2);
      const compactH = h < 300;
      const baseY = h - (compactH ? 84 : 96);
      const maxBarH = Math.min(185, Math.max(52, baseY - 62));

      // Signal Waveform Bars across Right Zone
      chars.forEach((ch, idx) => {
        const sx = startX + idx * (slotW + gap);
        const isO = ch === 'O';
        const isEmpty = ch === '(empty)';
        const isHot = idx === liveIdx && !isEmpty;
        const barH = isEmpty ? 16 : isO ? maxBarH : maxBarH * 0.36;

        ctx.fillStyle = isHot
          ? 'rgba(255, 149, 0, 0.28)'
          : isEmpty
            ? 'rgba(124, 155, 176, 0.14)'
            : isO
              ? 'rgba(184, 255, 60, 0.22)'
              : 'rgba(255, 42, 95, 0.2)';
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
        ctx.font = `700 ${isEmpty ? 10 : Math.min(18, Math.max(11, slotW * 0.45))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(ch, sx + slotW / 2, baseY + (compactH ? 15 : 18));
      });

      // Scanner laser beam from BYTE arm to active bar cursor
      if (liveIdx >= 0 && liveIdx < chars.length && p.stream.length > 0) {
        const targetBarX = startX + liveIdx * (slotW + gap) + slotW / 2;
        const targetBarH = chars[liveIdx] === 'O' ? maxBarH : maxBarH * 0.36;
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(byte.emitterX, byte.emitterY);
        ctx.lineTo(targetBarX, baseY - targetBarH / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Bottom Counter Gauges (CURRENT vs BEST) aligned cleanly inside Right Zone
      const gY = h - (compactH ? 48 : 54);
      const podH = compactH ? 30 : 36;
      const podGap = 10;
      const podW = (contentW - podGap) / 2;
      ctx.fillStyle = 'rgba(6, 11, 18, 0.94)';
      ctx.fillRect(contentLeft, gY, podW, podH);
      ctx.strokeStyle = '#00F0FF';
      ctx.strokeRect(contentLeft, gY, podW, podH);
      ctx.fillStyle = '#00F0FF';
      ctx.font = `700 ${podW < 110 ? 9.5 : 12}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(
        podW < 110 ? `CUR: ${liveCur}` : `CURRENT RUN: ${liveCur}`,
        contentLeft + podW / 2,
        gY + (compactH ? 19 : 22),
      );

      const bestX = contentLeft + podW + podGap;
      ctx.fillStyle = 'rgba(6, 11, 18, 0.94)';
      ctx.fillRect(bestX, gY, podW, podH);
      ctx.strokeStyle = '#B8FF3C';
      ctx.strokeRect(bestX, gY, podW, podH);
      ctx.fillStyle = '#B8FF3C';
      ctx.fillText(
        podW < 110 ? `BEST: ${liveBest}` : `BEST PEAK: ${liveBest}`,
        bestX + podW / 2,
        gY + (compactH ? 19 : 22),
      );

      // Boss Shield Dome (desktop)
      if (p.mode === 'battle' && w >= 560) {
        const px = w - 36;
        const py = 38;
        for (let s = 0; s < p.bossShields; s++) {
          const broken = s < p.brokenShields;
          ctx.beginPath();
          ctx.arc(px, py, 11 + s * 4, 0, Math.PI * 2);
          ctx.strokeStyle = broken ? 'rgba(184, 255, 60, 0.4)' : '#FF2A5F';
          ctx.lineWidth = broken ? 1.2 : 2;
          ctx.stroke();
        }
        ctx.fillStyle = p.brokenShields >= p.bossShields ? '#B8FF3C' : '#FF2A5F';
        ctx.font = '700 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
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
