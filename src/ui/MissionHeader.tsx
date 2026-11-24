import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { sound } from '../engine/audio/synth';
import { Lang, t, UI_COPY } from '../engine/i18n/text';
import { ChapterProgress } from '../game/store';
import { ChapterMeta, PhaseId } from '../game/types';

export interface MissionHeaderProps {
  meta: ChapterMeta;
  lang: Lang;
  phase: PhaseId;
  progress: ChapterProgress;
  battleComplete: boolean;
  onPhaseChange: (phase: PhaseId) => void;
}

export const MissionHeader: React.FC<MissionHeaderProps> = ({
  meta,
  lang,
  phase,
  progress,
  battleComplete,
  onPhaseChange,
}) => {
  const phases: Array<[PhaseId, { en: string; zh: string }, boolean]> = [
    ['recon', UI_COPY.phaseRecon, true],
    ['breach', UI_COPY.phaseBreach, progress.reconDone],
    ['battle', UI_COPY.phaseBattle, progress.breachCleared],
    ['debrief', UI_COPY.phaseDebrief, battleComplete],
  ];

  return (
    <div className="mission-header-bar chamfer-sm">
      <div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--cyan)' }}>
          {meta.code} // {t(meta.topic, lang)}
        </span>
        <h1 style={{ fontSize: 22 }}>{t(meta.title, lang)}</h1>
      </div>

      <nav className="phase-stepper" aria-label="Mission phases">
        {phases.map(([id, label, unlocked]) => {
          const done = progress.completedPhases.includes(id);
          return (
            <button
              key={id}
              type="button"
              className={`phase-pill chamfer-sm ${phase === id ? 'current' : ''} ${done ? 'done' : ''}`}
              disabled={!unlocked}
              onClick={() => {
                sound.click();
                onPhaseChange(id);
              }}
            >
              {done && <CheckCircle2 size={13} />}
              {t(label, lang)}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
