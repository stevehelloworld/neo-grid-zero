import React, { useEffect, useRef } from 'react';
import { TraceFrame } from '../../engine/vm';
import { drawArenaAtmosphere, drawByteHero } from './drawByteHero';

export interface ArchiveCanvasProps {
  mode: 'recon' | 'battle';
  tapeText: string;
  beginIdx?: number;
  endIdx?: number;
  slicedResult?: string;
  activeFrame?: TraceFrame | null;
  bossShields?: number;
  brokenShields?: number;
  showBoss?: boolean;
  initialsPair?: { first: string; last: string } | null;
  outputLabel?: string;
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
  showBoss,
  initialsPair = null,
  outputLabel,
  status = 'idle',
  pulseKey = 0,
}) => {
  const effectiveShowBoss = showBoss ?? mode === 'battle';
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
    showBoss: effectiveShowBoss,
    initialsPair,
    outputLabel,
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
    showBoss: effectiveShowBoss,
    initialsPair,
    outputLabel,
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

      drawArenaAtmosphere(ctx, w, h, p.status === 'error' ? '#FF2A5F' : '#00F0FF');

      // Large Hero BYTE Mecha on the left bay (aspect-locked full body, zero clipping)
      const byteH =
        w >= 560
          ? Math.min(330, Math.max(195, h * 0.72))
          : w >= 430
            ? Math.min(205, Math.max(150, h * 0.56))
            : Math.min(146, Math.max(112, h * 0.54));
      const approxW = byteH * 0.845;
      const bx = Math.max(approxW * 0.5 + 8, w * 0.16);
      const by = Math.max(byteH * 0.5 + 36, h * 0.54);
      const byte = drawByteHero(ctx, byteImgRef.current, bx, by, byteH, t, p.status);

      // Right Workspace Bounds cleanly sized beside BYTE
      const contentLeft = byte.rightEdge + (w < 430 ? 8 : 14);
      const contentRight = w - (w < 430 ? 10 : 16);
      const contentW = Math.max(150, contentRight - contentLeft);
      const contentCx = contentLeft + contentW / 2;

      const dashFromTrace = p.activeFrame?.locals.dash?.value;
      let beamTargetX = contentLeft + 20;
      let beamTargetY = h * 0.4;

      if (p.mode === 'battle' && p.initialsPair) {
        const fChars = p.initialsPair.first.split('');
        const lChars = p.initialsPair.last.split('');
        const maxLen = Math.max(fChars.length, lChars.length, 4);
        const labelW = w < 430 ? 34 : 48;
        const gap = 4;
        const tileW = Math.min(56, Math.max(17, (contentW - labelW - 6) / maxLen - gap));
        const tileH = Math.min(48, Math.max(30, h * 0.12));
        const totalTapeW = maxLen * (tileW + gap) - gap;
        const startX = contentLeft + labelW + Math.max(0, (contentW - labelW - totalTapeW) / 2);

        const row1Y = Math.max(66, h * 0.22);
        const row2Y = Math.max(row1Y + tileH + (h < 320 ? 16 : 24), h * 0.44);

        beamTargetX = startX;
        beamTargetY = (row1Y + row2Y) / 2 + tileH / 2;

        // Targeting laser from BYTE arm to index 0
        ctx.save();
        ctx.strokeStyle = p.status === 'error' ? 'rgba(255, 42, 95, 0.5)' : 'rgba(0, 240, 255, 0.45)';
        ctx.lineWidth = 1.6 + flashRef.current * 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(byte.emitterX, byte.emitterY);
        ctx.lineTo(startX - 4, row1Y + tileH / 2);
        ctx.moveTo(byte.emitterX, byte.emitterY);
        ctx.lineTo(startX - 4, row2Y + tileH / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        ctx.fillStyle = '#7C9BB0';
        ctx.font = `700 ${w < 430 ? 9 : 11}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('index 0 from each String (keep original case)', contentCx, row1Y - 22);

        const drawNameRow = (label: string, chars: string[], rowY: number, labelColor: string) => {
          ctx.fillStyle = labelColor;
          ctx.font = `700 ${w < 430 ? 10 : 12}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'right';
          ctx.fillText(label, startX - 8, rowY + tileH * 0.62);

          chars.forEach((ch, idx) => {
            const tx = startX + idx * (tileW + gap);
            const isHead = idx === 0;
            ctx.fillStyle = '#7C9BB0';
            ctx.font = '700 9px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(String(idx), tx + tileW / 2, rowY - 5);

            ctx.fillStyle =
              p.status === 'error' && isHead
                ? 'rgba(255, 42, 95, 0.22)'
                : isHead
                  ? 'rgba(0, 240, 255, 0.22)'
                  : 'rgba(11, 20, 32, 0.92)';
            ctx.fillRect(tx, rowY, tileW, tileH);
            ctx.strokeStyle =
              p.status === 'error' && isHead
                ? '#FF2A5F'
                : isHead
                  ? '#B8FF3C'
                  : 'rgba(124, 155, 176, 0.35)';
            ctx.lineWidth = isHead ? 2.2 : 1.1;
            ctx.strokeRect(tx, rowY, tileW, tileH);

            ctx.fillStyle = isHead ? '#E8F4F2' : '#9EB6C8';
            ctx.font = `700 ${Math.min(20, Math.max(13, tileW * 0.45))}px "JetBrains Mono", monospace`;
            ctx.fillText(ch, tx + tileW / 2, rowY + tileH * 0.66);
          });
        };

        drawNameRow('first', fChars, row1Y, '#00F0FF');
        drawNameRow('last', lChars, row2Y, '#FF9500');
      } else {
        const chars = p.tapeText.split('');
        const maxChars = Math.max(1, chars.length);
        const gap = maxChars > 8 ? 2 : 4;
        const tileW = Math.min(70, Math.max(14, (contentW * 0.94) / maxChars - gap));
        const tileH = Math.min(64, Math.max(40, h * 0.15));
        const totalTapeW = maxChars * (tileW + gap) - gap;
        const tapeStartX = contentLeft + Math.max(0, (contentW - totalTapeW) / 2);
        const tapeY = Math.max(92, h * 0.34);

        const dashPos = p.tapeText.indexOf('-');
        const rangeInvalid = p.mode === 'recon' && p.beginIdx > p.endIdx;

        // Optical laser beam from BYTE arm to tape
        beamTargetX =
          p.mode === 'recon'
            ? tapeStartX + Math.min(chars.length, p.beginIdx) * (tileW + gap)
            : dashPos >= 0
              ? tapeStartX + dashPos * (tileW + gap)
              : tapeStartX;
        beamTargetY = tapeY + tileH * 0.5;

        ctx.save();
        ctx.strokeStyle =
          rangeInvalid || p.status === 'error'
            ? 'rgba(255, 42, 95, 0.6)'
            : p.status === 'ok'
              ? 'rgba(184, 255, 60, 0.55)'
              : 'rgba(0, 240, 255, 0.42)';
        ctx.lineWidth = 2 + flashRef.current * 2.5;
        ctx.beginPath();
        ctx.moveTo(byte.emitterX, byte.emitterY);
        ctx.lineTo(beamTargetX, beamTargetY);
        ctx.stroke();
        ctx.restore();

        if (p.mode === 'recon') {
          ctx.fillStyle = rangeInvalid ? '#FF6B90' : '#7C9BB0';
          ctx.font = `700 ${w < 430 ? 8.5 : 11}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(
            rangeInvalid
              ? 'INVALID RANGE: begin must be <= end'
              : w < 430
                ? `s="${p.tapeText}" · len=${chars.length} · [begin,end)`
                : `s = "${p.tapeText}"  ·  length() = ${chars.length}  ·  [begin, end)`,
            contentCx,
            tapeY - 40,
          );
        } else {
          ctx.fillStyle = '#7C9BB0';
          ctx.font = `700 ${w < 430 ? 9 : 11}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(
            dashPos >= 0
              ? `route.indexOf("-") = ${dashPos}  →  substring(${dashPos + 1})`
              : `route = "${p.tapeText}"`,
            contentCx,
            tapeY - 28,
          );
        }

        chars.forEach((ch, idx) => {
          const tx = tapeStartX + idx * (tileW + gap);
          const inSlice =
            p.mode === 'recon'
              ? !rangeInvalid && idx >= p.beginIdx && idx < p.endIdx
              : dashPos >= 0 && idx > dashPos;
          const isDash = p.mode === 'battle' && ch === '-';

          ctx.fillStyle = '#7C9BB0';
          ctx.font = `700 ${tileW < 20 ? 8 : 10}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(String(idx), tx + tileW / 2, tapeY - 9);

          ctx.fillStyle =
            p.status === 'error'
              ? 'rgba(255, 42, 95, 0.18)'
              : isDash
                ? 'rgba(255, 149, 0, 0.22)'
                : inSlice
                  ? 'rgba(0, 240, 255, 0.2)'
                  : 'rgba(11, 20, 32, 0.92)';
          ctx.fillRect(tx, tapeY, tileW, tileH);
          ctx.strokeStyle =
            p.status === 'error'
              ? '#FF2A5F'
              : isDash
                ? '#FF9500'
                : inSlice
                  ? '#B8FF3C'
                  : 'rgba(124, 155, 176, 0.35)';
          ctx.lineWidth = inSlice || isDash ? 2.2 : 1.2;
          ctx.strokeRect(tx, tapeY, tileW, tileH);

          ctx.fillStyle = '#E8F4F2';
          ctx.font = `700 ${Math.min(22, Math.max(12, tileW * 0.45))}px "JetBrains Mono", monospace`;
          ctx.fillText(ch, tx + tileW / 2, tapeY + tileH * 0.65);
        });

        if (p.mode === 'recon') {
          const endBoundX = tapeStartX + chars.length * (tileW + gap) - gap / 2;
          ctx.fillStyle = '#5A788E';
          ctx.font = '700 9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(String(chars.length), endBoundX + 4, tapeY - 9);

          const bX = tapeStartX + p.beginIdx * (tileW + gap) - gap / 2;
          const eX = tapeStartX + Math.min(chars.length, p.endIdx) * (tileW + gap) - gap / 2;
          ctx.strokeStyle = rangeInvalid ? '#FF2A5F' : '#00F0FF';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(bX, tapeY - 19);
          ctx.lineTo(bX, tapeY + tileH + 10);
          ctx.stroke();

          ctx.strokeStyle = rangeInvalid || p.endIdx > chars.length ? '#FF2A5F' : '#FF9500';
          ctx.beginPath();
          ctx.moveTo(eX, tapeY - 19);
          ctx.lineTo(eX, tapeY + tileH + 10);
          ctx.stroke();

          ctx.fillStyle = rangeInvalid ? '#FF6B90' : '#00F0FF';
          ctx.font = '700 10px "JetBrains Mono", monospace';
          ctx.fillText(`begin=${p.beginIdx}`, bX, tapeY - 23);
          ctx.fillStyle = rangeInvalid || p.endIdx > chars.length ? '#FF6B90' : '#FF9500';
          ctx.fillText(`end=${p.endIdx}`, eX, tapeY + tileH + 22);
        }
      }

      // Extracted Output Pod centered cleanly inside Right Workspace
      const outBoxW = Math.min(contentW * 0.94, 390);
      const outBoxH = h < 300 ? 48 : 56;
      const outBoxX = contentCx - outBoxW / 2;
      const outBoxY = Math.max(h < 300 ? 172 : 204, h * 0.69);

      let podHeader = p.outputLabel ?? 'EXTRACTED OUTPUT';
      let podValue = '—';
      let podColor = '#7C9BB0';
      let podBorder = '#00F0FF';

      if (p.slicedResult) {
        podHeader =
          dashFromTrace !== undefined
            ? `indexOf("-") = ${dashFromTrace}`
            : p.outputLabel ?? (p.mode === 'battle' ? 'RETURNED OUTPUT' : 'EXTRACTED OUTPUT');
        const bareText = p.status === 'error' || p.slicedResult.startsWith('s stays');
        podValue = bareText ? p.slicedResult : `"${p.slicedResult}"`;
        podColor = p.status === 'error' ? '#FF6B90' : '#B8FF3C';
        podBorder = p.status === 'error' ? '#FF2A5F' : p.status === 'ok' ? '#B8FF3C' : '#00F0FF';
      } else if (p.mode === 'recon') {
        if (p.beginIdx > p.endIdx) {
          podHeader = 'LIVE PREVIEW';
          podValue = 'begin > end (Error)';
          podColor = '#FF6B90';
          podBorder = '#FF2A5F';
        } else {
          podHeader = `PREVIEW: s.substring(${p.beginIdx}, ${p.endIdx})`;
          podValue = `"${p.tapeText.slice(p.beginIdx, p.endIdx)}"`;
          podColor = '#7CE8FF';
          podBorder = '#00F0FF';
        }
      } else if (p.mode === 'battle' && p.initialsPair) {
        podHeader = 'TARGET OUTPUT';
        podValue = `"${p.initialsPair.first[0] ?? '?'}.${p.initialsPair.last[0] ?? '?'}."`;
        podColor = '#7CE8FF';
        podBorder = '#00F0FF';
      }

      ctx.fillStyle = 'rgba(6, 11, 18, 0.94)';
      ctx.fillRect(outBoxX, outBoxY, outBoxW, outBoxH);
      ctx.strokeStyle = podBorder;
      ctx.lineWidth = 1.8;
      ctx.strokeRect(outBoxX, outBoxY, outBoxW, outBoxH);
      ctx.fillStyle = '#7C9BB0';
      ctx.font = '700 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(podHeader, contentCx, outBoxY + 17);
      ctx.fillStyle = podColor;
      ctx.font = `700 ${podValue.length > 18 ? 13 : h < 300 ? 16 : 19}px "JetBrains Mono", monospace`;
      ctx.fillText(podValue, contentCx, outBoxY + outBoxH - 12);

      // Boss Archivist Shield (compact corner emblem on wide viewports; top HUD handles narrow)
      if (p.showBoss && w >= 580) {
        const ax = w - 36;
        const ay = 38;
        for (let s = 0; s < p.bossShields; s++) {
          const broken = s < p.brokenShields;
          const half = 12 + s * 4;
          ctx.strokeStyle = broken ? 'rgba(184, 255, 60, 0.4)' : '#FF2A5F';
          ctx.lineWidth = broken ? 1.2 : 2;
          ctx.strokeRect(ax - half, ay - half, half * 2, half * 2);
        }
        ctx.fillStyle = p.brokenShields >= p.bossShields ? '#B8FF3C' : '#FF2A5F';
        ctx.font = '700 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ARCHIVIST', ax, ay + 3);
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
        {effectiveShowBoss && (
          <span className={`tac-tag ${brokenShields >= bossShields ? 'lime' : 'crimson'}`}>
            ARCHIVIST SHIELDS: {Math.max(0, bossShields - brokenShields)} / {bossShields}
          </span>
        )}
      </div>
    </div>
  );
};
