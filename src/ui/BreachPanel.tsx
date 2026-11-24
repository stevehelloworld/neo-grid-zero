import React, { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { sound } from '../engine/audio/synth';
import { Lang, t } from '../engine/i18n/text';
import { runStatements, TraceFrame } from '../engine/vm';
import { BreachLock } from '../game/types';

export interface BreachPanelProps {
  locks: BreachLock[];
  solvedLocks: boolean[];
  lang: Lang;
  tagLabel?: string;
  proceedLabel?: { en: string; zh: string };
  onSolvedLock: (lockIdx: number, allCleared: boolean) => void;
  onMistake: () => void;
  onTraceLoaded?: (frames: TraceFrame[]) => void;
  onProceedToBattle: () => void;
}

export const BreachPanel: React.FC<BreachPanelProps> = ({
  locks,
  solvedLocks,
  lang,
  proceedLabel = { en: 'START BOSS BATTLE', zh: '迎戰關卡 Boss' },
  onSolvedLock,
  onMistake,
  onTraceLoaded,
  onProceedToBattle,
}) => {
  const [lockIdx, setLockIdx] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const lock = locks[lockIdx];
  const allCleared = solvedLocks.every(Boolean);
  const currentSolved = solvedLocks[lockIdx];

  const handleCrack = () => {
    if (selectedOpt === null || !lock) return;
    if (selectedOpt !== lock.correctIndex) {
      sound.hitError();
      onMistake();
      setFeedback({
        ok: false,
        text:
          lang === 'zh-Hant'
            ? '再逐行追蹤一次變數、型別或條件分支。'
            : 'Trace each statement, type conversion, or branch once more.',
      });
      return;
    }

    sound.breachSuccess();
    setFeedback({ ok: true, text: t(lock.explanation, lang) });
    if (lock.traceSource && onTraceLoaded) {
      const trace = runStatements(lock.traceSource);
      if (trace.frames.length > 0) {
        onTraceLoaded(trace.frames);
      }
    }
    const nextCleared = solvedLocks.every((v, idx) => (idx === lockIdx ? true : v));
    onSolvedLock(lockIdx, nextCleared);
  };

  const nextUnsolvedIdx = solvedLocks.findIndex((solved, idx) => idx !== lockIdx && !solved);

  return (
    <div className="deck-stack">
      <div className="breach-steps" role="tablist" aria-label="Security locks">
        {locks.map((lk, idx) => {
          const solved = solvedLocks[idx];
          const active = idx === lockIdx;
          return (
            <button
              key={lk.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`breach-step-pill ${active ? 'active' : ''} ${solved ? 'solved' : ''}`}
              onClick={() => {
                sound.click();
                setLockIdx(idx);
                setSelectedOpt(null);
                setFeedback(null);
              }}
            >
              {solved ? <Check size={12} strokeWidth={2.6} /> : <span>{idx + 1}</span>}
              <span>
                {lang === 'zh-Hant' ? `鎖 ${idx + 1}` : `Lock ${idx + 1}`}
              </span>
            </button>
          );
        })}
      </div>

      <div>
        <h2 className="deck-heading">{t(lock.title, lang)}</h2>
        <p className="deck-copy">{t(lock.prompt, lang)}</p>
      </div>

      {lock.code && <pre className="breach-code mono">{lock.code}</pre>}

      <div className="breach-options">
        {lock.options.map((opt, idx) => {
          const isSel = selectedOpt === idx;
          const stateCls =
            feedback && isSel ? (feedback.ok ? 'correct' : 'wrong') : isSel ? 'selected' : '';
          return (
            <button
              key={idx}
              type="button"
              className={`breach-option ${stateCls}`}
              onClick={() => {
                sound.click();
                setSelectedOpt(idx);
                setFeedback(null);
              }}
            >
              <span className="opt-key mono">{String.fromCharCode(65 + idx)}</span>
              <code style={{ fontSize: 13 }}>{t(opt, lang)}</code>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className={`deck-feedback ${feedback.ok ? 'ok' : 'err'}`}>
          {feedback.text}
        </div>
      )}

      <div className="deck-actions">
        {!currentSolved ? (
          <button
            type="button"
            className="tac-btn primary deck-primary-cta"
            disabled={selectedOpt === null}
            onClick={handleCrack}
          >
            {lang === 'zh-Hant' ? '破解此鎖' : 'CRACK LOCK'}
          </button>
        ) : allCleared ? (
          <button
            type="button"
            className="tac-btn primary deck-primary-cta"
            onClick={() => {
              sound.deploy();
              onProceedToBattle();
            }}
          >
            <span>{t(proceedLabel, lang)}</span>
            <ArrowRight size={15} />
          </button>
        ) : (
          <button
            type="button"
            className="tac-btn primary deck-primary-cta"
            onClick={() => {
              sound.click();
              const target = nextUnsolvedIdx >= 0 ? nextUnsolvedIdx : (lockIdx + 1) % locks.length;
              setLockIdx(target);
              setSelectedOpt(null);
              setFeedback(null);
            }}
          >
            <span>{lang === 'zh-Hant' ? '下一道鎖' : 'NEXT LOCK'}</span>
            <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
};
