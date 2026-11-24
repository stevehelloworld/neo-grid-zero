import React, { useEffect, useRef } from 'react';
import { TraceFrame } from '../../engine/vm';
import { drawArenaAtmosphere, drawByteHero } from './drawByteHero';

export interface ActiveDroneVisual {
  callsign: string;
  age: number;
  trained: boolean;
  mentor: boolean;
  expected: 'CLEAR' | 'PRACTICE' | 'WAIT';
  actual: string;
  passed: boolean;
  flightKey: number;
}

export interface SentinelCanvasProps {
  mode: 'recon' | 'battle';
  activeDrone: ActiveDroneVisual | null;
  activeFrame?: TraceFrame | null;
  selectedGate?: 'CLEAR' | 'PRACTICE' | 'WAIT' | null;
  bossShields?: number;
  brokenShields?: number;
  scrubProgress?: number | null;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const LANE_RATIOS: Record<string, number> = {
  CLEAR: 0.3,
  PRACTICE: 0.56,
  WAIT: 0.82,
};

const LANE_COLORS: Record<string, string> = {
  CLEAR: '#B8FF3C',
  PRACTICE: '#00F0FF',
  WAIT: '#FF9500',
};

export const SentinelCanvas: React.FC<SentinelCanvasProps> = ({
  mode,
  activeDrone,
  activeFrame = null,
  selectedGate = null,
  bossShields = 3,
  brokenShields = 0,
  scrubProgress = null,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({
    mode,
    activeDrone,
    activeFrame,
    selectedGate,
    bossShields,
    brokenShields,
    scrubProgress,
  });
  propsRef.current = {
    mode,
    activeDrone,
    activeFrame,
    selectedGate,
    bossShields,
    brokenShields,
    scrubProgress,
  };

  const flightProgressRef = useRef(0);
  const lastFlightKeyRef = useRef(0);
  const sparksRef = useRef<Spark[]>([]);
  const crashSpawnedRef = useRef(false);
  const byteImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = './assets/byte-unit.png';
    img.onload = () => {
      byteImgRef.current = img;
    };
  }, []);

