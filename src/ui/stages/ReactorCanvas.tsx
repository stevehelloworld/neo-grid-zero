import React, { useEffect, useRef } from 'react';
import { TraceFrame } from '../../engine/vm';
import { drawArenaAtmosphere, drawByteHero } from './drawByteHero';

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

      drawArenaAtmosphere(ctx, w, h, p.status === 'error' ? '#FF2A5F' : '#00F0FF');

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
        [0.03, 52, 26],
        [0.11, 74, 28],
        [0.24, 46, 24],
        [0.72, 66, 28],
        [0.81, 88, 30],
        [0.9, 58, 26],
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
        for (let wy = by + 8; wy < h - 18; wy += 12) {
          ctx.fillRect(bx + 5, wy, 5, 5);
          ctx.fillRect(bx + bw - 10, wy, 5, 5);
        }
      });

      // UNIT-01 BYTE full-body transparent mecha hero on left
      const byteH =
        w >= 560
          ? Math.min(325, Math.max(185, h * 0.68))
          : w >= 430
            ? Math.min(198, Math.max(145, h * 0.55))
            : Math.min(144, Math.max(110, h * 0.52));
      const approxW = byteH * 0.845;
      const byteX = Math.max(approxW * 0.5 + 8, w * 0.16);
      const byteY = Math.max(byteH * 0.5 + 34, h * 0.52);
      const byte = drawByteHero(
        ctx,
        byteImgRef.current,
        byteX,
        byteY,
        byteH,
        t,
        p.status === 'stale' ? 'stale' : p.status,
        w >= 430 ? 'UNIT-01 // BYTE' : undefined,
      );

      const contentLeft = byte.rightEdge + (w < 430 ? 8 : 14);
      const contentRight = w - (w < 430 ? 10 : 16);
      const contentW = Math.max(150, contentRight - contentLeft);

      // Mode-specific main centerpiece
      if (p.mode === 'swap') {
        const locals = p.activeFrame?.locals ?? {};
        const changed = p.activeFrame?.changedVar;
        const baseR = Math.min(42, Math.max(24, contentW * 0.11));
        const slots = [
          { key: 'left', x: contentLeft + contentW * 0.18, y: h * 0.55, color: '#00F0FF' },
          { key: 'temp', x: contentLeft + contentW * 0.5, y: h * 0.28, color: '#FF9500' },
          { key: 'right', x: contentLeft + contentW * 0.82, y: h * 0.55, color: '#B8FF3C' },
        ];

        ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(slots[0].x, slots[0].y);
        ctx.lineTo(slots[1].x, slots[1].y);
        ctx.lineTo(slots[2].x, slots[2].y);
        ctx.lineTo(slots[0].x, slots[0].y);
        ctx.stroke();

        if (changed && ['left', 'right', 'temp'].includes(changed)) {
          const targetSlot = slots.find((s) => s.key === changed)!;
          ctx.strokeStyle = p.status === 'error' ? '#FF2A5F' : '#FF9500';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(byte.emitterX, byte.emitterY);
          ctx.quadraticCurveTo(contentLeft + contentW * 0.22, h * 0.18, targetSlot.x, targetSlot.y);
          ctx.stroke();
        }

        slots.forEach((slot) => {
          const snap = locals[slot.key];
          const isHot = changed === slot.key;
          const r = isHot ? baseR + 4 : baseR;
          ctx.save();
          ctx.beginPath();
          ctx.arc(slot.x, slot.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isHot ? 'rgba(255, 149, 0, 0.2)' : 'rgba(11, 20, 32, 0.94)';
          ctx.fill();
          ctx.strokeStyle = isHot ? '#FF9500' : slot.color;
          ctx.lineWidth = isHot ? 2.8 : 1.8;
          ctx.stroke();

          ctx.fillStyle = slot.color;
          ctx.font = `700 ${baseR < 28 ? 9 : 11}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(slot.key.toUpperCase(), slot.x, slot.y - baseR * 0.34);

          ctx.fillStyle = '#E8F4F2';
          ctx.font = `700 ${baseR < 28 ? 16 : 22}px "JetBrains Mono", monospace`;
          ctx.fillText(snap ? snap.value : '—', slot.x, slot.y + baseR * 0.34);
          ctx.restore();
        });
      } else {
        // Central Reactor / Core scaled to right zone
        const coreX = contentLeft + contentW * 0.33;
        const coreY = h * 0.49;
        const coreR = Math.min(46, Math.max(26, contentW * 0.12));
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

        // Energy beam from BYTE arm to Reactor
        ctx.strokeStyle =
          p.status === 'error'
            ? `rgba(255, 42, 95, ${0.45 + pulseTimerRef.current * 0.5})`
            : pulseTimerRef.current > 0.05 || p.status === 'ok'
              ? `rgba(0, 240, 255, ${0.45 + pulseTimerRef.current * 0.5})`
              : 'rgba(0, 240, 255, 0.24)';
        ctx.lineWidth = 2 + pulseTimerRef.current * 3;
        ctx.beginPath();
        ctx.moveTo(byte.emitterX, byte.emitterY);
        ctx.lineTo(coreX - coreR - 4, coreY);
        ctx.stroke();

        // Boss shield hex rings (if in reactor boss mode)
        if (p.mode === 'reactor') {
          for (let s = 0; s < p.bossShields; s++) {
            const cracked = s < p.brokenShields;
            const radius = coreR + 18 + s * (coreR < 32 ? 7 : 11);
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
        const rad = ctx.createRadialGradient(coreX, coreY, 6, coreX, coreY, coreR + 22);
        rad.addColorStop(0, coreGlow);
        rad.addColorStop(0.5, 'rgba(0, 240, 255, 0.16)');
        rad.addColorStop(1, 'transparent');
        ctx.fillStyle = rad;
        ctx.beginPath();
        ctx.arc(coreX, coreY, coreR + 22, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(coreX, coreY, coreR, 0, Math.PI * 2);
        ctx.fillStyle = '#091522';
        ctx.fill();
        ctx.strokeStyle = coreGlow;
        ctx.lineWidth = 2.6;
        ctx.stroke();

        ctx.fillStyle = '#E8F4F2';
        ctx.font = `700 ${coreR < 32 ? 16 : 22}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${corePhysical}`, coreX, coreY + 4);
        ctx.fillStyle = '#7C9BB0';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillText('LIVE MW', coreX, coreY + 18);

        // Right-side Holographic Memory Core Pod
        const podW = Math.min(136, Math.max(82, contentW * 0.38));
        const podH = Math.min(94, Math.max(70, h * 0.24));
        const memX = contentRight - podW / 2;
        const memY = h * 0.49;
        const stale =
          p.mode === 'recon'
            ? p.stored !== corePhysical
            : p.activeFrame?.locals.remaining !== undefined &&
              Number(p.activeFrame.locals.remaining.value) !== corePhysical;

        ctx.strokeStyle = stale ? '#FF9500' : '#B8FF3C';
        ctx.lineWidth = 1.6;
        ctx.setLineDash(stale ? [5, 5] : []);
        ctx.beginPath();
        ctx.moveTo(coreX + coreR + 2, coreY);
        ctx.lineTo(memX - podW / 2, memY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(11, 20, 32, 0.92)';
        ctx.strokeStyle = stale ? '#FF9500' : '#00F0FF';
        ctx.lineWidth = 2;
        ctx.fillRect(memX - podW / 2, memY - podH / 2, podW, podH);
        ctx.strokeRect(memX - podW / 2, memY - podH / 2, podW, podH);

        ctx.fillStyle = stale ? '#FF9500' : '#00F0FF';
        ctx.font = `700 ${podW < 95 ? 8 : 9.5}px "JetBrains Mono", monospace`;
        ctx.fillText(podW < 95 ? 'MEM: remaining' : 'MEMORY: remaining', memX, memY - podH * 0.24);

        ctx.fillStyle = stale ? '#FFB84D' : '#B8FF3C';
        ctx.font = `700 ${podW < 95 ? 22 : 28}px "JetBrains Mono", monospace`;
        ctx.fillText(String(coreStored), memX, memY + 10);

        ctx.fillStyle = stale ? '#FF2A5F' : '#B8FF3C';
        ctx.font = `700 ${podW < 95 ? 8 : 9.5}px "JetBrains Mono", monospace`;
        ctx.fillText(stale ? 'STALE SNAPSHOT!' : 'SYNCED', memX, memY + podH * 0.36);

        if (locals.initialRemaining) {
          ctx.fillStyle = 'rgba(0, 240, 255, 0.14)';
          ctx.fillRect(memX - podW / 2, memY + podH / 2 + 6, podW, 22);
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
          ctx.strokeRect(memX - podW / 2, memY + podH / 2 + 6, podW, 22);
          ctx.fillStyle = '#E8F4F2';
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.fillText(`initSnap: ${locals.initialRemaining.value}`, memX, memY + podH / 2 + 21);
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
