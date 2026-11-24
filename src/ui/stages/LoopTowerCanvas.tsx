import React, { useEffect, useRef } from 'react';
import { TraceFrame } from '../../engine/vm';

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

      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#07111f');
      bg.addColorStop(1, '#040811');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      for (let gx = 0; gx < w; gx += 36) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }

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

      const bx = w * 0.16;
      const by = h * 0.56 + Math.sin(t * 2.5) * 5;
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, 38, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.fill();
      ctx.strokeStyle = p.status === 'error' ? '#FF2A5F' : '#00F0FF';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.clip();
      if (byteImgRef.current) ctx.drawImage(byteImgRef.current, bx - 38, by - 38, 76, 76);
      ctx.restore();

      ctx.fillStyle = '#00F0FF';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BYTE // CHARGER', bx, by + 51);

      // Vertical Plasma Capacitor Tower
      const towerX = w * 0.48;
      const towerW = 112;
      const towerTop = 76;
      const towerH = h - 118;
      const maxScale = Math.max(20, liveTarget * 1.25, liveCharge);
      const fillRatio = Math.max(0, Math.min(1, liveCharge / maxScale));
      const targetRatio = Math.max(0, Math.min(1, liveTarget / maxScale));

      // Lightning arc from BYTE to Tower
      if (arcFlashRef.current > 0.05 || p.activeFrame?.kind === 'loop') {
        ctx.strokeStyle = p.status === 'error' ? '#FF2A5F' : '#00F0FF';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(bx + 38, by);
        ctx.lineTo((bx + towerX) / 2, by - 14 + Math.sin(t * 30) * 6);
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

      // Target Threshold Line
      const targetY = towerTop + towerH * (1 - targetRatio);
      ctx.strokeStyle = '#FF9500';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(towerX - 18, targetY);
      ctx.lineTo(towerX + towerW + 18, targetY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#FFB84D';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`TARGET ${liveTarget}`, towerX + towerW + 22, targetY + 4);

      // Right Telemetry Readout Box
      const infoX = w * 0.72;
      ctx.fillStyle = 'rgba(6, 11, 18, 0.92)';
      ctx.fillRect(infoX, 120, 146, 118);
      ctx.strokeStyle = p.status === 'error' ? '#FF2A5F' : 'rgba(0, 240, 255, 0.45)';
      ctx.strokeRect(infoX, 120, 146, 118);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#7C9BB0';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.fillText('CHARGE LEVEL', infoX + 12, 142);
      ctx.fillStyle = liveCharge < 0 ? '#FF2A5F' : liveCharge >= liveTarget ? '#B8FF3C' : '#00F0FF';
      ctx.font = '700 26px "JetBrains Mono", monospace';
      ctx.fillText(String(liveCharge), infoX + 12, 172);

      ctx.fillStyle = '#7C9BB0';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.fillText(`ITERATIONS: ${liveCount}`, infoX + 12, 200);
      ctx.fillStyle = p.status === 'error' ? '#FF6B90' : '#B8FF3C';
      ctx.fillText(
        p.status === 'error' ? 'FUSE BLOWN!' : liveCharge >= liveTarget ? 'TARGET REACHED' : 'CHARGING',
        infoX + 12,
        222,
      );

      // Boss Shield Dome
      if (p.mode === 'battle') {
        const bxBoss = w * 0.9;
        const byBoss = 56;
        for (let s = 0; s < p.bossShields; s++) {
          const broken = s < p.brokenShields;
          ctx.beginPath();
          ctx.arc(bxBoss, byBoss, 15 + s * 6, 0, Math.PI * 2);
          ctx.strokeStyle = broken ? 'rgba(184, 255, 60, 0.4)' : '#FF2A5F';
          ctx.lineWidth = broken ? 1.2 : 2.2;
          ctx.stroke();
        }
        ctx.fillStyle = p.brokenShields >= p.bossShields ? '#B8FF3C' : '#FF2A5F';
        ctx.font = '700 9px "JetBrains Mono", monospace';
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
