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
      const byteR = Math.min(28, w * 0.075);
      const bx = Math.max(38, w * 0.11);
      const by = h * 0.72 + Math.sin(t * 2.2) * 3;
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, byteR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.fill();
      ctx.strokeStyle = p.status === 'error' ? '#FF2A5F' : '#00F0FF';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.clip();
      if (byteImgRef.current) ctx.drawImage(byteImgRef.current, bx - byteR, by - byteR, byteR * 2, byteR * 2);
      ctx.restore();

      const dashFromTrace = p.activeFrame?.locals.dash?.value;

      if (p.mode === 'battle' && p.initialsPair) {
        // Dual Tape Mode for Initials Slicer (first & last names)
        const fChars = p.initialsPair.first.split('');
        const lChars = p.initialsPair.last.split('');
        const maxLen = Math.max(fChars.length, lChars.length, 4);
        const minLabelX = Math.max(78, w * 0.22);
        const availW = Math.max(140, w - minLabelX - 18);
        const tileW = Math.min(36, availW / maxLen - 4);
        const totalW = maxLen * (tileW + 4);
        const startX = Math.max(minLabelX, (w - totalW) / 2 + 12);
        const row1Y = Math.max(68, h * 0.23);
        const row2Y = Math.max(122, h * 0.43);

        ctx.fillStyle = '#7C9BB0';
        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('index 0 from each String (keep original case)', w * 0.52, row1Y - 24);

        const drawNameRow = (label: string, chars: string[], rowY: number, labelColor: string) => {
          ctx.fillStyle = labelColor;
          ctx.font = '700 11px "JetBrains Mono", monospace';
          ctx.textAlign = 'right';
          ctx.fillText(label, startX - 10, rowY + 21);

          chars.forEach((ch, idx) => {
            const tx = startX + idx * (tileW + 4);
            const isHead = idx === 0;
            ctx.fillStyle = '#7C9BB0';
            ctx.font = '700 9px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(String(idx), tx + tileW / 2, rowY - 5);

            ctx.fillStyle =
              p.status === 'error' && isHead
                ? 'rgba(255, 42, 95, 0.22)'
                : isHead
                  ? 'rgba(0, 240, 255, 0.2)'
                  : 'rgba(11, 20, 32, 0.92)';
            ctx.fillRect(tx, rowY, tileW, 34);
            ctx.strokeStyle =
              p.status === 'error' && isHead
                ? '#FF2A5F'
                : isHead
                  ? '#B8FF3C'
                  : 'rgba(124, 155, 176, 0.35)';
            ctx.lineWidth = isHead ? 2 : 1.1;
            ctx.strokeRect(tx, rowY, tileW, 34);

            ctx.fillStyle = isHead ? '#E8F4F2' : '#9EB6C8';
            ctx.font = '700 16px "JetBrains Mono", monospace';
            ctx.fillText(ch, tx + tileW / 2, rowY + 23);
          });
        };

        drawNameRow('first', fChars, row1Y, '#00F0FF');
        drawNameRow('last', lChars, row2Y, '#FF9500');
      } else {
        // Single Optical String Tape Ribbon (Recon or Route Battle)
        const chars = p.tapeText.split('');
        const maxChars = Math.max(1, chars.length);
        const tileW = Math.min(44, (w * 0.72) / maxChars - 4);
        const totalTapeW = maxChars * (tileW + 4);
        const tapeStartX = Math.max(w * 0.16, (w - totalTapeW) / 2);
        const tapeY = Math.max(106, h * 0.37);

        const dashPos = p.tapeText.indexOf('-');
        const rangeInvalid = p.mode === 'recon' && p.beginIdx > p.endIdx;

        if (p.mode === 'recon') {
          ctx.fillStyle = rangeInvalid ? '#FF6B90' : '#7C9BB0';
          ctx.font = '700 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(
            rangeInvalid
              ? 'INVALID RANGE: begin must be <= end'
              : `s = "${p.tapeText}"  ·  length() = ${chars.length}  ·  range [begin, end)`,
            w * 0.5,
            tapeY - 46,
          );
        }

        chars.forEach((ch, idx) => {
          const tx = tapeStartX + idx * (tileW + 4);
          const inSlice =
            p.mode === 'recon'
              ? !rangeInvalid && idx >= p.beginIdx && idx < p.endIdx
              : dashPos >= 0 && idx > dashPos;
          const isDash = p.mode === 'battle' && ch === '-';

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
          ctx.fillRect(tx, tapeY, tileW, 46);
          ctx.strokeStyle =
            p.status === 'error'
              ? '#FF2A5F'
              : isDash
                ? '#FF9500'
                : inSlice
                  ? '#B8FF3C'
                  : 'rgba(124, 155, 176, 0.35)';
          ctx.lineWidth = inSlice || isDash ? 2 : 1.2;
          ctx.strokeRect(tx, tapeY, tileW, 46);

          ctx.fillStyle = '#E8F4F2';
          ctx.font = '700 18px "JetBrains Mono", monospace';
          ctx.fillText(ch, tx + tileW / 2, tapeY + 29);
        });

        // Laser Cutters in Recon
        if (p.mode === 'recon') {
          const endBoundX = tapeStartX + chars.length * (tileW + 4) - 2;
          ctx.fillStyle = '#4E6B80';
          ctx.font = '700 9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(String(chars.length), endBoundX + 4, tapeY - 10);

          const bX = tapeStartX + p.beginIdx * (tileW + 4) - 2;
          const eX = tapeStartX + Math.min(chars.length, p.endIdx) * (tileW + 4) - 2;
          ctx.strokeStyle = rangeInvalid ? '#FF2A5F' : '#00F0FF';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(bX, tapeY - 22);
          ctx.lineTo(bX, tapeY + 56);
          ctx.stroke();

          ctx.strokeStyle = rangeInvalid || p.endIdx > chars.length ? '#FF2A5F' : '#FF9500';
          ctx.beginPath();
          ctx.moveTo(eX, tapeY - 22);
          ctx.lineTo(eX, tapeY + 56);
          ctx.stroke();

          ctx.fillStyle = rangeInvalid ? '#FF6B90' : '#00F0FF';
          ctx.font = '700 10px "JetBrains Mono", monospace';
          ctx.fillText(`begin=${p.beginIdx}`, bX, tapeY - 26);
          ctx.fillStyle = rangeInvalid || p.endIdx > chars.length ? '#FF6B90' : '#FF9500';
          ctx.fillText(`end=${p.endIdx}`, eX, tapeY + 69);
        }
      }

      // Extracted Output Pod (safely positioned to the right of BYTE on narrow & wide screens)
      const rightEdgeOfByte = bx + byteR + 12;
      const outBoxW = Math.min(256, Math.max(170, w - rightEdgeOfByte - 16));
      const outBoxX = rightEdgeOfByte + (w - rightEdgeOfByte - 14 - outBoxW) / 2;
      const outCenterX = outBoxX + outBoxW / 2;
      const outBoxY = Math.max(188, h * 0.69);

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
      ctx.fillRect(outBoxX, outBoxY, outBoxW, 48);
      ctx.strokeStyle = podBorder;
      ctx.lineWidth = 1.8;
      ctx.strokeRect(outBoxX, outBoxY, outBoxW, 48);
      ctx.fillStyle = '#7C9BB0';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(podHeader, outCenterX, outBoxY + 15);
      ctx.fillStyle = podColor;
      ctx.font = `700 ${podValue.length > 18 ? 13 : 16}px "JetBrains Mono", monospace`;
      ctx.fillText(podValue, outCenterX, outBoxY + 37);

      // Boss Archivist Shield (compact top-right emblem on wider viewports; mobile uses top HUD strip)
      if (p.showBoss && w >= 520) {
        const ax = w - 36;
        const ay = 40;
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
