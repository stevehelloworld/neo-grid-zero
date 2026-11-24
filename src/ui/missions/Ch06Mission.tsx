import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Flame, ShieldAlert, StepForward, Zap } from 'lucide-react';
import { sound } from '../../engine/audio/synth';
import { Lang, t, UI_COPY } from '../../engine/i18n/text';
import { TraceFrame } from '../../engine/vm';
import { CAMPAIGN_CHAPTERS } from '../../game/campaignData';
import {
  CH06_LOCKS,
  CH06_STARTER_CODE,
  Ch06BattleResult,
  Ch06TrialResult,
  Ch06TrialSpec,
  evaluateScannerBattle,
  expectedLongestRun,
} from '../../game/chapters/ch06Scanner';
import { ChapterProgress, computeRank } from '../../game/store';
import { PhaseId } from '../../game/types';
import { BreachPanel } from '../BreachPanel';
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MissionStageLayout } from '../MissionStageLayout';
import { ScannerCanvas } from '../stages/ScannerCanvas';

export interface Ch06MissionProps {
  lang: Lang;
  phase: PhaseId;
  onPhaseChange: (p: PhaseId) => void;
  progress: ChapterProgress;
  onUpdateProgress: (updater: (prev: ChapterProgress) => ChapterProgress) => void;
  onUnlockChip: (chipId: string) => void;
  onCutIn: (c: Omit<CutInData, 'id'>) => void;
  onOpenChapter: (chapterId: number) => void;
  onBackToMap: () => void;
  chaosSignalTrigger?: { stream: string; seq: number } | null;
}

const RECON_STREAM = 'OOXOOOXO';

