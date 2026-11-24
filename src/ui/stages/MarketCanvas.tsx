import React, { useEffect, useRef } from 'react';
import { TraceFrame } from '../../engine/vm';

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

      // Neon Market Dusk Background
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0c0b1c');
      bg.addColorStop(1, '#060c14');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = 'rgba(255, 149, 0, 0.06)';
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

      // Neon market lanterns at top
      for (let l = 0; l < 6; l++) {
        const lx = w * (0.24 + l * 0.11);
        const ly = 54 + Math.sin(t * 2 + l) * 2;
        ctx.fillStyle = l % 2 === 0 ? '#FF9500' : '#00F0FF';
        ctx.beginPath();
        ctx.arc(lx, ly, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // BYTE Hover Unit
      const bx = w * 0.14;
      const by = h * 0.56 + Math.sin(t * 2.3) * 5;
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, 38, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.fill();
      ctx.strokeStyle = p.status === 'error' ? '#FF2A5F' : '#00F0FF';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.clip();
      if (byteImgRef.current) {
        ctx.drawImage(byteImgRef.current, bx - 38, by - 38, 76, 76);
      }
      ctx.restore();
      ctx.fillStyle = '#00F0FF';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BYTE // LEDGER', bx, by + 51);

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

        const cols = 3;
        const startX = w * 0.3;
        const cardW = (w * 0.66) / cols - 8;
        const cardH = 64;
        cards.forEach((c, idx) => {
          const row = Math.floor(idx / cols);
          const col = idx % cols;
          const cx = startX + col * (cardW + 10);
          const cy = 92 + row * (cardH + 14);
          const val = locals[c.k];
          const hot = p.activeFrame?.changedVar === c.k;

          ctx.fillStyle = hot ? 'rgba(255, 149, 0, 0.16)' : 'rgba(11, 20, 32, 0.92)';
          ctx.fillRect(cx, cy, cardW, cardH);
          ctx.strokeStyle = hot ? '#FF9500' : c.color;
          ctx.lineWidth = hot ? 2.4 : 1.4;
          ctx.strokeRect(cx, cy, cardW, cardH);

          ctx.fillStyle = c.color;
          ctx.font = '700 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(c.label, cx + 10, cy + 18);

          ctx.fillStyle = '#E8F4F2';
          ctx.font = '700 18px "JetBrains Mono", monospace';
          ctx.fillText(val ? val.value.slice(0, 10) : '—', cx + 10, cy + 44);
        });

        if (p.mode === 'titan') {
          const tx = w * 0.89;
          const ty = 52;
          for (let s = 0; s < p.bossShields; s++) {
            const cracked = s < p.brokenShields;
            ctx.beginPath();
            ctx.arc(tx, ty, 15 + s * 6, 0, Math.PI * 2);
            ctx.strokeStyle = cracked ? 'rgba(184, 255, 60, 0.4)' : '#FF2A5F';
            ctx.lineWidth = cracked ? 1.2 : 2.2;
            ctx.stroke();
          }
          ctx.fillStyle = p.brokenShields >= p.bossShields ? '#B8FF3C' : '#FF2A5F';
          ctx.font = '700 9px "JetBrains Mono", monospace';
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

        const bayStart = w * 0.29;
        const bayAreaW = w * 0.67;
        const slotCount = numSquads + 1;
        const slotW = Math.min(82, bayAreaW / slotCount - 8);

        for (let i = 0; i < numSquads; i++) {
          const sx = bayStart + i * (slotW + 8);
          const sy = h * 0.42;
          ctx.fillStyle = 'rgba(11, 20, 32, 0.92)';
          ctx.fillRect(sx, sy, slotW, 118);
          ctx.strokeStyle = showAssigned ? '#B8FF3C' : 'rgba(0, 240, 255, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(sx, sy, slotW, 118);

          ctx.fillStyle = '#00F0FF';
          ctx.font = '700 9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`SQ-${i + 1}`, sx + slotW / 2, sy + 16);

          if (showAssigned) {
            const crates = Math.min(12, Math.max(0, each));
            for (let c = 0; c < crates; c++) {
              const col = c % 3;
              const row = Math.floor(c / 3);
              ctx.fillStyle = '#FFD166';
              ctx.fillRect(sx + 10 + col * 16, sy + 28 + row * 14, 12, 10);
            }
            ctx.fillStyle = '#B8FF3C';
            ctx.font = '700 14px "JetBrains Mono", monospace';
            ctx.fillText(`${each}`, sx + slotW / 2, sy + 106);
          } else {
            ctx.fillStyle = '#7C9BB0';
            ctx.font = '700 15px "JetBrains Mono", monospace';
            ctx.fillText('?', sx + slotW / 2, sy + 70);
          }
        }

        // Remainder bin (%)
        const rx = bayStart + numSquads * (slotW + 8);
        const ry = h * 0.42;
        ctx.fillStyle = 'rgba(255, 149, 0, 0.12)';
        ctx.fillRect(rx, ry, slotW, 118);
        ctx.strokeStyle = '#FF9500';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(rx, ry, slotW, 118);
        ctx.fillStyle = '#FF9500';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('LEFT %', rx + slotW / 2, ry + 16);
        if (showAssigned) {
          for (let c = 0; c < Math.min(9, Math.max(0, rem)); c++) {
            const col = c % 3;
            const row = Math.floor(c / 3);
            ctx.fillStyle = '#FF9500';
            ctx.fillRect(rx + 10 + col * 16, ry + 28 + row * 14, 12, 10);
          }
          ctx.fillStyle = '#FFD166';
          ctx.font = '700 14px "JetBrains Mono", monospace';
          ctx.fillText(`${rem}`, rx + slotW / 2, ry + 106);
        }

        // Top summary ribbon
        ctx.fillStyle = 'rgba(6, 11, 18, 0.9)';
        ctx.fillRect(bayStart, 82, bayAreaW - 10, 32);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
        ctx.strokeRect(bayStart, 82, bayAreaW - 10, 32);
        ctx.fillStyle = '#E8F4F2';
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        const exactTxt = showAssigned
          ? `EXACT = ${(totalUnits / numSquads).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`
          : `${totalUnits} CRATES → ${numSquads} SQUADS`;
        ctx.fillText(exactTxt, bayStart + (bayAreaW - 10) / 2, 102);
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
