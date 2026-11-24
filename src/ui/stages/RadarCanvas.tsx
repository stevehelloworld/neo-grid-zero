import React, { useEffect, useRef } from 'react';
import { TraceFrame } from '../../engine/vm';

export interface RadarCanvasProps {
  mode: 'recon' | 'battle';
  shape: 'rect' | 'triangle';
  rows: number;
  cols: number;
  litCount: number;
  patternText?: string;
  expectedText?: string;
  activeFrame?: TraceFrame | null;
  bossShields?: number;
  brokenShields?: number;
  status?: 'idle' | 'ok' | 'error';
}

export const RadarCanvas: React.FC<RadarCanvasProps> = ({
  mode,
  shape,
  rows,
  cols,
  litCount,
  patternText = '',
  expectedText = '',
  activeFrame = null,
  bossShields = 3,
  brokenShields = 0,
  status = 'idle',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({
    mode,
    shape,
    rows,
    cols,
    litCount,
    patternText,
    expectedText,
    activeFrame,
    bossShields,
    brokenShields,
    status,
  });
  propsRef.current = {
    mode,
    shape,
    rows,
    cols,
    litCount,
    patternText,
    expectedText,
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
      bg.addColorStop(0, '#071220');
      bg.addColorStop(1, '#040811');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // BYTE on left
      const bx = w * 0.13;
      const by = h * 0.56 + Math.sin(t * 2.3) * 4;
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

      const locals = p.activeFrame?.locals ?? {};
      const traceR = locals.r !== undefined ? Number(locals.r.value) : -1;
      const traceC = locals.c !== undefined ? Number(locals.c.value) : -1;

      if (p.mode === 'recon') {
        const numR = Math.max(1, p.rows);
        const numC = p.shape === 'rect' ? Math.max(1, p.cols) : numR;
        const cellSize = Math.min(34, (h - 120) / numR - 4);
        const startX = w * 0.34;
        const startY = 82;

        let idx = 0;
        for (let r = 1; r <= numR; r++) {
          const maxC = p.shape === 'rect' ? numC : r;
          for (let c = 1; c <= maxC; c++) {
            idx++;
            const cx = startX + (c - 1) * (cellSize + 5);
            const cy = startY + (r - 1) * (cellSize + 5);
            const lit = idx <= p.litCount;
            ctx.fillStyle = lit ? 'rgba(184, 255, 60, 0.25)' : 'rgba(11, 20, 32, 0.9)';
            ctx.fillRect(cx, cy, cellSize, cellSize);
            ctx.strokeStyle = lit ? '#B8FF3C' : 'rgba(0, 240, 255, 0.28)';
            ctx.lineWidth = lit ? 2 : 1;
            ctx.strokeRect(cx, cy, cellSize, cellSize);
            if (lit) {
              ctx.fillStyle = '#B8FF3C';
              ctx.font = '700 14px "JetBrains Mono", monospace';
              ctx.textAlign = 'center';
              ctx.fillText('#', cx + cellSize / 2, cy + cellSize / 2 + 5);
            }
          }
        }

        ctx.fillStyle = '#00F0FF';
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`CELL VISITS: ${p.litCount}`, startX, h - 26);
      } else {
        // Battle or Trace Pattern Matrix
        const actualLines = p.patternText ? p.patternText.split('\n') : [];
        const expectedLines = p.expectedText ? p.expectedText.split('\n') : [];
        const totalRows = Math.max(1, expectedLines.length, actualLines.length, p.rows);
        const cellSize = Math.min(32, (h - 128) / totalRows - 4);
        const startX = w * 0.3;
        const startY = 82;

        for (let r = 0; r < totalRows; r++) {
          const actRow = actualLines[r] ?? '';
          const expRow = expectedLines[r] ?? '';
          const colsInRow = Math.max(actRow.length, expRow.length);
          for (let c = 0; c < colsInRow; c++) {
            const cx = startX + c * (cellSize + 4);
            const cy = startY + r * (cellSize + 4);
            const hasAct = actRow[c] === '#';
            const hasExp = expRow[c] === '#';
            const match = hasAct && hasExp && p.patternText === p.expectedText;
            const isCursor = traceR === r + 1 && traceC === c + 1;

            ctx.fillStyle = isCursor
              ? 'rgba(255, 149, 0, 0.28)'
              : match
                ? 'rgba(184, 255, 60, 0.22)'
                : hasAct && !hasExp
                  ? 'rgba(255, 42, 95, 0.28)'
                  : 'rgba(11, 20, 32, 0.9)';
            ctx.fillRect(cx, cy, cellSize, cellSize);
            ctx.strokeStyle = isCursor
              ? '#FF9500'
              : match
                ? '#B8FF3C'
                : hasAct !== hasExp
                  ? '#FF2A5F'
                  : 'rgba(0, 240, 255, 0.35)';
            ctx.lineWidth = isCursor ? 2.4 : 1.3;
            ctx.strokeRect(cx, cy, cellSize, cellSize);

            if (hasAct) {
              ctx.fillStyle = hasExp ? '#B8FF3C' : '#FF6B90';
              ctx.font = '700 14px "JetBrains Mono", monospace';
              ctx.textAlign = 'center';
              ctx.fillText('#', cx + cellSize / 2, cy + cellSize / 2 + 5);
            }
          }
        }

        if (p.patternText.endsWith('\n') && p.expectedText && !p.expectedText.endsWith('\n')) {
          ctx.fillStyle = '#FF6B90';
          ctx.font = '700 11px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText('WARNING: TRAILING NEWLINE (\\n) DETECTED!', startX, h - 24);
        }

        // Boss Hydra Dome
        const hx = w * 0.9;
        const hy = 54;
        for (let s = 0; s < p.bossShields; s++) {
          const broken = s < p.brokenShields;
          ctx.beginPath();
          ctx.arc(hx, hy, 15 + s * 6, 0, Math.PI * 2);
          ctx.strokeStyle = broken ? 'rgba(184, 255, 60, 0.4)' : '#FF2A5F';
          ctx.lineWidth = broken ? 1.2 : 2.2;
          ctx.stroke();
        }
        ctx.fillStyle = p.brokenShields >= p.bossShields ? '#B8FF3C' : '#FF2A5F';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('HYDRA', hx, hy + 3);
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
      <canvas ref={canvasRef} className="stage-canvas" aria-label="Nested radar matrix arena" />
      <div className="stage-hud-overlay" style={{ justifyContent: 'flex-start' }}>
        <span className="tac-tag cyan">NESTED RADAR LATTICE</span>
        {mode === 'battle' && (
          <span className={`tac-tag ${brokenShields >= bossShields ? 'lime' : 'crimson'}`}>
            HYDRA SHIELDS: {Math.max(0, bossShields - brokenShields)} / {bossShields}
          </span>
        )}
      </div>
    </div>
  );
};
