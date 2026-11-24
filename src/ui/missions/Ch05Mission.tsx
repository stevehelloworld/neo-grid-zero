import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Flame, ShieldAlert, Zap } from 'lucide-react';
import { sound } from '../../engine/audio/synth';
import { Lang, t, UI_COPY } from '../../engine/i18n/text';
import { runStatements, TraceFrame } from '../../engine/vm';
import { CAMPAIGN_CHAPTERS } from '../../game/campaignData';
import {
  CH05_INFINITE_DEMO,
  CH05_LOCKS,
  CH05_STARTER_CODE,
  Ch05BattleResult,
  Ch05TrialResult,
  Ch05TrialSpec,
  evaluateSurgeBattle,
  expectedRounds,
} from '../../game/chapters/ch05Surge';
import { ChapterProgress, computeRank } from '../../game/store';
import { PhaseId } from '../../game/types';
import { BreachPanel } from '../BreachPanel';
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MissionStageLayout } from '../MissionStageLayout';
import { LoopTowerCanvas } from '../stages/LoopTowerCanvas';

export interface Ch05MissionProps {
  lang: Lang;
  phase: PhaseId;
  onPhaseChange: (p: PhaseId) => void;
  progress: ChapterProgress;
  onUpdateProgress: (updater: (prev: ChapterProgress) => ChapterProgress) => void;
  onUnlockChip: (chipId: string) => void;
  onCutIn: (c: Omit<CutInData, 'id'>) => void;
  onOpenChapter: (chapterId: number) => void;
  onBackToMap: () => void;
  chaosChargeTrigger?: { start: number; gain: number; target: number; seq: number } | null;
}

