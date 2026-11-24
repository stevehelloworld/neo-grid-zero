import React from 'react';
import { Lang } from '../engine/i18n/text';
import { TraceFrame } from '../engine/vm';
import { MiraComms } from './MiraComms';
import { TraceInspector } from './TraceInspector';

export interface BossHudInfo {
  name: string;
  shields: number;
  broken: number;
}

export interface MissionStageLayoutProps {
  stage: React.ReactNode;
  bossHud?: BossHudInfo;
  mira: { mood: 'neutral' | 'alert' | 'danger' | 'success'; text: string };
  traceFrames: TraceFrame[];
  stepIdx: number;
  onStepChange: (nextIndex: number) => void;
  autoPlaySeq: number;
  stdout: string;
  lang: Lang;
  children: React.ReactNode;
}

export const MissionStageLayout: React.FC<MissionStageLayoutProps> = ({
  stage,
  bossHud,
  mira,
  traceFrames,
  stepIdx,
  onStepChange,
  autoPlaySeq,
  stdout,
  lang,
  children,
}) => {
  return (
    <main className="mission-shell">
      <div className="mission-arena-col">
        <div className={`arena-frame ${bossHud ? 'arena-has-boss' : ''}`}>
          <div className="arena-stage-wrap">
            {stage}
            {bossHud && (
              <div className="arena-boss-hud" aria-label="Boss shields">
                <span className="boss-hud-name">{bossHud.name}</span>
                <div className="shield-pips">
                  {Array.from({ length: bossHud.shields }).map((_, i) => (
                    <div
                      key={i}
                      className={`shield-pip ${i < bossHud.broken ? 'broken' : ''}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <MiraComms mood={mira.mood} message={mira.text} lang={lang} docked />
        </div>

        <TraceInspector
          frames={traceFrames}
          stepIndex={stepIdx}
          onStepChange={onStepChange}
          stdout={stdout}
          lang={lang}
          autoPlayTrigger={autoPlaySeq}
        />
      </div>

      <section className="mission-deck-col" aria-label="Mission controls">
        <div className="action-deck">{children}</div>
      </section>
    </main>
  );
};