  useEffect(() => {
    if (!activeDrone) return;
    if (activeDrone.flightKey !== lastFlightKeyRef.current) {
      lastFlightKeyRef.current = activeDrone.flightKey;
      flightProgressRef.current = 0;
      crashSpawnedRef.current = false;
    }
  }, [activeDrone]);

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
      const targetW = Math.max(320, Math.round(rect.width * dpr));
      const targetH = Math.max(220, Math.round(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);
    syncSize();

    const spawnBurst = (bx: number, by: number, color: string) => {
      for (let i = 0; i < 24; i++) {
        const a = (Math.PI * 2 * i) / 24 + Math.random() * 0.2;
        const s = 50 + Math.random() * 140;
        sparksRef.current.push({
          x: bx,
          y: by,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 0.75 + Math.random() * 0.3,
          color,
        });
      }
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const t = now / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const p = propsRef.current;

      if (p.activeDrone) {
        if (p.scrubProgress !== null && p.scrubProgress !== undefined) {
          flightProgressRef.current = p.scrubProgress;
        } else {
          flightProgressRef.current = Math.min(1, flightProgressRef.current + dt * 0.85);
        }
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      drawArenaAtmosphere(
        ctx,
        w,
        h,
        p.activeDrone && !p.activeDrone.passed ? '#FF2A5F' : '#00F0FF',
      );

      const gateX = Math.max(w * 0.42, 128);
      const badgeW = Math.min(84, Math.max(60, w * 0.19));
      const badgeX = w - badgeW - 12;
      const targetLane =
        p.activeDrone?.actual && LANE_RATIOS[p.activeDrone.actual]
          ? p.activeDrone.actual
          : p.selectedGate;

      const byteH =
        w >= 560
          ? Math.min(205, Math.max(142, h * 0.48))
          : Math.min(134, Math.max(96, h * 0.42));

      // Draw 3 flight corridors on right half
      (['CLEAR', 'PRACTICE', 'WAIT'] as const).forEach((lane) => {
        const ly = h * LANE_RATIOS[lane];
        const laneColor = LANE_COLORS[lane];
        const highlighted = targetLane === lane;
        const isWrongCrash =
          p.activeDrone && !p.activeDrone.passed && p.activeDrone.actual === lane;

        ctx.strokeStyle = isWrongCrash
          ? 'rgba(255, 42, 95, 0.8)'
          : highlighted
            ? laneColor
            : 'rgba(124, 155, 176, 0.28)';
        ctx.lineWidth = highlighted ? 2.6 : 1.3;
        ctx.beginPath();
        ctx.moveTo(gateX + 26, h * 0.56);
        ctx.bezierCurveTo(gateX + 80, h * 0.56, gateX + 95, ly, badgeX - 4, ly);
        ctx.stroke();

        // Corridor badge on far right
        ctx.fillStyle = highlighted ? 'rgba(11, 20, 32, 0.96)' : 'rgba(6, 11, 18, 0.78)';
        ctx.fillRect(badgeX, ly - 15, badgeW, 30);
        ctx.strokeStyle = isWrongCrash ? '#FF2A5F' : laneColor;
        ctx.lineWidth = highlighted ? 2 : 1;
        ctx.strokeRect(badgeX, ly - 15, badgeW, 30);
        ctx.fillStyle = isWrongCrash ? '#FF6B90' : laneColor;
        ctx.font = `700 ${badgeW < 70 ? 9 : 10.5}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(lane, badgeX + badgeW / 2, ly + 4);

        // Wrong-lane barrier bar
        if (isWrongCrash && flightProgressRef.current > 0.52) {
          ctx.strokeStyle = '#FF2A5F';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(badgeX - 32, ly - 20);
          ctx.lineTo(badgeX - 32, ly + 20);
          ctx.stroke();
        }
      });

      // Full-body transparent UNIT-01 BYTE at Tri-Gate Switcher
      const byteStatus = p.activeDrone && !p.activeDrone.passed ? 'error' : 'idle';
      const byte = drawByteHero(
        ctx,
        byteImgRef.current,
        gateX,
        h * 0.55,
        byteH,
        t,
        byteStatus,
        w >= 430 ? 'BYTE // TRI-GATE' : undefined,
      );

      // Boss Sentinel Shield Dome on upper-right in battle mode (desktop)
      if (p.mode === 'battle' && w >= 560) {
        const bx = w - 36;
        const by = 38;
        for (let i = 0; i < p.bossShields; i++) {
          const broken = i < p.brokenShields;
          ctx.beginPath();
          ctx.arc(bx, by, 11 + i * 4, Math.PI * 0.65, Math.PI * 1.65);
          ctx.strokeStyle = broken ? 'rgba(184, 255, 60, 0.45)' : '#FF2A5F';
          ctx.lineWidth = broken ? 1.4 : 2;
          ctx.stroke();
        }
        ctx.fillStyle = p.brokenShields >= p.bossShields ? '#B8FF3C' : '#FF2A5F';
        ctx.font = '700 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SENTINEL', bx, by + 3);
      }

      // Active flying drone
      if (p.activeDrone) {
        const prog = flightProgressRef.current;
        const destLane = LANE_RATIOS[p.activeDrone.actual] ?? 0.56;
        let dx: number;
        let dy: number;

        if (prog < 0.45) {
          const u = prog / 0.45;
          dx = w * 0.08 + (gateX - byte.drawW * 0.34 - w * 0.08) * u;
          dy = h * 0.56;
        } else {
          const u = Math.min(1, (prog - 0.45) / 0.55);
          const endX = p.activeDrone.passed ? badgeX - 18 : badgeX - 42;
          dx = byte.emitterX + (endX - byte.emitterX) * u;
          const targetY = h * destLane;
          dy = h * 0.56 + (targetY - h * 0.56) * Math.pow(u, 0.8);
        }

        // Crash / Hit burst once at end of flight
        if (!crashSpawnedRef.current && prog >= 0.94) {
          crashSpawnedRef.current = true;
          spawnBurst(dx, dy, p.activeDrone.passed ? '#B8FF3C' : '#FF2A5F');
        }

        // Drone thruster trail
        const droneColor =
          prog > 0.85 && !p.activeDrone.passed
            ? '#FF2A5F'
            : LANE_COLORS[p.activeDrone.actual] ?? '#00F0FF';
        ctx.strokeStyle = droneColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(dx - 28, dy);
        ctx.lineTo(dx - 8, dy);
        ctx.stroke();

        // Drone chassis triangle
        ctx.fillStyle = '#E8F4F2';
        ctx.beginPath();
        ctx.moveTo(dx + 14, dy);
        ctx.lineTo(dx - 10, dy - 10);
        ctx.lineTo(dx - 6, dy);
        ctx.lineTo(dx - 10, dy + 10);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = droneColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Drone floating telemetry badge (clamped clear of right-side lane boxes)
        const badgeText = `${p.activeDrone.callsign} | AGE ${p.activeDrone.age} | TRN:${p.activeDrone.trained ? 'T' : 'F'} | MNT:${p.activeDrone.mentor ? 'T' : 'F'}`;
        const pillW = Math.min(230, w - 24);
        const badgeCenterX = Math.max(pillW / 2 + 12, Math.min(badgeX - pillW / 2 - 8, dx));
        ctx.fillStyle = 'rgba(6, 11, 18, 0.92)';
        ctx.fillRect(badgeCenterX - pillW / 2, dy - 42, pillW, 22);
        ctx.strokeStyle = droneColor;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(badgeCenterX - pillW / 2, dy - 42, pillW, 22);
        ctx.fillStyle = '#E8F4F2';
        ctx.font = `700 ${pillW < 210 ? 9 : 10}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, badgeCenterX, dy - 27);

        // Show failure callout if crashed
        if (prog > 0.88 && !p.activeDrone.passed) {
          const errW = Math.min(196, w - 24);
          const errCx = Math.max(errW / 2 + 12, Math.min(w - errW / 2 - 12, dx));
          ctx.fillStyle = 'rgba(255, 42, 95, 0.94)';
          ctx.fillRect(errCx - errW / 2, dy + 18, errW, 24);
          ctx.fillStyle = '#fff';
          ctx.font = `700 ${errW < 180 ? 9 : 10}px "JetBrains Mono", monospace`;
          ctx.fillText(
            `CRASH! GOT ${p.activeDrone.actual} (NEED ${p.activeDrone.expected})`,
            errCx,
            dy + 34,
          );
        }
      }

      // Live branch condition badge from TraceFrame
      if (p.activeFrame && p.activeFrame.branchExpr) {
        const condText = `${p.activeFrame.branchExpr} → ${p.activeFrame.branchTaken ? 'TRUE' : 'FALSE'}`;
        const condW = Math.min(276, w - 24);
        const condCx = Math.max(condW / 2 + 12, Math.min(w - condW / 2 - 12, gateX));
        ctx.fillStyle = 'rgba(6, 11, 18, 0.92)';
        ctx.fillRect(condCx - condW / 2, 44, condW, 26);
        ctx.strokeStyle = p.activeFrame.branchTaken ? '#B8FF3C' : '#FF9500';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(condCx - condW / 2, 44, condW, 26);
        ctx.fillStyle = p.activeFrame.branchTaken ? '#B8FF3C' : '#FFB84D';
        ctx.font = '700 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(condText.slice(0, 38), condCx, 61);
      }

      // Sparks
      sparksRef.current = sparksRef.current.filter((sp) => {
        sp.life -= dt;
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vx *= 0.94;
        sp.vy *= 0.94;
        if (sp.life <= 0) return false;
        ctx.globalAlpha = Math.max(0, sp.life);
        ctx.fillStyle = sp.color;
        ctx.fillRect(sp.x, sp.y, 3, 3);
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

  const crashed = Boolean(activeDrone && !activeDrone.passed);
  return (
    <div className={`stage-frame chamfer ${crashed ? 'shake-hit' : ''}`}>
      <canvas ref={canvasRef} className="stage-canvas" aria-label="Sentinel drone gate arena" />
      <div className="stage-hud-overlay" style={{ justifyContent: 'flex-start' }}>
        <span className="tac-tag cyan">SKY-GATE TRI-LANE</span>
        {mode === 'battle' && (
          <span className={`tac-tag ${brokenShields >= bossShields ? 'lime' : 'crimson'}`}>
            SENTINEL SHIELDS: {Math.max(0, bossShields - brokenShields)} / {bossShields}
          </span>
        )}
      </div>
    </div>
  );
};
