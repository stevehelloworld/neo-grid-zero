import React, { useEffect, useRef } from 'react';
import { TraceFrame } from '../../engine/vm';

export interface ReactorCanvasProps {
  mode: 'recon' | 'swap' | 'reactor' | 'trace';
  energy?: number;
  used?: number;
  stored?: number;
  activeFrame?: TraceFrame | null;
  bossShields?: number;
  brokenShields?: number;
  status?: 'idle' | 'ok' | 'error' | 'stale';
  pulseKey?: number;
  labelBadge?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export const ReactorCanvas: React.FC<ReactorCanvasProps> = ({
  mode,
  energy = 100,
  used = 35,
  stored = 65,
  activeFrame = null,
  bossShields = 3,
  brokenShields = 0,
  status = 'idle',
  pulseKey = 0,
  labelBadge,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({
    mode,
    energy,
    used,
    stored,
    activeFrame,
    bossShields,
    brokenShields,
    status,
    labelBadge,
  });
  propsRef.current = {
    mode,
    energy,
    used,
    stored,
    activeFrame,
    bossShields,
    brokenShields,
    status,
    labelBadge,
  };

  const particlesRef = useRef<Particle[]>([]);
  const pulseTimerRef = useRef(0);
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
    pulseTimerRef.current = 1.0;
    const canvas = canvasRef.current;
    const w = canvas ? canvas.clientWidth : 600;
    const h = canvas ? canvas.clientHeight : 340;
    const color =
      propsRef.current.status === 'error'
        ? '#FF2A5F'
        : propsRef.current.status === 'ok'
          ? '#B8FF3C'
          : '#00F0FF';
    for (let i = 0; i < 26; i++) {
      const ang = (Math.PI * 2 * i) / 26 + Math.random() * 0.25;
      const spd = 60 + Math.random() * 140;
      particlesRef.current.push({
        x: w * 0.56,
        y: h * 0.48,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.75 + Math.random() * 0.35,
        maxLife: 1.0,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }, [pulseKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let lastTime = performance.now();

    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.max(300, Math.round(rect.width * dpr));
      const targetH = Math.max(200, Math.round(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);
    syncSize();

    const drawHex = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const t = now / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const p = propsRef.current;

      pulseTimerRef.current = Math.max(0, pulseTimerRef.current - dt * 1.4);

      ctx.save();
      ctx.scale(dpr, dpr);

      // Background void + subtle tactical grid
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#07111e');
      bgGrad.addColorStop(1, '#040810');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

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

      // Aether-9 skyline silhouette at bottom
      const physical = p.energy - p.used;
      const isSynced = p.mode === 'recon' ? p.stored === physical : p.status === 'ok';
      const towerColor =
        p.status === 'error'
          ? '#FF2A5F'
          : isSynced
            ? '#B8FF3C'
            : p.mode === 'recon' && p.stored !== physical
              ? '#FF9500'
              : '#00F0FF';

      const buildings = [
        [0.04, 52, 26],
        [0.11, 78, 28],
        [0.19, 44, 24],
        [0.27, 68, 30],
        [0.72, 64, 28],
        [0.8, 86, 30],
        [0.89, 54, 26],
      ];
      buildings.forEach(([xr, bh, bw], idx) => {
        const bx = w * xr;
        const by = h - bh;
        ctx.fillStyle = '#0b1826';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = 'rgba(124, 155, 176, 0.2)';
        ctx.strokeRect(bx, by, bw, bh);
        const lit = isSynced || (p.mode === 'recon' && idx % 2 === 0 && physical >= 65);
        ctx.fillStyle = lit ? towerColor : 'rgba(255, 149, 0, 0.35)';
        for (let wy = by + 8; wy < h - 10; wy += 12) {
          ctx.fillRect(bx + 5, wy, 5, 5);
          ctx.fillRect(bx + bw - 10, wy, 5, 5);
        }
      });

      // Floor conduit beam
      ctx.strokeStyle =
        p.status === 'error' ? 'rgba(255, 42, 95, 0.6)' : 'rgba(0, 240, 255, 0.32)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h - 18);
      ctx.lineTo(w, h - 18);
      ctx.stroke();

      // UNIT-01 BYTE floating hover mecha on left
      const byteX = w * 0.16;
      const byteY = h * 0.48 + Math.sin(t * 2.4) * 6;
      ctx.save();
      ctx.beginPath();
      ctx.arc(byteX, byteY, 44, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.fill();
      ctx.strokeStyle = p.status === 'error' ? '#FF2A5F' : '#00F0FF';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.clip();
      if (byteImgRef.current) {
        ctx.drawImage(byteImgRef.current, byteX - 44, byteY - 44, 88, 88);
      } else {
        ctx.fillStyle = '#E8F4F2';
        ctx.fillRect(byteX - 16, byteY - 18, 32, 34);
        ctx.fillStyle = '#00F0FF';
        ctx.fillRect(byteX - 10, byteY - 10, 20, 8);
      }
      ctx.restore();

      ctx.fillStyle = '#00F0FF';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('UNIT-01 // BYTE', byteX, byteY + 58);

      // Mode-specific main centerpiece
      if (p.mode === 'swap') {
        const locals = p.activeFrame?.locals ?? {};
        const changed = p.activeFrame?.changedVar;
        const slots = [
          { key: 'left', x: w * 0.44, y: h * 0.46, color: '#00F0FF' },
          { key: 'temp', x: w * 0.62, y: h * 0.29, color: '#FF9500' },
          { key: 'right', x: w * 0.8, y: h * 0.46, color: '#B8FF3C' },
        ];

        // Conduit triangle
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(slots[0].x, slots[0].y);
        ctx.lineTo(slots[1].x, slots[1].y);
        ctx.lineTo(slots[2].x, slots[2].y);
        ctx.lineTo(slots[0].x, slots[0].y);
        ctx.stroke();

        // Active transfer pulse arc
        if (changed && ['left', 'right', 'temp'].includes(changed)) {
          const targetSlot = slots.find((s) => s.key === changed)!;
          ctx.strokeStyle = p.status === 'error' ? '#FF2A5F' : '#FF9500';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(byteX + 42, byteY);
          ctx.quadraticCurveTo(w * 0.4, h * 0.18, targetSlot.x, targetSlot.y);
          ctx.stroke();
        }

        slots.forEach((slot) => {
          const snap = locals[slot.key];
          const isHot = changed === slot.key;
          const r = isHot ? 36 : 32;
          ctx.save();
          ctx.beginPath();
          ctx.arc(slot.x, slot.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isHot ? 'rgba(255, 149, 0, 0.2)' : 'rgba(11, 20, 32, 0.94)';
          ctx.fill();
          ctx.strokeStyle = isHot ? '#FF9500' : slot.color;
          ctx.lineWidth = isHot ? 2.8 : 1.8;
          ctx.stroke();

          ctx.fillStyle = slot.color;
          ctx.font = '700 11px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(slot.key.toUpperCase(), slot.x, slot.y - 11);

          ctx.fillStyle = '#E8F4F2';
          ctx.font = '700 20px "JetBrains Mono", monospace';
          ctx.fillText(snap ? snap.value : '—', slot.x, slot.y + 12);
          ctx.restore();
        });
      } else {
        // Central Reactor / Core
        const coreX = w * 0.56;
        const coreY = h * 0.46;
        const locals = p.activeFrame?.locals ?? {};
        const coreEnergy =
          p.mode === 'recon'
            ? p.energy
            : Number(locals.energy?.value ?? p.energy);
        const coreUsed =
          p.mode === 'recon'
            ? p.used
            : Number(locals.used?.value ?? p.used);
        const corePhysical = coreEnergy - coreUsed;
        const coreStored =
          p.mode === 'recon'
            ? p.stored
            : locals.remaining?.value ?? '—';

        // Energy beam from BYTE to Reactor when pulse active or synced
        if (pulseTimerRef.current > 0.05 || p.status === 'ok') {
          ctx.strokeStyle =
            p.status === 'error'
              ? `rgba(255, 42, 95, ${0.45 + pulseTimerRef.current * 0.5})`
              : `rgba(0, 240, 255, ${0.35 + pulseTimerRef.current * 0.6})`;
          ctx.lineWidth = 2 + pulseTimerRef.current * 3;
          ctx.beginPath();
          ctx.moveTo(byteX + 44, byteY);
          ctx.lineTo(coreX - 46, coreY);
          ctx.stroke();
        }

        // Boss shield hex rings (if in reactor boss mode)
        if (p.mode === 'reactor') {
          for (let s = 0; s < p.bossShields; s++) {
            const cracked = s < p.brokenShields;
            const radius = 58 + s * 11;
            ctx.save();
            ctx.translate(coreX, coreY);
            ctx.rotate((cracked ? 0.12 : t * (0.35 + s * 0.14)) * (s % 2 ? -1 : 1));
            drawHex(0, 0, radius);
            ctx.strokeStyle = cracked
              ? 'rgba(184, 255, 60, 0.7)'
              : p.status === 'error'
                ? 'rgba(255, 42, 95, 0.85)'
                : 'rgba(255, 149, 0, 0.55)';
            ctx.lineWidth = cracked ? 1.5 : 2.2;
            if (cracked) ctx.setLineDash([6, 6]);
            ctx.stroke();
            ctx.restore();
          }
        }

        // Core circle
        const coreGlow = p.status === 'error' ? '#FF2A5F' : isSynced ? '#B8FF3C' : '#00F0FF';
        const rad = ctx.createRadialGradient(coreX, coreY, 6, coreX, coreY, 54);
        rad.addColorStop(0, coreGlow);
        rad.addColorStop(0.5, 'rgba(0, 240, 255, 0.16)');
        rad.addColorStop(1, 'transparent');
        ctx.fillStyle = rad;
        ctx.beginPath();
        ctx.arc(coreX, coreY, 54, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(coreX, coreY, 34, 0, Math.PI * 2);
        ctx.fillStyle = '#091522';
        ctx.fill();
        ctx.strokeStyle = coreGlow;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#E8F4F2';
        ctx.font = '700 20px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${corePhysical}`, coreX, coreY + 4);
        ctx.fillStyle = '#7C9BB0';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillText('LIVE MW', coreX, coreY + 18);

        // Right-side Holographic Memory Core Pod
        const memX = w * 0.83;
        const memY = h * 0.46;
        const stale =
          p.mode === 'recon'
            ? p.stored !== corePhysical
            : p.activeFrame?.locals.remaining !== undefined &&
              Number(p.activeFrame.locals.remaining.value) !== corePhysical;

        ctx.strokeStyle = stale ? '#FF9500' : '#B8FF3C';
        ctx.lineWidth = 1.6;
        ctx.setLineDash(stale ? [5, 5] : []);
        ctx.beginPath();
        ctx.moveTo(coreX + 36, coreY);
        ctx.lineTo(memX - 48, memY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(11, 20, 32, 0.92)';
        ctx.strokeStyle = stale ? '#FF9500' : '#00F0FF';
        ctx.lineWidth = 2;
        ctx.fillRect(memX - 48, memY - 40, 96, 80);
        ctx.strokeRect(memX - 48, memY - 40, 96, 80);

        ctx.fillStyle = stale ? '#FF9500' : '#00F0FF';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.fillText('MEMORY: remaining', memX, memY - 21);

        ctx.fillStyle = stale ? '#FFB84D' : '#B8FF3C';
        ctx.font = '700 26px "JetBrains Mono", monospace';
        ctx.fillText(String(coreStored), memX, memY + 11);

        ctx.fillStyle = stale ? '#FF2A5F' : '#B8FF3C';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.fillText(stale ? 'STALE SNAPSHOT!' : 'SYNCED', memX, memY + 29);

        if (locals.initialRemaining) {
          ctx.fillStyle = 'rgba(0, 240, 255, 0.14)';
          ctx.fillRect(memX - 48, memY + 46, 96, 22);
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
          ctx.strokeRect(memX - 48, memY + 46, 96, 22);
          ctx.fillStyle = '#E8F4F2';
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.fillText(`initSnap: ${locals.initialRemaining.value}`, memX, memY + 61);
        }
      }

      // Particles update & draw
      particlesRef.current = particlesRef.current.filter((pt) => {
        pt.life -= dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= 0.95;
        pt.vy *= 0.95;
        if (pt.life <= 0) return false;
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
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
      <canvas ref={canvasRef} className="stage-canvas" aria-label="Reactor tactical arena" />
      <div className="stage-hud-overlay">
        <span className="tac-tag cyan">
          {labelBadge ?? (mode === 'swap' ? 'CHANNEL BUFFER ARENA' : 'AETHER-9 CORE ARENA')}
        </span>
        {mode === 'reactor' && (
          <span className={`tac-tag ${brokenShields >= bossShields ? 'lime' : 'crimson'}`}>
            BOSS SHIELDS: {Math.max(0, bossShields - brokenShields)} / {bossShields}
          </span>
        )}
      </div>
    </div>
  );
};
