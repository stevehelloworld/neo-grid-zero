import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { sound } from '../engine/audio/synth';
import { Lang, t, UI_COPY } from '../engine/i18n/text';
import { TraceFrame } from '../engine/vm';

export interface TraceInspectorProps {
  frames: TraceFrame[];
  stepIndex: number;
  onStepChange: (nextIndex: number) => void;
  stdout: string;
  lang: Lang;
  autoPlayTrigger?: number;
}

export const TraceInspector: React.FC<TraceInspectorProps> = ({
  frames,
  stepIndex,
  onStepChange,
  stdout,
  lang,
  autoPlayTrigger = 0,
}) => {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<0.5 | 1 | 2.5>(1);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (autoPlayTrigger > 0 && frames.length > 0) {
      setPlaying(true);
      setCollapsed(false);
    }
  }, [autoPlayTrigger, frames.length]);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    if (stepIndex >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const ms = Math.round(480 / speed);
    const timer = window.setTimeout(() => {
      sound.step();
      onStepChange(Math.min(frames.length - 1, stepIndex + 1));
    }, ms);
    return () => window.clearTimeout(timer);
  }, [playing, stepIndex, frames.length, speed, onStepChange]);

  if (frames.length === 0) {
    return null;
  }

  const current = frames[stepIndex] ?? frames[0];
  const entries = Object.entries(current?.locals ?? {});
  const hasStdout = stdout.trim().length > 0;

  const cycleSpeed = () => {
    sound.click();
    setSpeed((prev) => (prev === 1 ? 2.5 : prev === 2.5 ? 0.5 : 1));
  };

  return (
    <section className="trace-inspector" aria-label="Execution trace inspector">
      <div className="trace-head">
        <button
          type="button"
          className="trace-collapse-btn"
          onClick={() => {
            sound.click();
            setCollapsed((c) => !c);
          }}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <span className="trace-title">{t(UI_COPY.timelineTitle, lang)}</span>
        </button>

        <div className="trace-controls">
          <button
            type="button"
            className="trace-icon-btn"
            aria-label="Step back"
            disabled={stepIndex <= 0}
            onClick={() => {
              setPlaying(false);
              sound.step();
              onStepChange(Math.max(0, stepIndex - 1));
            }}
          >
            <SkipBack size={13} />
          </button>

          <button
            type="button"
            className="trace-icon-btn play"
            aria-label={playing ? 'Pause playback' : 'Play trace'}
            onClick={() => {
              sound.click();
              if (!playing && stepIndex >= frames.length - 1) {
                onStepChange(0);
              }
              setPlaying((p) => !p);
            }}
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>

          <button
            type="button"
            className="trace-icon-btn"
            aria-label="Step forward"
            disabled={stepIndex >= frames.length - 1}
            onClick={() => {
              setPlaying(false);
              sound.step();
              onStepChange(Math.min(frames.length - 1, stepIndex + 1));
            }}
          >
            <SkipForward size={13} />
          </button>

          <input
            type="range"
            className="timeline-range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={Math.min(stepIndex, Math.max(0, frames.length - 1))}
            aria-label="Trace step scrubber"
            onChange={(e) => {
              setPlaying(false);
              sound.step();
              onStepChange(Number(e.target.value));
            }}
          />

          <button
            type="button"
            className="trace-speed-btn mono"
            onClick={cycleSpeed}
          >
            {speed}x
          </button>

          <span className="trace-meta mono">
            L{current.line} · {stepIndex + 1}/{frames.length}
          </span>
        </div>
      </div>

      {!collapsed && (
        <div className="trace-body">
          <div
            className={`trace-summary mono ${current.kind === 'error' ? 'error' : ''}`}
          >
            {current.summary}
          </div>

          {entries.length > 0 && (
            <div className="trace-vars" aria-label={t(UI_COPY.memoryTitle, lang)}>
              {entries.map(([name, slot]) => {
                const isChanged = current.changedVar === name;
                return (
                  <div
                    key={name}
                    className={`trace-var-chip mono ${isChanged ? 'changed' : ''}`}
                    title={slot.type}
                  >
                    <span className="trace-var-name">{name}</span>
                    <span className="trace-var-eq">=</span>
                    <span className="trace-var-val">{slot.value}</span>
                  </div>
                );
              })}
            </div>
          )}

          {hasStdout && (
            <pre className="trace-stdout mono">{stdout}</pre>
          )}
        </div>
      )}
    </section>
  );
};
