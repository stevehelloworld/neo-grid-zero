import React, { useEffect, useRef } from 'react';
import { TraceFrame } from '../../engine/vm';
import { drawArenaAtmosphere, drawByteHero } from './drawByteHero';

export interface MarketCanvasProps {
  mode: 'recon' | 'splitter' | 'titan' | 'trace';
  units?: number;
  squads?: number;
  distributed?: boolean;
  activeFrame?: TraceFrame | null;
  bossShields?: number;
  brokenShields?: number;
  status?: 'idle' | 'ok' | 'error';
  pulseKey?: number;
}

interface CrateParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export const MarketCanvas: React.FC<MarketCanvasProps> = ({
  mode,
  units = 17,
  squads = 5,
  distributed = false,
  activeFrame = null,
  bossShields = 3,
  brokenShields = 0,
  status = 'idle',
  pulseKey = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({
    mode,
    units,
    squads,
    distributed,
    activeFrame,
    bossShields,
    brokenShields,
    status,
  });
  propsRef.current = {
    mode,
    units,
    squads,
    distributed,
    activeFrame,
    bossShields,
    brokenShields,
    status,
  };

  const particlesRef = useRef<CrateParticle[]>([]);
  const byteImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = './assets/byte-unit.png';
    img.onload = () => {
      byteImgRef.current = img;
    };
  }, []);

  useEffect(() => {
    if (pulseKey === 0) return;
    const canvas = canvasRef.current;
    const w = canvas ? canvas.clientWidth : 600;
    const h = canvas ? canvas.clientHeight : 340;
    const color =
      propsRef.current.status === 'error' ? '#FF2A5F' : '#B8FF3C';
    for (let i = 0; i < 24; i++) {
      const a = (Math.PI * 2 * i) / 24 + Math.random() * 0.2;
      const spd = 45 + Math.random() * 130;
      particlesRef.current.push({
        x: w * 0.56,
        y: h * 0.52,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0.7 + Math.random() * 0.35,
        color,
      });
    }
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

      ctx.save();
      ctx.scale(dpr, dpr);

      drawArenaAtmosphere(ctx, w, h, '#FF9500');

      // Neon market lanterns at top
      for (let l = 0; l < 6; l++) {
        const lx = w * (0.28 + l * 0.11);
        const ly = 48 + Math.sin(t * 2 + l) * 2;
        ctx.fillStyle = l % 2 === 0 ? '#FF9500' : '#00F0FF';
        ctx.beginPath();
        ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Full-body transparent BYTE Hover Unit
      const byteH =
        w >= 560
          ? Math.min(325, Math.max(185, h * 0.68))
          : w >= 430
            ? Math.min(194, Math.max(142, h * 0.55))
            : Math.min(142, Math.max(108, h * 0.52));
      const approxW = byteH * 0.845;
      const bx = Math.max(approxW * 0.5 + 8, w * 0.16);
      const by = Math.max(byteH * 0.5 + 34, h * 0.53);
      const byte = drawByteHero(
        ctx,
        byteImgRef.current,
        bx,
        by,
        byteH,
        t,
        p.status,
        w >= 430 ? 'UNIT-01 // LEDGER' : undefined,
      );

      const contentLeft = byte.rightEdge + (w < 430 ? 8 : 14);
      const contentRight = w - (w < 430 ? 10 : 16);
      const contentW = Math.max(150, contentRight - contentLeft);
      const locals = p.activeFrame?.locals ?? {};

      if (p.mode === 'titan' || p.mode === 'trace') {
        const cards =
          p.mode === 'trace'
            ? [
                { k: 'a', label: 'a', color: '#00F0FF' },
                { k: 'b', label: 'b', color: '#00F0FF' },
                { k: 'x', label: 'x (int / int)', color: '#FF9500' },
                { k: 'y', label: 'y ((double) cast)', color: '#B8FF3C' },
              ]
            : [
                { k: 'taxCents', label: 'TAX (¢)', color: '#00F0FF' },
                { k: 'discountCents', label: 'DISC (¢)', color: '#FF9500' },
                { k: 'totalCents', label: 'TOTAL (¢)', color: '#B8FF3C' },
                { k: 'shareCents', label: 'SHARE /', color: '#00F0FF' },
                { k: 'leftoverCents', label: 'LEFT %', color: '#FF9500' },
                { k: 'exactShare', label: 'EXACT (double)', color: '#B8FF3C' },
              ];

        const cols = contentW >= 280 ? 3 : 2;
        const rows = Math.ceil(cards.length / cols);
        const gapX = w < 430 ? 6 : 10;
        const gapY = h < 320 ? 8 : 14;
        const startY = Math.max(68, (h - rows * 76) / 2 + 12);
        const cardW = (contentW - (cols - 1) * gapX) / cols;
        const cardH = Math.min(92, Math.max(48, (h - startY - 30 - (rows - 1) * gapY) / rows));

        cards.forEach((c, idx) => {
          const row = Math.floor(idx / cols);
          const col = idx % cols;
          const cx = contentLeft + col * (cardW + gapX);
          const cy = startY + row * (cardH + gapY);
          const val = locals[c.k];
          const hot = p.activeFrame?.changedVar === c.k;

          ctx.fillStyle = hot ? 'rgba(255, 149, 0, 0.16)' : 'rgba(11, 20, 32, 0.92)';
          ctx.fillRect(cx, cy, cardW, cardH);
          ctx.strokeStyle = hot ? '#FF9500' : c.color;
          ctx.lineWidth = hot ? 2.4 : 1.4;
          ctx.strokeRect(cx, cy, cardW, cardH);

          ctx.fillStyle = c.color;
          ctx.font = `700 ${cardW < 95 ? 8.5 : 10.5}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'left';
          ctx.fillText(c.label, cx + 8, cy + 18);

          ctx.fillStyle = '#E8F4F2';
          ctx.font = `700 ${cardW < 95 ? 15 : 20}px "JetBrains Mono", monospace`;
          ctx.fillText(val ? val.value.slice(0, 10) : '—', cx + 8, cy + cardH - 14);
        });

        if (p.mode === 'titan' && w >= 560) {
          const tx = w - 36;
          const ty = 38;
          for (let s = 0; s < p.bossShields; s++) {
            const cracked = s < p.brokenShields;
            ctx.beginPath();
            ctx.arc(tx, ty, 11 + s * 4, 0, Math.PI * 2);
            ctx.strokeStyle = cracked ? 'rgba(184, 255, 60, 0.4)' : '#FF2A5F';
            ctx.lineWidth = cracked ? 1.2 : 2;
            ctx.stroke();
          }
          ctx.fillStyle = p.brokenShields >= p.bossShields ? '#B8FF3C' : '#FF2A5F';
          ctx.font = '700 8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('TITAN', tx, ty + 3);
        }
      } else {
        // Cargo Dock Visualization (Recon or Splitter)
        const totalUnits = p.mode === 'splitter' ? Number(locals.tokens?.value ?? 17) : p.units;
        const numSquads = p.mode === 'splitter' ? Math.max(1, Number(locals.squads?.value ?? 5)) : p.squads;
        const showAssigned =
          p.mode === 'recon'
            ? p.distributed
            : locals.perSquad !== undefined || locals.leftovers !== undefined;
        const each =
          p.mode === 'splitter' && locals.perSquad
            ? Number(locals.perSquad.value)
            : Math.floor(totalUnits / numSquads);
        const rem =
          p.mode === 'splitter' && locals.leftovers
            ? Number(locals.leftovers.value)
            : totalUnits % numSquads;

        const bayStart = contentLeft;
        const bayAreaW = contentW;
        const slotCount = numSquads + 1;
        const gap = w < 430 ? 4 : 8;
        const slotW = Math.min(88, Math.max(24, (bayAreaW - (slotCount - 1) * gap) / slotCount));
        const usedW = slotCount * slotW + (slotCount - 1) * gap;
        const alignedStart = bayStart + Math.max(0, (bayAreaW - usedW) / 2);

        const ribbonY = Math.max(66, h * 0.18);
        const sy = ribbonY + 46;
        const bayH = Math.min(168, Math.max(96, h - sy - 28));

        // Top summary ribbon
        ctx.fillStyle = 'rgba(6, 11, 18, 0.9)';
        ctx.fillRect(alignedStart, ribbonY, usedW, 34);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
        ctx.strokeRect(alignedStart, ribbonY, usedW, 34);
        ctx.fillStyle = '#E8F4F2';
        ctx.font = `700 ${w < 430 ? 10 : 12.5}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        const exactTxt = showAssigned
          ? `EXACT = ${(totalUnits / numSquads).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`
          : `${totalUnits} CRATES → ${numSquads} SQUADS`;
        ctx.fillText(exactTxt, alignedStart + usedW / 2, ribbonY + 21);

        // Delivery line from BYTE arm to bays
        ctx.strokeStyle = showAssigned ? 'rgba(184, 255, 60, 0.38)' : 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(byte.emitterX, byte.emitterY);
        ctx.lineTo(alignedStart, sy + bayH * 0.35);
        ctx.stroke();

        for (let i = 0; i < numSquads; i++) {
          const sx = alignedStart + i * (slotW + gap);
          ctx.fillStyle = 'rgba(11, 20, 32, 0.92)';
          ctx.fillRect(sx, sy, slotW, bayH);
          ctx.strokeStyle = showAssigned ? '#B8FF3C' : 'rgba(0, 240, 255, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(sx, sy, slotW, bayH);

          ctx.fillStyle = '#00F0FF';
          ctx.font = `700 ${slotW < 38 ? 8 : 9.5}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(`SQ-${i + 1}`, sx + slotW / 2, sy + 16);

          if (showAssigned) {
            const crates = Math.min(12, Math.max(0, each));
            const perRow = slotW < 42 ? 2 : 3;
            const boxSz = slotW < 42 ? 7 : Math.min(12, (slotW - 18) / perRow);
            for (let c = 0; c < crates; c++) {
              const col = c % perRow;
              const row = Math.floor(c / perRow);
              ctx.fillStyle = '#FFD166';
              ctx.fillRect(
                sx + 8 + col * (boxSz + 3),
                sy + 28 + row * (boxSz + 4),
                boxSz,
                Math.max(6, boxSz - 2),
              );
            }
            ctx.fillStyle = '#B8FF3C';
            ctx.font = `700 ${slotW < 38 ? 13 : 16}px "JetBrains Mono", monospace`;
            ctx.fillText(`${each}`, sx + slotW / 2, sy + bayH - 12);
          } else {
            ctx.fillStyle = '#7C9BB0';
            ctx.font = '700 16px "JetBrains Mono", monospace';
            ctx.fillText('?', sx + slotW / 2, sy + bayH * 0.56);
          }
        }

        // Remainder bin (%)
        const rx = alignedStart + numSquads * (slotW + gap);
        ctx.fillStyle = 'rgba(255, 149, 0, 0.12)';
        ctx.fillRect(rx, sy, slotW, bayH);
        ctx.strokeStyle = '#FF9500';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(rx, sy, slotW, bayH);
        ctx.fillStyle = '#FF9500';
        ctx.font = `700 ${slotW < 38 ? 8 : 9.5}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('LEFT %', rx + slotW / 2, sy + 16);
        if (showAssigned) {
          const perRow = slotW < 42 ? 2 : 3;
          const boxSz = slotW < 42 ? 7 : Math.min(12, (slotW - 18) / perRow);
          for (let c = 0; c < Math.min(9, Math.max(0, rem)); c++) {
            const col = c % perRow;
            const row = Math.floor(c / perRow);
            ctx.fillStyle = '#FF9500';
            ctx.fillRect(
              rx + 8 + col * (boxSz + 3),
              sy + 28 + row * (boxSz + 4),
              boxSz,
              Math.max(6, boxSz - 2),
            );
          }
          ctx.fillStyle = '#FFD166';
          ctx.font = `700 ${slotW < 38 ? 13 : 16}px "JetBrains Mono", monospace`;
          ctx.fillText(`${rem}`, rx + slotW / 2, sy + bayH - 12);
        }
      }

      // Sparks
      particlesRef.current = particlesRef.current.filter((pt) => {
        pt.life -= dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        if (pt.life <= 0) return false;
        ctx.globalAlpha = Math.max(0, pt.life);
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x, pt.y, 3, 3);
        return true;
      });
      ctx.globalAlpha = 1;

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
      <canvas ref={canvasRef} className="stage-canvas" aria-label="Neon market cargo dock arena" />
      <div className="stage-hud-overlay" style={{ justifyContent: 'flex-start' }}>
        <span className="tac-tag cyan">NEON MARKET DOCK</span>
        {mode === 'titan' && (
          <span className={`tac-tag ${brokenShields >= bossShields ? 'lime' : 'crimson'}`}>
            TITAN SHIELDS: {Math.max(0, bossShields - brokenShields)} / {bossShields}
          </span>
        )}
      </div>
    </div>
  );
};
