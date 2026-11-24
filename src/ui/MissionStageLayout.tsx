import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Lang } from '../engine/i18n/text';
import { TraceFrame } from '../engine/vm';
import { TraceInspector } from './TraceInspector';

export interface BossHudInfo {
  name: string;
  shields: number;
  broken: number;
}

export interface StepBannerInfo {
  stepTag: string;
  instruction: string;
  onOpenGuide?: () => void;
}

export interface ReactiveFeedbackInfo {
  mood: 'danger' | 'success' | 'alert';
  text: string;
}

export interface MissionStageLayoutProps {
  stage: React.ReactNode;
  bossHud?: BossHudInfo;
  feedbackBar?: ReactiveFeedbackInfo | null;
  stepBanner?: StepBannerInfo;
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
  feedbackBar = null,
  stepBanner,
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
        </div>

        {feedbackBar && (
          <div className={`reactive-feedback-bar ${feedbackBar.mood}`} role="status">
            <span className="reactive-badge mono">MIRA</span>
            <span>{feedbackBar.text}</span>
          </div>
        )}

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
        <div className="action-deck">
          {stepBanner && (
            <div className="step-beacon">
              <div className="step-beacon-main">
                <span className="step-dot" aria-hidden="true" />
                <div className="step-beacon-copy">
                  <span className="step-beacon-tag mono">{stepBanner.stepTag}</span>
                  <span className="step-beacon-text">{stepBanner.instruction}</span>
                </div>
              </div>
              {stepBanner.onOpenGuide && (
                <button
                  type="button"
                  className="step-guide-btn"
                  onClick={stepBanner.onOpenGuide}
                  aria-label={lang === 'zh-Hant' ? '查看目前步驟說明' : 'Show step guide'}
                  title={lang === 'zh-Hant' ? '查看本關說明' : 'Mission Briefing'}
                >
                  <HelpCircle size={14} />
                </button>
              )}
            </div>
          )}
          {children}
        </div>
      </section>
    </main>
  );
};
