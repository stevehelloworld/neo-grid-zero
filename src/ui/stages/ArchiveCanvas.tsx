import React, { useEffect, useRef } from 'react';
import { TraceFrame } from '../../engine/vm';

export interface ArchiveCanvasProps {
  mode: 'recon' | 'battle';
  tapeText: string;
  beginIdx?: number;
  endIdx?: number;
  slicedResult?: string;
  activeFrame?: TraceFrame | null;
  bossShields?: number;
  brokenShields?: number;
  status?: 'idle' | 'ok' | 'error';
  pulseKey?: number;
}

export const ArchiveCanvas: React.FC<ArchiveCanvasProps> = ({
  mode,
  tapeText,
  beginIdx = 1,
  endIdx = 4,
  slicedResult = '',
  activeFrame = null,
  bossShields = 3,
  brokenShields = 0,
  status = 'idle',
  pulseKey = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({
    mode,
    tapeText,
    beginIdx,
    endIdx,
    slicedResult,
    activeFrame,
    bossShields,
    brokenShields,
    status,
  });
  propsRef.current = {
    mode,
    tapeText,
    beginIdx,
    endIdx,
    slicedResult,
    activeFrame,
    bossShields,
    brokenShields,
    status,
  };

  const flashRef = useRef(0);
  const byteImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = './assets/byte-unit.png';
    img.onload = () => {
      byteImgRef.current = img;
    };
  }, []);

  useEffect(() => {
    if (pulseKey > 0) flashRef.current = 1;
  }, [pulseKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

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
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const p = propsRef.current;
      flashRef.current = Math.max(0, flashRef.current - dt * 1.5);

      ctx.save();
      ctx.scale(dpr, dpr);

      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#07121f');
      bg.addColorStop(1, '#040912');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      for (let gx = 0; gx < w; gx += 36) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }

      // BYTE Sprite
      const bx = w * 0.13;
      const by = h * 0.66 + Math.sin(t * 2.2) * 4;
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, 32, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.fill();
      ctx.strokeStyle = p.status === 'error' ? '#FF2A5F' : '#00F0FF';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.clip();
      if (byteImgRef.current) ctx.drawImage(byteImgRef.current, bx - 32, by - 32, 64, 64);
      ctx.restore();

      // Optical String Tape Ribbon
      const chars = p.tapeText.split('');
      const maxChars = Math.max(1, chars.length);
      const tileW = Math.min(44, (w * 0.72) / maxChars - 4);
      const totalTapeW = maxChars * (tileW + 4);
      const tapeStartX = Math.max(w * 0.18, (w - totalTapeW) / 2);
      const tapeY = h * 0.38;

      const dashPos = p.tapeText.indexOf('-');
      const dashFromTrace = p.activeFrame?.locals.dash?.value;

      chars.forEach((ch, idx) => {
        const tx = tapeStartX + idx * (tileW + 4);
        const inSlice =
          p.mode === 'recon'
            ? idx >= p.beginIdx && idx < p.endIdx
            : dashPos >= 0 && idx > dashPos;
        const isDash = ch === '-';

        // Index ruler label
        ctx.fillStyle = '#7C9BB0';
        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(idx), tx + tileW / 2, tapeY - 10);

        // Tile box
        ctx.fillStyle =
          p.status === 'error'
            ? 'rgba(255, 42, 95, 0.18)'
            : isDash
              ? 'rgba(255, 149, 0, 0.2)'
              : inSlice
                ? 'rgba(0, 240, 255, 0.18)'
                : 'rgba(11, 20, 32, 0.92)';
        ctx.fillRect(tx, tapeY, tileW, 48);
        ctx.strokeStyle =
          p.status === 'error'
            ? '#FF2A5F'
            : isDash
              ? '#FF9500'
              : inSlice
                ? '#B8FF3C'
                : 'rgba(124, 155, 176, 0.35)';
        ctx.lineWidth = inSlice || isDash ? 2 : 1.2;
        ctx.strokeRect(tx, tapeY, tileW, 48);

        ctx.fillStyle = '#E8F4F2';
        ctx.font = '700 18px "JetBrains Mono", monospace';
        ctx.fillText(ch, tx + tileW / 2, tapeY + 30);
      });

      // Laser Cutters in Recon
      if (p.mode === 'recon') {
        const bX = tapeStartX + p.beginIdx * (tileW + 4);
        const eX = tapeStartX + Math.min(chars.length, p.endIdx) * (tileW + 4);
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bX, tapeY - 26);
        ctx.lineTo(bX, tapeY + 58);
        ctx.stroke();

        ctx.strokeStyle = p.endIdx > chars.length ? '#FF2A5F' : '#FF9500';
        ctx.beginPath();
        ctx.moveTo(eX, tapeY - 26);
        ctx.lineTo(eX, tapeY + 58);
        ctx.stroke();

        ctx.fillStyle = '#00F0FF';
        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.fillText(`begin=${p.beginIdx}`, bX, tapeY - 30);
        ctx.fillStyle = p.endIdx > chars.length ? '#FF2A5F' : '#FF9500';
        ctx.fillText(`end=${p.endIdx}`, eX, tapeY + 72);
      }

      // Extracted Output Pod
      const outBoxW = 240;
      const outBoxX = w * 0.54 - outBoxW / 2;
      const outBoxY = h * 0.7;
      ctx.fillStyle = 'rgba(6, 11, 18, 0.94)';
      ctx.fillRect(outBoxX, outBoxY, outBoxW, 48);
      ctx.strokeStyle =
        p.status === 'error' ? '#FF2A5F' : p.status === 'ok' ? '#B8FF3C' : '#00F0FF';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(outBoxX, outBoxY, outBoxW, 48);
      ctx.fillStyle = '#7C9BB0';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        dashFromTrace !== undefined ? `indexOf("-") = ${dashFromTrace}` : 'EXTRACTED OUTPUT',
        w * 0.54,
        outBoxY + 15,
      );
      ctx.fillStyle = p.status === 'error' ? '#FF6B90' : '#B8FF3C';
      ctx.font = '700 16px "JetBrains Mono", monospace';
      ctx.fillText(p.slicedResult ? `"${p.slicedResult}"` : '—', w * 0.54, outBoxY + 37);

      // Boss Archivist Shield
      if (p.mode === 'battle') {
        const ax = w * 0.9;
        const ay = 56;
        for (let s = 0; s < p.bossShields; s++) {
          const broken = s < p.brokenShields;
          ctx.strokeStyle = broken ? 'rgba(184, 255, 60, 0.4)' : '#FF2A5F';
          ctx.lineWidth = broken ? 1.2 : 2.2;
          ctx.strokeRect(ax - (16 + s * 6), ay - (16 + s * 6), (16 + s * 6) * 2, (16 + s * 6) * 2);
        }
        ctx.fillStyle = p.brokenShields >= p.bossShields ? '#B8FF3C' : '#FF2A5F';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.fillText('ARCHIVIST', ax, ay + 4);
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
      <canvas ref={canvasRef} className="stage-canvas" aria-label="Signal archive optical slicer arena" />
      <div className="stage-hud-overlay" style={{ justifyContent: 'flex-start' }}>
        <span className="tac-tag cyan">OPTICAL STRING LASER</span>
        {mode === 'battle' && (
          <span className={`tac-tag ${brokenShields >= bossShields ? 'lime' : 'crimson'}`}>
            ARCHIVIST SHIELDS: {Math.max(0, bossShields - brokenShields)} / {bossShields}
          </span>
        )}
      </div>
    </div>
  );
};
