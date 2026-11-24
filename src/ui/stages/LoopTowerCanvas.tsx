import React, { useEffect, useRef } from 'react';
import { TraceFrame } from '../../engine/vm';
import { drawArenaAtmosphere, drawByteHero } from './drawByteHero';

export interface LoopTowerCanvasProps {
  mode: 'recon' | 'battle';
  chargeValue: number;
  targetValue: number;
  roundCount: number;
  activeFrame?: TraceFrame | null;
  bossShields?: number;
  brokenShields?: number;
  status?: 'idle' | 'ok' | 'error';
  pulseKey?: number;
}

export const LoopTowerCanvas: React.FC<LoopTowerCanvasProps> = ({
  mode,
  chargeValue,
  targetValue,
  roundCount,
  activeFrame = null,
  bossShields = 3,
  brokenShields = 0,
  status = 'idle',
  pulseKey = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({
    mode,
    chargeValue,
    targetValue,
    roundCount,
    activeFrame,
    bossShields,
    brokenShields,
    status,
  });
  propsRef.current = {
    mode,
    chargeValue,
    targetValue,
    roundCount,
    activeFrame,
    bossShields,
    brokenShields,
    status,
  };

  const arcFlashRef = useRef(0);
  const byteImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = './assets/byte-unit.png';
    img.onload = () => {
      byteImgRef.current = img;
    };
  }, []);

  useEffect(() => {
    if (pulseKey > 0) arcFlashRef.current = 1;
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
      arcFlashRef.current = Math.max(0, arcFlashRef.current - dt * 1.4);

      ctx.save();
      ctx.scale(dpr, dpr);

      drawArenaAtmosphere(ctx, w, h, p.status === 'error' ? '#FF2A5F' : '#00F0FF');

      // Live locals override if stepping through a trace
      const locals = p.activeFrame?.locals ?? {};
      const chargeSlot = locals.charge ?? locals.start;
      const liveCharge =
        chargeSlot !== undefined ? Number(chargeSlot.value) : p.chargeValue;
      const liveTarget =
        locals.target !== undefined ? Number(locals.target.value) : p.targetValue;
      const liveCount =
        locals.count !== undefined
          ? Number(locals.count.value)
          : locals.i !== undefined
            ? Number(locals.i.value)
            : p.roundCount;

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
        w >= 430 ? 'UNIT-01 // CHARGER' : undefined,
      );

      const contentLeft = byte.rightEdge + (w < 430 ? 8 : 14);
      const contentRight = w - (w < 430 ? 10 : 16);
      const contentW = Math.max(150, contentRight - contentLeft);

      // Vertical Plasma Capacitor Tower scaled cleanly inside Right Zone
      const towerW = Math.min(138, Math.max(58, contentW * 0.36));
      const towerX = contentLeft + Math.max(8, contentW * 0.06);
      const towerTop = Math.max(66, h * 0.16);
      const towerH = Math.max(110, h - towerTop - 30);
      const maxScale = Math.max(20, liveTarget * 1.25, liveCharge);
      const fillRatio = Math.max(0, Math.min(1, liveCharge / maxScale));
      const targetRatio = Math.max(0, Math.min(1, liveTarget / maxScale));

      // Lightning arc from BYTE arm to Tower
      if (arcFlashRef.current > 0.05 || p.activeFrame?.kind === 'loop') {
        ctx.strokeStyle = p.status === 'error' ? '#FF2A5F' : '#00F0FF';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(byte.emitterX, byte.emitterY);
        ctx.lineTo((byte.emitterX + towerX) / 2, byte.emitterY - 14 + Math.sin(t * 30) * 6);
        ctx.lineTo(towerX, towerTop + towerH * (1 - fillRatio));
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.22)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(byte.emitterX, byte.emitterY);
        ctx.lineTo(towerX, towerTop + towerH * (1 - fillRatio));
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(11, 20, 32, 0.94)';
      ctx.fillRect(towerX, towerTop, towerW, towerH);
      ctx.strokeStyle = p.status === 'error' ? '#FF2A5F' : '#00F0FF';
      ctx.lineWidth = 2;
      ctx.strokeRect(towerX, towerTop, towerW, towerH);

      // Plasma Fill
      const fillH = towerH * fillRatio;
      const fillColor =
        p.status === 'error' || liveCharge < 0
          ? '#FF2A5F'
          : liveCharge >= liveTarget
            ? '#B8FF3C'
            : '#00F0FF';
      const grad = ctx.createLinearGradient(0, towerTop + towerH - fillH, 0, towerTop + towerH);
      grad.addColorStop(0, fillColor);
      grad.addColorStop(1, 'rgba(0, 240, 255, 0.25)');
      ctx.fillStyle = grad;
      ctx.fillRect(towerX + 3, towerTop + towerH - fillH, towerW - 6, Math.max(0, fillH));

      // Target Threshold Line + clean pill centered on tower
      const targetY = towerTop + towerH * (1 - targetRatio);
      ctx.strokeStyle = '#FF9500';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(towerX - 10, targetY);
      ctx.lineTo(towerX + towerW + 10, targetY);
      ctx.stroke();
      ctx.setLineDash([]);

      const tagW = Math.min(towerW + 14, 96);
      ctx.fillStyle = 'rgba(6, 11, 18, 0.92)';
      ctx.fillRect(towerX + towerW / 2 - tagW / 2, targetY - 19, tagW, 15);
      ctx.fillStyle = '#FFB84D';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`TARGET ${liveTarget}`, towerX + towerW / 2, targetY - 8);

      // Right Telemetry Readout Box
      const infoX = towerX + towerW + (w < 430 ? 10 : 20);
      const infoW = Math.max(96, contentRight - infoX);
      const infoH = Math.min(136, Math.max(106, towerH * 0.56));
      const infoY = towerTop + (towerH - infoH) / 2;
      ctx.fillStyle = 'rgba(6, 11, 18, 0.92)';
      ctx.fillRect(infoX, infoY, infoW, infoH);
      ctx.strokeStyle = p.status === 'error' ? '#FF2A5F' : 'rgba(0, 240, 255, 0.45)';
      ctx.strokeRect(infoX, infoY, infoW, infoH);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#7C9BB0';
      ctx.font = `700 ${infoW < 115 ? 8.5 : 10}px "JetBrains Mono", monospace`;
      ctx.fillText('CHARGE LEVEL', infoX + 10, infoY + 22);
      ctx.fillStyle = liveCharge < 0 ? '#FF2A5F' : liveCharge >= liveTarget ? '#B8FF3C' : '#00F0FF';
      ctx.font = `700 ${infoW < 115 ? 22 : 28}px "JetBrains Mono", monospace`;
      ctx.fillText(String(liveCharge), infoX + 10, infoY + 54);

      ctx.fillStyle = '#7C9BB0';
      ctx.font = `700 ${infoW < 115 ? 9 : 10.5}px "JetBrains Mono", monospace`;
      ctx.fillText(`ITERATIONS: ${liveCount}`, infoX + 10, infoY + infoH - 34);
      ctx.fillStyle = p.status === 'error' ? '#FF6B90' : '#B8FF3C';
      ctx.fillText(
        p.status === 'error' ? 'FUSE BLOWN!' : liveCharge >= liveTarget ? 'TARGET REACHED' : 'CHARGING',
        infoX + 10,
        infoY + infoH - 14,
      );

      // Boss Shield Dome (desktop)
      if (p.mode === 'battle' && w >= 560) {
        const bxBoss = w - 36;
        const byBoss = 38;
        for (let s = 0; s < p.bossShields; s++) {
          const broken = s < p.brokenShields;
          ctx.beginPath();
          ctx.arc(bxBoss, byBoss, 11 + s * 4, 0, Math.PI * 2);
          ctx.strokeStyle = broken ? 'rgba(184, 255, 60, 0.4)' : '#FF2A5F';
          ctx.lineWidth = broken ? 1.2 : 2;
          ctx.stroke();
        }
        ctx.fillStyle = p.brokenShields >= p.bossShields ? '#B8FF3C' : '#FF2A5F';
        ctx.font = '700 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('COIL', bxBoss, byBoss + 3);
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
      <canvas ref={canvasRef} className="stage-canvas" aria-label="Surge capacitor tower arena" />
      <div className="stage-hud-overlay" style={{ justifyContent: 'flex-start' }}>
        <span className="tac-tag cyan">SURGE CAPACITOR RIG</span>
        {mode === 'battle' && (
          <span className={`tac-tag ${brokenShields >= bossShields ? 'lime' : 'crimson'}`}>
            COIL SHIELDS: {Math.max(0, bossShields - brokenShields)} / {bossShields}
          </span>
        )}
      </div>
    </div>
  );
};