export const Ch06Mission: React.FC<Ch06MissionProps> = ({
  lang,
  phase,
  onPhaseChange,
  progress,
  onUpdateProgress,
  onUnlockChip,
  onCutIn,
  onOpenChapter,
  onBackToMap,
  chaosSignalTrigger,
}) => {
  const meta = CAMPAIGN_CHAPTERS.find((c) => c.id === 6)!;

  // Phase 1: Recon pulse walker
  const [cursorIdx, setCursorIdx] = useState(progress.reconDone ? RECON_STREAM.length - 1 : -1);
  const [curRun, setCurRun] = useState(progress.reconDone ? 1 : 0);
  const [bestRun, setBestRun] = useState(progress.reconDone ? 3 : 0);
  const [peakGuess, setPeakGuess] = useState(progress.reconDone ? '3' : '');
  const [reconStatus, setReconStatus] = useState<'idle' | 'ok' | 'error'>(progress.reconDone ? 'ok' : 'idle');

  // Phase 2: Breach locks
  const [solvedLocks, setSolvedLocks] = useState<boolean[]>(
    progress.breachCleared ? [true, true, true, true] : [false, false, false, false],
  );

  // Phase 3: Battle
  const code = progress.codeDrafts.scanner ?? CH06_STARTER_CODE;
  const [battleResult, setBattleResult] = useState<Ch06BattleResult | null>(null);
  const [inspectedTrial, setInspectedTrial] = useState<Ch06TrialResult | null>(null);
  const [chaosNote, setChaosNote] = useState<string | null>(null);

  const [traceFrames, setTraceFrames] = useState<TraceFrame[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [autoPlaySeq, setAutoPlaySeq] = useState(0);
  const timersRef = useRef<number[]>([]);

  const [mira, setMira] = useState<{ mood: 'neutral' | 'alert' | 'danger' | 'success'; text: string }>({
    mood: 'alert',
    text:
      lang === 'zh-Hant'
        ? '逐格步進掃描 "OOXOOOXO"，觀察遇 X 時 current 歸零但 best 保留最高峰的節奏，再鎖定最佳值！'
        : 'Step through "OOXOOOXO" to watch current reset on X while best preserves the peak streak!',
  });

  useEffect(() => {
    return () => timersRef.current.forEach((id) => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    if (phase === 'breach') {
      setMira({
        mood: 'neutral',
        text:
          lang === 'zh-Hant'
            ? '四道演算法鎖涵蓋累積極值、雙計數器與數字拆解，小心負數陷阱！'
            : 'Four algorithm locks test extrema, streak tracking, and digit peeling!',
      });
    } else if (phase === 'battle') {
      setMira({
        mood: 'alert',
        text:
          lang === 'zh-Hant'
            ? '實作 longestRun(readings)：單次掃描維護 cur 與 best，記得安全處理空字串 ""！'
            : 'Implement longestRun(readings): update cur & best in one pass and handle "" safely.',
      });
    } else if (phase === 'debrief') {
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? '雜訊幻影清除完成！準備進入 Act II 壓軸戰 Ch.07 矩陣掃描雷達。'
            : 'Pulse Scanner online! Ready for the Act II finale: Ch.07 Radar Matrix.',
      });
    }
  }, [phase, lang]);

  useEffect(() => {
    if (!chaosSignalTrigger) return;
    onPhaseChange('battle');
    timersRef.current.forEach((id) => window.clearTimeout(id));
    const clean = chaosSignalTrigger.stream.toUpperCase().replace(/[^OX]/g, '');
    const spec: Ch06TrialSpec = {
      id: `gm-${Date.now()}`,
      stream: clean,
      expected: expectedLongestRun(clean),
    };
    const res = evaluateScannerBattle(code, spec);
    const tr = res.trials[0];
    setBattleResult(res);
    setInspectedTrial(tr);
    setTraceFrames(tr.run.frames);
    setStepIdx(0);
    setAutoPlaySeq((s) => s + 1);
    if (tr.passed) {
      sound.shieldBreak();
      setChaosNote(`GM Chaos "${clean}" → ${tr.actual} ✓`);
      onCutIn({ tag: 'GM CHAOS', title: `STREAK ${tr.actual} VERIFIED!`, tone: 'lime' });
    } else {
      sound.hitError();
      setChaosNote(`GM Chaos "${clean}" failed: got ${tr.actual ?? 'ERR'}, need ${spec.expected}`);
      onCutIn({ tag: 'GM CHAOS', title: 'SCANNER MISMATCH!', tone: 'danger' });
    }
  }, [chaosSignalTrigger]);

  const handleStepRecon = () => {
    const nextIdx = cursorIdx + 1;
    if (nextIdx >= RECON_STREAM.length) return;
    const ch = RECON_STREAM[nextIdx];
    const nextCur = ch === 'O' ? curRun + 1 : 0;
    const nextBest = Math.max(bestRun, nextCur);
    setCursorIdx(nextIdx);
    setCurRun(nextCur);
    setBestRun(nextBest);
    if (ch === 'O') sound.beam();
    else sound.hitError();
  };

  const handleVerifyRecon = () => {
    if (cursorIdx < RECON_STREAM.length - 1 || peakGuess.trim() !== '3') {
      sound.hitError();
      setReconStatus('error');
      setMira({
        mood: 'danger',
        text:
          lang === 'zh-Hant'
            ? '請先按 STEP PULSE 掃完整段訊號，再填入最長連續 O 的長度 (3)。'
            : 'Step through the entire signal stream first, then enter the peak consecutive O streak (3).',
      });
      return;
    }
    sound.breachSuccess();
    setReconStatus('ok');
    onUpdateProgress((p) => ({
      ...p,
      reconDone: true,
      completedPhases: p.completedPhases.includes('recon') ? p.completedPhases : [...p.completedPhases, 'recon'],
    }));
    setMira({
      mood: 'success',
      text:
        lang === 'zh-Hant'
          ? '雙計數器節奏掌握！遇到 X 歸零 cur 同時守住 best。進入突入！'
          : 'Dual-tracker verified! Reset current on X while protecting best.',
    });
  };

  const handleDeployScanner = () => {
    setChaosNote(null);
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    sound.deploy();

    const res = evaluateScannerBattle(code);
    setBattleResult(res);

    res.trials.forEach((tr, idx) => {
      const tid = window.setTimeout(() => {
        setInspectedTrial(tr);
        setTraceFrames(tr.run.frames);
        setStepIdx(Math.max(0, tr.run.frames.length - 1));
        if (tr.passed) {
          sound.beam();
          if (idx % 3 === 2) sound.shieldBreak();
        } else {
          sound.hitError();
          onCutIn({
            tag: `WAVE ${tr.waveIndex + 1} FAIL`,
            title: `"${tr.spec.stream}" → ${tr.actual ?? 'ERR'} (NEED ${tr.spec.expected})`,
            tone: 'danger',
          });
        }
      }, idx * 540);
      timersRef.current.push(tid);
    });

    const endTid = window.setTimeout(() => {
      if (res.passed) {
        const rank = computeRank(progress.breachMistakes, progress.battleMistakes);
        sound.missionClear();
        onUnlockChip(meta.chipId);
        onCutIn({ tag: 'SEC-06 RESTORED', title: `NOISE PHANTOM DEFEATED // ${rank}-RANK`, tone: 'lime' });
        onUpdateProgress((p) => ({
          ...p,
          rank,
          completedPhases: p.completedPhases.includes('battle') ? p.completedPhases : [...p.completedPhases, 'battle'],
        }));
        setMira({
          mood: 'success',
          text:
            lang === 'zh-Hant'
              ? `9 條訊號全數解碼！獲得 ${rank} 級評價與 SCANNER AI！`
              : `All 9 streams decoded cleanly! Earned ${rank}-Rank and SCANNER AI.`,
        });
      } else {
        onUpdateProgress((p) => ({ ...p, battleMistakes: p.battleMistakes + 1 }));
        const fail = res.failedTrial;
        setMira({
          mood: 'danger',
          text: fail?.run.error
            ? `Line ${fail.run.error.line}: ${fail.run.error.message}`
            : `Stream "${fail?.spec.stream}" returned ${fail?.actual}, expected ${fail?.spec.expected}.`,
        });
      }
    }, res.trials.length * 540);
    timersRef.current.push(endTid);
  };

  const currentFrame = traceFrames[stepIdx] ?? null;
  const battleComplete = Boolean(progress.rank || progress.completedPhases.includes('battle'));
  const stdoutShown = useMemo(
    () => (currentFrame ? currentFrame.stdout : inspectedTrial?.run.stdout ?? ''),
    [currentFrame, inspectedTrial],
  );

  const brokenShields = battleResult
    ? battleResult.totalWaves === 1
      ? progress.rank ? 3 : 0
      : battleResult.wavesCleared
    : progress.rank ? 3 : 0;

  return (
    <MissionStageLayout
      stage={
        <ScannerCanvas
          mode={phase === 'recon' ? 'recon' : 'battle'}
          stream={phase === 'recon' ? RECON_STREAM : inspectedTrial?.spec.stream ?? 'OOXOOO'}
          cursorIndex={phase === 'recon' ? cursorIdx : -1}
          currentRun={phase === 'recon' ? curRun : 0}
          bestRun={phase === 'recon' ? bestRun : inspectedTrial?.actual ?? 0}
          activeFrame={currentFrame}
          bossShields={3}
          brokenShields={brokenShields}
          status={phase === 'recon' ? reconStatus : battleResult ? (battleResult.passed ? 'ok' : 'error') : 'idle'}
        />
      }
      bossHud={
        phase === 'battle'
          ? { name: 'NOISE PHANTOM', shields: 3, broken: brokenShields }
          : undefined
      }
      mira={mira}
      traceFrames={traceFrames}
      stepIdx={stepIdx}
      onStepChange={setStepIdx}
      autoPlaySeq={autoPlaySeq}
      stdout={stdoutShown}
      lang={lang}
    >
      {phase === 'recon' && (
        <div className="deck-stack">
          <div className="deck-row-between">
            <h2 className="deck-heading">
              {lang === 'zh-Hant' ? '即時雙計數器掃描' : 'Live Streak Scanner'}
            </h2>
            <button
              type="button"
              className="tac-btn ghost compact-btn"
              onClick={() => {
                setCursorIdx(-1);
                setCurRun(0);
                setBestRun(0);
                setReconStatus('idle');
              }}
            >
              Reset
            </button>
          </div>

          <button
            type="button"
            className="tac-btn primary deck-primary-cta"
            disabled={cursorIdx >= RECON_STREAM.length - 1}
            onClick={handleStepRecon}
          >
            <StepForward size={15} />
            <span>STEP PULSE ({cursorIdx + 1} / {RECON_STREAM.length})</span>
          </button>

          <label className="deck-field">
            <span className="deck-field-label mono" style={{ color: 'var(--lime)' }}>
              {lang === 'zh-Hant' ? '掃描後輸入最長連續 O 長度 (Best Peak)' : 'Final longest consecutive O streak'}
            </span>
            <input
              type="number"
              className="deck-input mono"
              value={peakGuess}
              onChange={(e) => setPeakGuess(e.target.value)}
              placeholder="?"
            />
          </label>

          <div className="deck-actions">
            <button type="button" className={`tac-btn ${progress.reconDone ? 'ghost' : 'amber'} deck-primary-cta`} onClick={handleVerifyRecon}>
              <span>{lang === 'zh-Hant' ? '鎖定最佳紀錄' : 'LOCK PEAK STREAK'}</span>
            </button>

            {progress.reconDone && (
              <button type="button" className="tac-btn primary deck-primary-cta" onClick={() => { sound.click(); setTraceFrames([]); onPhaseChange('breach'); }}>
                <span>{lang === 'zh-Hant' ? '前往 Phase 2 突入' : 'PROCEED TO BREACH'}</span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {phase === 'breach' && (
        <BreachPanel
          locks={CH06_LOCKS}
          solvedLocks={solvedLocks}
          lang={lang}
          onMistake={() => onUpdateProgress((p) => ({ ...p, breachMistakes: p.breachMistakes + 1 }))}
          onTraceLoaded={(frames) => {
            setTraceFrames(frames);
            setStepIdx(0);
            setAutoPlaySeq((s) => s + 1);
          }}
          onSolvedLock={(idx, all) => {
            const next = [...solvedLocks];
            next[idx] = true;
            setSolvedLocks(next);
            if (all) {
              onCutIn({ tag: 'SCANNER READY', title: 'ALGORITHM LOCKS CLEARED', tone: 'lime' });
              onUpdateProgress((p) => ({
                ...p,
                breachCleared: true,
                completedPhases: p.completedPhases.includes('breach') ? p.completedPhases : [...p.completedPhases, 'breach'],
              }));
            }
          }}
          onProceedToBattle={() => {
            setTraceFrames([]);
            setBattleResult(null);
            onPhaseChange('battle');
          }}
        />
      )}

      {phase === 'battle' && (
        <div className="deck-stack">
          <p className="mission-goal">
            {lang === 'zh-Hant'
              ? '實作 longestRun(readings)：回傳連續出現最多次 "O" 的長度（支援 substring(...).equals("O") 或 charAt(i) == \'O\'），空字串回傳 0。'
              : 'Implement longestRun(readings): return the longest consecutive "O" streak (handle "" safely).'}
          </p>

          <CodeTerminal
            value={code}
            starterCode={CH06_STARTER_CODE}
            activeLine={currentFrame?.line ?? null}
            lang={lang}
            onChange={(next) => onUpdateProgress((p) => ({ ...p, codeDrafts: { ...p.codeDrafts, scanner: next } }))}
          />

          <div className="deck-actions">
            <button type="button" className="tac-btn primary deck-primary-cta" onClick={handleDeployScanner}>
              <Zap size={15} />
              <span>{t(UI_COPY.runDeploy, lang)}</span>
            </button>
            {battleComplete && (
              <button type="button" className="tac-btn lime deck-primary-cta" onClick={() => { sound.click(); onPhaseChange('debrief'); }}>
                <span>{lang === 'zh-Hant' ? '查看破關結算' : 'OPEN DEBRIEF'}</span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>

          {chaosNote && (
            <div className="deck-feedback warn">
              <Flame size={13} /> <span>{chaosNote}</span>
            </div>
          )}

          {battleResult && (
            <div className="wave-results">
              {battleResult.failedTrial?.run.error && (
                <div className="wave-err-line mono" style={{ marginBottom: 6 }}>
                  <ShieldAlert size={12} />
                  <span>Line {battleResult.failedTrial.run.error.line}: {battleResult.failedTrial.run.error.message}</span>
                </div>
              )}
              <div className="wave-pills">
                {battleResult.trials.map((tr) => {
                  const isSel = inspectedTrial?.spec.id === tr.spec.id;
                  return (
                    <button
                      key={tr.spec.id}
                      type="button"
                      className={`wave-pill mono ${tr.passed ? 'pass' : 'fail'} ${isSel ? 'selected' : ''}`}
                      onClick={() => {
                        sound.click();
                        setInspectedTrial(tr);
                        setTraceFrames(tr.run.frames);
                        setStepIdx(0);
                        setAutoPlaySeq((s) => s + 1);
                      }}
                    >
                      <span>W{tr.waveIndex + 1} · "{tr.spec.stream}"</span>
                      <span>{tr.passed ? `✓ ${tr.actual}` : `✕ ${tr.actual ?? 'ERR'}/${tr.spec.expected}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'debrief' && (
        <div className="debrief-card">
          <div className="debrief-rank-row">
            <div className="debrief-rank">{progress.rank ?? 'S'}</div>
            <div>
              <div className="debrief-chip mono">{meta.chipName} SYNCED</div>
              <h2 className="deck-heading" style={{ marginTop: 4 }}>
                {lang === 'zh-Hant' ? '雜訊幻影清除完畢' : 'Pulse Scanner Online'}
              </h2>
            </div>
          </div>

          <p className="deck-copy">
            {lang === 'zh-Hant'
              ? '你已掌握單次走訪與邊界處理，準備迎接 Act II 最終章 Ch.07 矩陣掃描雷達！'
              : 'You mastered single-pass streak tracking! Final Act II mission ahead.'}
          </p>

          <div className="deck-actions">
            <button type="button" className="tac-btn primary deck-primary-cta" onClick={() => { sound.deploy(); onOpenChapter(7); }}>
              <span>{lang === 'zh-Hant' ? '下一關：Ch.07 矩陣雷達' : 'NEXT: CH.07 RADAR MATRIX'}</span>
              <ArrowRight size={15} />
            </button>
            <button type="button" className="tac-btn ghost" onClick={() => { sound.click(); onBackToMap(); }}>
              {t(UI_COPY.backToMap, lang)}
            </button>
          </div>
        </div>
      )}
    </MissionStageLayout>
  );
};
