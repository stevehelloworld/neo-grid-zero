import React, { useEffect, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { sound } from '../engine/audio/synth';
import { Lang, t, UI_COPY } from '../engine/i18n/text';
import { TraceFrame } from '../engine/vm';

export interface TimelineBarProps {
  frames: TraceFrame[];
  stepIndex: number;
  onStepChange: (nextIndex: number) => void;
  lang: Lang;
  autoPlayTrigger?: number;
}

export const TimelineBar: React.FC<TimelineBarProps> = ({
  frames,
  stepIndex,
  onStepChange,
  lang,
  autoPlayTrigger = 0,
}) => {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<0.5 | 1 | 2.5>(1);

  useEffect(() => {
    if (autoPlayTrigger > 0 && frames.length > 0) {
      setPlaying(true);
    }
  }, [autoPlayTrigger, frames.length]);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    if (stepIndex >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const ms = Math.round(520 / speed);
    const timer = window.setTimeout(() => {
      sound.step();
      onStepChange(Math.min(frames.length - 1, stepIndex + 1));
    }, ms);
    return () => window.clearTimeout(timer);
  }, [playing, stepIndex, frames.length, speed, onStepChange]);

  const current = frames[stepIndex] ?? null;

  const cycleSpeed = () => {
    sound.click();
    setSpeed((prev) => (prev === 1 ? 2.5 : prev === 2.5 ? 0.5 : 1));
  };

  return (
    <div className="timeline-bar chamfer-sm">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--cyan)', fontWeight: 700 }}>
          {t(UI_COPY.timelineTitle, lang)}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {current && (
            <span className="tac-tag amber">
              LINE {current.line}
            </span>
          )}
          <span className="tac-tag">
            STEP {frames.length ? stepIndex + 1 : 0} / {frames.length}
          </span>
        </div>
      </div>

      <div className="timeline-controls">
        <button
          type="button"
          className="tac-btn ghost"
          aria-label="Step back"
          disabled={frames.length === 0 || stepIndex <= 0}
          onClick={() => {
            setPlaying(false);
            sound.step();
            onStepChange(Math.max(0, stepIndex - 1));
          }}
          style={{ padding: '6px 10px' }}
        >
          <SkipBack size={15} />
        </button>

        <button
          type="button"
          className="tac-btn primary"
          aria-label={playing ? 'Pause playback' : 'Play trace'}
          disabled={frames.length === 0}
          onClick={() => {
            sound.click();
            if (!playing && stepIndex >= frames.length - 1) {
              onStepChange(0);
            }
            setPlaying((p) => !p);
          }}
          style={{ padding: '6px 12px' }}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>

        <button
          type="button"
          className="tac-btn ghost"
          aria-label="Step forward"
          disabled={frames.length === 0 || stepIndex >= frames.length - 1}
          onClick={() => {
            setPlaying(false);
            sound.step();
            onStepChange(Math.min(frames.length - 1, stepIndex + 1));
          }}
          style={{ padding: '6px 10px' }}
        >
          <SkipForward size={15} />
        </button>

        <input
          type="range"
          className="timeline-range"
          min={0}
          max={Math.max(0, frames.length - 1)}
          value={Math.min(stepIndex, Math.max(0, frames.length - 1))}
          disabled={frames.length === 0}
          aria-label="Trace step scrubber"
          onChange={(e) => {
            setPlaying(false);
            sound.step();
            onStepChange(Number(e.target.value));
          }}
        />

        <button type="button" className="tac-btn ghost mono" onClick={cycleSpeed} style={{ padding: '6px 10px' }}>
          {speed}x
        </button>
      </div>

      <div className="mono" style={{ fontSize: 12, color: current?.kind === 'error' ? 'var(--crimson)' : 'var(--ink-secondary)' }}>
        {current
          ? `[${current.kind.toUpperCase()}] ${current.summary}`
          : lang === 'zh-Hant'
            ? '等待執行影格…'
            : 'Waiting for execution trace…'}
      </div>
    </div>
  );
};
