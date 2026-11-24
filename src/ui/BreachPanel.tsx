import React, { useState } from 'react';
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
  tagLabel = 'FIREWALL TRACE',
  proceedLabel = { en: 'ENGAGE BOSS BATTLE', zh: '進入 Phase 03 Boss 戰' },
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

  const handleCrack = () => {
    if (selectedOpt === null || !lock) return;
    if (selectedOpt !== lock.correctIndex) {
      sound.hitError();
      onMistake();
      setFeedback({
        ok: false,
        text:
          lang === 'zh-Hant'
            ? '訊號鎖定失敗！再逐行追蹤一次變數、型別或條件結果。'
            : 'Signal mismatch! Trace each statement, type conversion, or branch condition once more.',
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

  return (
    <section className="panel-frame chamfer" style={{ padding: 18, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {locks.map((lk, idx) => (
            <button
              key={lk.id}
              type="button"
              className={`tac-btn ${idx === lockIdx ? 'primary' : solvedLocks[idx] ? 'lime' : 'ghost'} chamfer-sm`}
              style={{ minHeight: 32, padding: '4px 10px', fontSize: 11 }}
              onClick={() => {
                sound.click();
                setLockIdx(idx);
                setSelectedOpt(null);
                setFeedback(null);
              }}
            >
              {solvedLocks[idx] ? '✓ ' : ''}LOCK 0{idx + 1}
            </button>
          ))}
        </div>
        <span className="tac-tag cyan">{tagLabel}</span>
      </div>

      <div>
        <h2 style={{ fontSize: 20 }}>{t(lock.title, lang)}</h2>
        <p style={{ color: 'var(--ink-secondary)', fontSize: 13.5, marginTop: 4 }}>
          {t(lock.prompt, lang)}
        </p>
      </div>

      {lock.code && (
        <pre
          className="mono"
          style={{
            margin: 0,
            padding: '12px 14px',
            background: '#050a11',
            border: '1px solid rgba(0, 240, 255, 0.25)',
            fontSize: 12.5,
            lineHeight: 1.6,
            overflowX: 'auto',
          }}
        >
          {lock.code}
        </pre>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {lock.options.map((opt, idx) => {
          const isSel = selectedOpt === idx;
          const stateCls =
            feedback && isSel ? (feedback.ok ? 'correct' : 'wrong') : isSel ? 'selected' : '';
          return (
            <button
              key={idx}
              type="button"
              className={`breach-option chamfer-sm ${stateCls}`}
              onClick={() => {
                sound.click();
                setSelectedOpt(idx);
                setFeedback(null);
              }}
            >
              <span className="tac-tag cyan">{String.fromCharCode(65 + idx)}</span>
              <code style={{ fontSize: 13 }}>{t(opt, lang)}</code>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="tac-btn primary chamfer-sm"
          disabled={selectedOpt === null}
          onClick={handleCrack}
        >
          {lang === 'zh-Hant' ? '破解訊號鎖' : 'CRACK SIGNAL LOCK'}
        </button>

        {solvedLocks[lockIdx] && lockIdx < locks.length - 1 && !allCleared && (
          <button
            type="button"
            className="tac-btn amber chamfer-sm"
            onClick={() => {
              sound.click();
              setLockIdx(lockIdx + 1);
              setSelectedOpt(null);
              setFeedback(null);
            }}
          >
            NEXT LOCK →
          </button>
        )}

        {allCleared && (
          <button
            type="button"
            className="tac-btn lime chamfer-sm"
            onClick={() => {
              sound.click();
              onProceedToBattle();
            }}
          >
            {t(proceedLabel, lang)} →
          </button>
        )}
      </div>

      {feedback && (
        <div
          style={{
            padding: '10px 12px',
            fontSize: 12.5,
            background: feedback.ok ? 'var(--lime-dim)' : 'var(--crimson-dim)',
            border: `1px solid ${feedback.ok ? 'var(--lime)' : 'var(--crimson)'}`,
          }}
        >
          {feedback.text}
        </div>
      )}
    </section>
  );
};