export const Ch05Mission: React.FC<Ch05MissionProps> = ({
  lang,
  phase,
  onPhaseChange,
  progress,
  onUpdateProgress,
  onUnlockChip,
  onCutIn,
  onOpenChapter,
  onBackToMap,
  chaosChargeTrigger,
}) => {
  const meta = CAMPAIGN_CHAPTERS.find((c) => c.id === 5)!;

  // Phase 1: Recon state
  const [infiniteSeen, setInfiniteSeen] = useState(progress.reconDone);
  const [chargeVal, setChargeVal] = useState(progress.reconDone ? 15 : 3);
  const [roundVal, setRoundVal] = useState(progress.reconDone ? 3 : 0);
  const [reconStatus, setReconStatus] = useState<'idle' | 'ok' | 'error'>(progress.reconDone ? 'ok' : 'idle');
  const [pulseKey, setPulseKey] = useState(0);

  // Phase 2: Breach locks
  const [solvedLocks, setSolvedLocks] = useState<boolean[]>(
    progress.breachCleared ? [true, true, true] : [false, false, false],
  );

  // Phase 3: Battle
  const code = progress.codeDrafts.surge ?? CH05_STARTER_CODE;
  const [battleResult, setBattleResult] = useState<Ch05BattleResult | null>(null);
  const [inspectedTrial, setInspectedTrial] = useState<Ch05TrialResult | null>(null);
  const [chaosNote, setChaosNote] = useState<string | null>(null);

  const [traceFrames, setTraceFrames] = useState<TraceFrame[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [autoPlaySeq, setAutoPlaySeq] = useState(0);
  const timersRef = useRef<number[]>([]);

  const [mira, setMira] = useState<{ mood: 'neutral' | 'alert' | 'danger' | 'success'; text: string }>({
    mood: 'alert',
    text:
      lang === 'zh-Hant'
        ? '蓄電高塔迴圈熔斷！先點「測無窮迴圈」目擊負向充電，再按 PULSE (+4) 充至 14。'
        : 'Surge Tower tripped a breaker! Test the infinite loop first, then pulse-charge from 3 to 14.',
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
            ? '注意 while 進入條件與邊界終止時機，解開三道電塔鎖！'
            : 'Watch entry guards and boundary termination across all 3 iteration locks!',
      });
    } else if (phase === 'battle') {
      setMira({
        mood: 'alert',
        text:
          lang === 'zh-Hant'
            ? '實作 rounds(start, gain, target)：累積加 gain 到達或超過 target，若一開始已達標回傳 0。'
            : 'Implement rounds(start, gain, target): return rounds needed to reach target (0 if start >= target).',
      });
    } else if (phase === 'debrief') {
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? '蓄電高塔迴圈穩定！下一站進入 Ch.06 脈衝掃描站。'
            : 'Surge Tower stabilized! Advance to Ch.06 Pulse Scanner.',
      });
    }
  }, [phase, lang]);

  useEffect(() => {
    if (!chaosChargeTrigger) return;
    onPhaseChange('battle');
    timersRef.current.forEach((id) => window.clearTimeout(id));
    const spec: Ch05TrialSpec = {
      id: `gm-${Date.now()}`,
      start: chaosChargeTrigger.start,
      gain: chaosChargeTrigger.gain,
      target: chaosChargeTrigger.target,
      expected: expectedRounds(chaosChargeTrigger.start, chaosChargeTrigger.gain, chaosChargeTrigger.target),
    };
    const res = evaluateSurgeBattle(code, spec);
    const tr = res.trials[0];
    setBattleResult(res);
    setInspectedTrial(tr);
    setTraceFrames(tr.run.frames);
    setStepIdx(0);
    setAutoPlaySeq((s) => s + 1);
    setPulseKey((k) => k + 1);
    if (tr.passed) {
      sound.shieldBreak();
      setChaosNote(`GM Chaos (${spec.start}, +${spec.gain}, target ${spec.target}) → ${tr.actual} rounds ✓`);
      onCutIn({ tag: 'GM CHAOS', title: `${tr.actual} ROUNDS VERIFIED!`, tone: 'lime' });
    } else {
      sound.hitError();
      setChaosNote(`GM Chaos failed: got ${tr.actual ?? 'ERR'}, need ${spec.expected}`);
      onCutIn({ tag: 'GM CHAOS', title: 'LOOP BREACH!', tone: 'danger' });
    }
  }, [chaosChargeTrigger]);

  const handleTestInfinite = () => {
    const run = runStatements(CH05_INFINITE_DEMO, { maxSteps: 60 });
    setTraceFrames(run.frames);
    setStepIdx(Math.max(0, run.frames.length - 1));
    setAutoPlaySeq((s) => s + 1);
    setInfiniteSeen(true);
    setReconStatus('error');
    setPulseKey((k) => k + 1);
    sound.hitError();
    onCutIn({ tag: 'BREAKER TRIPPED', title: 'INFINITE LOOP DETECTED!', tone: 'danger' });
    setMira({
      mood: 'danger',
      text:
        lang === 'zh-Hant'
          ? 'charge -= 3 讓數值一路變負、永遠 < 12 觸發熔斷！現在手動 PULSE 充到 14。'
          : 'charge -= 3 drives charge negative forever, tripping the breaker! Now pulse-charge to 14.',
    });
    if (chargeVal >= 14) {
      onUpdateProgress((p) => ({
        ...p,
        reconDone: true,
        completedPhases: p.completedPhases.includes('recon') ? p.completedPhases : [...p.completedPhases, 'recon'],
      }));
    }
  };

  const handlePulse = () => {
    if (chargeVal >= 14 && reconStatus === 'ok') return;
    const nextCharge = chargeVal + 4;
    const nextRound = roundVal + 1;
    setChargeVal(nextCharge);
    setRoundVal(nextRound);
    setPulseKey((k) => k + 1);
    if (nextCharge >= 14) {
      sound.shieldBreak();
      setReconStatus('ok');
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? `第 ${nextRound} 輪充到 ${nextCharge} (≥ 14)，while 條件變成 false 結束！`
            : `Round ${nextRound} hit ${nextCharge} (>= 14), so while (charge < 14) becomes false and stops!`,
      });
      if (infiniteSeen) {
        onUpdateProgress((p) => ({
          ...p,
          reconDone: true,
          completedPhases: p.completedPhases.includes('recon') ? p.completedPhases : [...p.completedPhases, 'recon'],
        }));
      }
    } else {
      sound.beam();
      setReconStatus('idle');
    }
  };

  const handleDeploySurge = () => {
    setChaosNote(null);
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    sound.deploy();

    const res = evaluateSurgeBattle(code);
    setBattleResult(res);

    res.trials.forEach((tr, idx) => {
      const tid = window.setTimeout(() => {
        setInspectedTrial(tr);
        setTraceFrames(tr.run.frames);
        setStepIdx(Math.max(0, tr.run.frames.length - 1));
        setPulseKey((k) => k + 1);
        if (tr.passed) {
          sound.beam();
          if (idx % 3 === 2) sound.shieldBreak();
        } else {
          sound.hitError();
          onCutIn({
            tag: `WAVE ${tr.waveIndex + 1} FAIL`,
            title: tr.run.error?.kind === 'timeout' ? 'INFINITE LOOP BREAKER!' : `GOT ${tr.actual} (NEED ${tr.spec.expected})`,
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
        onCutIn({ tag: 'SEC-05 RESTORED', title: `INFINITE COIL DEFEATED // ${rank}-RANK`, tone: 'lime' });
        onUpdateProgress((p) => ({
          ...p,
          rank,
          completedPhases: p.completedPhases.includes('battle') ? p.completedPhases : [...p.completedPhases, 'battle'],
        }));
        setMira({
          mood: 'success',
          text:
            lang === 'zh-Hant'
              ? `9 輪測試全通！解鎖 LOOP THRUSTER 並獲得 ${rank} 級評價！`
              : `All 9 charge trials stabilized! Earned ${rank}-Rank and LOOP THRUSTER.`,
        });
      } else {
        onUpdateProgress((p) => ({ ...p, battleMistakes: p.battleMistakes + 1 }));
        const fail = res.failedTrial;
        setMira({
          mood: 'danger',
          text: fail?.run.error
            ? `Line ${fail.run.error.line}: ${fail.run.error.message}`
            : `(${fail?.spec.start}, +${fail?.spec.gain}, target=${fail?.spec.target}) returned ${fail?.actual}, expected ${fail?.spec.expected}.`,
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
        <LoopTowerCanvas
          mode={phase === 'recon' ? 'recon' : 'battle'}
          chargeValue={phase === 'recon' ? chargeVal : inspectedTrial?.spec.start ?? 3}
          targetValue={phase === 'recon' ? 14 : inspectedTrial?.spec.target ?? 15}
          roundCount={phase === 'recon' ? roundVal : inspectedTrial?.actual ?? 0}
          activeFrame={currentFrame}
          bossShields={3}
          brokenShields={brokenShields}
          status={phase === 'recon' ? reconStatus : battleResult ? (battleResult.passed ? 'ok' : 'error') : 'idle'}
          pulseKey={pulseKey}
        />
      }
      bossHud={
        phase === 'battle'
          ? { name: 'INFINITE COIL', shields: 3, broken: brokenShields }
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
              {lang === 'zh-Hant' ? '脈衝蓄能與無窮迴圈熔斷' : 'Pulse Charge & Breaker Lab'}
            </h2>
            <button type="button" className="tac-btn ghost compact-btn" onClick={handleTestInfinite}>
              <AlertTriangle size={13} />
              <span>{infiniteSeen ? '✓ ' : ''}{lang === 'zh-Hant' ? '測無窮迴圈' : 'Test Loop Bug'}</span>
            </button>
          </div>

          <div className="control-tile">
            <div className="deck-row-between">
              <div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--cyan)' }}>START 3 · GAIN +4 · TARGET 14</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                  charge = {chargeVal} · rounds = {roundVal}
                </div>
              </div>
              <button
                type="button"
                className="tac-btn ghost compact-btn"
                onClick={() => {
                  setChargeVal(3);
                  setRoundVal(0);
                  setReconStatus('idle');
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="deck-row-between">
            <span className="deck-hint mono">
              {infiniteSeen ? '✓ Breaker seen' : 'Test loop bug'} · {chargeVal >= 14 ? '✓ Target reached' : 'Pulse to >= 14'}
            </span>
          </div>

          <div className="deck-actions">
            <button type="button" className={`tac-btn ${progress.reconDone ? 'ghost' : 'primary'} deck-primary-cta`} onClick={handlePulse}>
              <Zap size={15} />
              <span>PULSE (+4)</span>
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
          locks={CH05_LOCKS}
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
              onCutIn({ tag: 'COIL UNLOCKED', title: 'LOOP LOCKS CLEARED', tone: 'lime' });
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
              ? '實作 rounds(start, gain, target)：每輪加上 gain，回傳電量達到或超過 target 所需輪數（start >= target 時回傳 0）。'
              : 'Implement rounds(start, gain, target): return rounds needed adding gain each step to reach or exceed target (0 if start >= target).'}
          </p>

          <CodeTerminal
            value={code}
            starterCode={CH05_STARTER_CODE}
            activeLine={currentFrame?.line ?? null}
            lang={lang}
            onChange={(next) => onUpdateProgress((p) => ({ ...p, codeDrafts: { ...p.codeDrafts, surge: next } }))}
          />

          <div className="deck-actions">
            <button type="button" className="tac-btn primary deck-primary-cta" onClick={handleDeploySurge}>
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
                      <span>W{tr.waveIndex + 1} · ({tr.spec.start},+{tr.spec.gain}→{tr.spec.target})</span>
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
                {lang === 'zh-Hant' ? '蓄電高塔迴圈穩定' : 'Surge Tower Stabilized'}
              </h2>
            </div>
          </div>

          <p className="deck-copy">
            {lang === 'zh-Hant'
              ? '你排除無窮迴圈並精準掌握 while/for 邊界！下一關：第 06 話脈衝掃描站。'
              : 'You defeated INFINITE COIL across overshoot and zero-round cases!'}
          </p>

          <div className="deck-actions">
            <button type="button" className="tac-btn primary deck-primary-cta" onClick={() => { sound.deploy(); onOpenChapter(6); }}>
              <span>{lang === 'zh-Hant' ? '下一關：Ch.06 脈衝掃描' : 'NEXT: CH.06 SCANNER'}</span>
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
