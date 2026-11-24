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
import { MISSION_BRIEFINGS } from '../../game/missionBriefings';
import { ChapterProgress, computeRank } from '../../game/store';
import { PhaseId } from '../../game/types';
import { BreachPanel } from '../BreachPanel';
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MissionPopup } from '../MissionPopup';
import { MissionStageLayout, ReactiveFeedbackInfo } from '../MissionStageLayout';
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
  skipBriefings?: boolean;
  onToggleSkipBriefings?: (next: boolean) => void;
  guideRequestSeq?: number;
  suppressAutoBriefing?: boolean;
  chaosChargeTrigger?: { start: number; gain: number; target: number; seq: number } | null;
}

type PopupKind = null | 'briefing' | 'recon-clear' | 'breach-clear' | 'boss-clear';

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
  skipBriefings = false,
  onToggleSkipBriefings,
  guideRequestSeq = 0,
  suppressAutoBriefing = false,
  chaosChargeTrigger,
}) => {
  const meta = CAMPAIGN_CHAPTERS.find((c) => c.id === 5)!;
  const brief = MISSION_BRIEFINGS[5];

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
  const [feedbackBar, setFeedbackBar] = useState<ReactiveFeedbackInfo | null>(null);
  const timersRef = useRef<number[]>([]);

  // Guided Popups
  const [popup, setPopup] = useState<PopupKind>(() =>
    phase !== 'debrief' && !skipBriefings && !suppressAutoBriefing ? 'briefing' : null,
  );
  const prevPhaseRef = useRef<PhaseId>(phase);
  const lastGuideSeqRef = useRef(guideRequestSeq);
  const suppressNextBriefRef = useRef(false);

  useEffect(() => {
    return () => timersRef.current.forEach((id) => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    if (prevPhaseRef.current === phase) return;
    prevPhaseRef.current = phase;
    setFeedbackBar(null);
    if (suppressNextBriefRef.current) {
      suppressNextBriefRef.current = false;
      setPopup(null);
      return;
    }
    if (phase !== 'debrief' && !skipBriefings && !suppressAutoBriefing) {
      setPopup('briefing');
    } else {
      setPopup(null);
    }
  }, [phase, skipBriefings, suppressAutoBriefing]);

  useEffect(() => {
    if (guideRequestSeq !== lastGuideSeqRef.current) {
      lastGuideSeqRef.current = guideRequestSeq;
      if (phase !== 'debrief') setPopup('briefing');
    }
  }, [guideRequestSeq, phase]);

  useEffect(() => {
    if (!chaosChargeTrigger) return;
    suppressNextBriefRef.current = true;
    setPopup(null);
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
      setFeedbackBar(null);
      onCutIn({ tag: 'GM CHAOS', title: `${tr.actual} ROUNDS VERIFIED!`, tone: 'lime' });
    } else {
      sound.hitError();
      setChaosNote(`GM Chaos failed: got ${tr.actual ?? 'ERR'}, need ${spec.expected}`);
      setFeedbackBar({ mood: 'danger', text: `Got ${tr.actual ?? 'ERR'}, expected ${spec.expected}.` });
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
    setFeedbackBar({
      mood: 'danger',
      text:
        lang === 'zh-Hant'
          ? 'charge -= 3 讓電量一路變負，while (charge < 12) 永遠不結束所以熔斷！現在按下 PULSE 充能。'
          : 'charge -= 3 goes negative forever so while (charge < 12) never exits! Now pulse-charge to 14.',
    });
    if (chargeVal >= 14) {
      onUpdateProgress((p) => ({
        ...p,
        reconDone: true,
        completedPhases: p.completedPhases.includes('recon') ? p.completedPhases : [...p.completedPhases, 'recon'],
      }));
      setPopup('recon-clear');
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
      setFeedbackBar(null);
      onUpdateProgress((p) => ({
        ...p,
        reconDone: true,
        completedPhases: p.completedPhases.includes('recon') ? p.completedPhases : [...p.completedPhases, 'recon'],
      }));
      setPopup('recon-clear');
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
        setFeedbackBar(null);
        onCutIn({ tag: 'SEC-05 RESTORED', title: `INFINITE COIL DEFEATED // ${rank}-RANK`, tone: 'lime' });
        onUpdateProgress((p) => ({
          ...p,
          rank,
          completedPhases: p.completedPhases.includes('battle') ? p.completedPhases : [...p.completedPhases, 'battle'],
        }));
        setPopup('boss-clear');
      } else {
        onUpdateProgress((p) => ({ ...p, battleMistakes: p.battleMistakes + 1 }));
        const fail = res.failedTrial;
        setFeedbackBar({
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

  const stepBanner = useMemo(() => {
    const openGuide = () => setPopup('briefing');
    if (phase === 'recon') {
      if (!infiniteSeen) {
        return {
          stepTag: 'STEP 1 / 2',
          instruction: lang === 'zh-Hant' ? '先觸發一次無窮迴圈熔斷實驗' : 'Trip the infinite loop breaker once',
          onOpenGuide: openGuide,
        };
      }
      return {
        stepTag: 'STEP 2 / 2',
        instruction: lang === 'zh-Hant' ? '按 PULSE (+4) 充能至 14 以上' : 'Pulse-charge from 3 to >= 14',
        onOpenGuide: openGuide,
      };
    }
    if (phase === 'breach') {
      return {
        stepTag: 'PHASE 2 · BREACH',
        instruction: lang === 'zh-Hant' ? '追蹤迴圈進入條件與跳出次數' : 'Trace entry guards and loop counts',
        onOpenGuide: openGuide,
      };
    }
    if (phase === 'battle') {
      return {
        stepTag: 'BOSS BATTLE',
        instruction: lang === 'zh-Hant' ? '實作 rounds(start, gain, target) 累積輪數' : 'Implement rounds(start, gain, target) cleanly',
        onOpenGuide: openGuide,
      };
    }
    return undefined;
  }, [phase, infiniteSeen, lang]);

  const currentBrief =
    phase === 'breach' ? brief.breach : phase === 'battle' ? brief.battle : brief.recon;

  const popupConfig = (() => {
    if (popup === 'briefing') {
      return {
        open: true,
        variant: 'briefing' as const,
        badge:
          phase === 'breach'
            ? lang === 'zh-Hant' ? '階段 2 · 邏輯鎖' : 'PHASE 2 · BREACH'
            : phase === 'battle'
              ? lang === 'zh-Hant' ? '階段 3 · 實戰對決' : 'PHASE 3 · BOSS'
              : lang === 'zh-Hant' ? '階段 1 · 現場偵查' : 'PHASE 1 · RECON',
        title: t(currentBrief.title, lang),
        steps: currentBrief.steps.map((s) => t(s, lang)),
        primaryLabel: lang === 'zh-Hant' ? '知道了，開始！' : 'GOT IT · START',
        onPrimary: () => setPopup(null),
      };
    }
    if (popup === 'recon-clear') {
      return {
        open: true,
        variant: 'clear' as const,
        badge: lang === 'zh-Hant' ? '偵查成功' : 'PHASE 1 CLEARED',
        title: t(brief.recon.clearTitle, lang),
        subtitle: t(brief.recon.takeaway, lang),
        primaryLabel: lang === 'zh-Hant' ? '前往 Phase 2：邏輯鎖' : 'NEXT: BREACH',
        secondaryLabel: lang === 'zh-Hant' ? '留在此頁' : 'Stay here',
        onPrimary: () => {
          setPopup(null);
          setTraceFrames([]);
          onPhaseChange('breach');
        },
        onSecondary: () => setPopup(null),
      };
    }
    if (popup === 'breach-clear') {
      return {
        open: true,
        variant: 'clear' as const,
        badge: lang === 'zh-Hant' ? '電圈解鎖' : 'PHASE 2 CLEARED',
        title: t(brief.breach.clearTitle, lang),
        subtitle: t(brief.breach.takeaway, lang),
        primaryLabel: lang === 'zh-Hant' ? '迎戰關卡 Boss' : 'START BOSS BATTLE',
        secondaryLabel: lang === 'zh-Hant' ? '留在此頁' : 'Stay here',
        onPrimary: () => {
          setPopup(null);
          setTraceFrames([]);
          setBattleResult(null);
          onPhaseChange('battle');
        },
        onSecondary: () => setPopup(null),
      };
    }
    if (popup === 'boss-clear') {
      return {
        open: true,
        variant: 'clear' as const,
        badge: `${meta.chipName} · RANK ${progress.rank ?? 'S'}`,
        rank: progress.rank ?? 'S',
        title: t(brief.battle.clearTitle, lang),
        subtitle: t(brief.battle.takeaway, lang),
        primaryLabel: lang === 'zh-Hant' ? '查看破關獎勵' : 'VIEW RANK & REWARD',
        secondaryLabel: lang === 'zh-Hant' ? '留在戰場' : 'Stay here',
        onPrimary: () => {
          setPopup(null);
          onPhaseChange('debrief');
        },
        onSecondary: () => setPopup(null),
      };
    }
    return null;
  })();

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
      feedbackBar={feedbackBar}
      stepBanner={stepBanner}
      traceFrames={traceFrames}
      stepIdx={stepIdx}
      onStepChange={setStepIdx}
      autoPlaySeq={autoPlaySeq}
      stdout={stdoutShown}
      lang={lang}
    >
      {phase === 'recon' && (
        <div className="deck-stack">
          {!infiniteSeen ? (
            <>
              <p className="deck-copy">
                {lang === 'zh-Hant'
                  ? '先按下方按鈕執行一段壞掉的 while 迴圈，看安全熔斷器為何跳開！'
                  : 'Fire the corrupted while loop first to see why an infinite loop trips the safety breaker.'}
              </p>

              <button type="button" className="tac-btn crimson deck-primary-cta" onClick={handleTestInfinite}>
                <AlertTriangle size={15} />
                <span>{lang === 'zh-Hant' ? 'TEST CORRUPTED LOOP（測無窮迴圈）' : 'TEST CORRUPTED LOOP'}</span>
              </button>
            </>
          ) : (
            <>
              <div className="step-done-pill">
                <span className="mono">
                  {lang === 'zh-Hant' ? '✓ 已見證負向無窮迴圈熔斷' : '✓ Infinite loop breaker seen'}
                </span>
                <button
                  type="button"
                  className="step-adjust-btn"
                  onClick={() => {
                    setChargeVal(3);
                    setRoundVal(0);
                    setReconStatus('idle');
                  }}
                >
                  Reset
                </button>
              </div>

              <div className="control-tile">
                <div className="deck-row-between">
                  <span className="mono" style={{ fontSize: 12, color: 'var(--cyan)' }}>START 3 · GAIN +4 · TARGET 14</span>
                  <strong className="mono" style={{ fontSize: 16 }}>
                    {chargeVal} / 14 ({roundVal} {lang === 'zh-Hant' ? '輪' : 'rounds'})
                  </strong>
                </div>
              </div>

              <button type="button" className="tac-btn primary deck-primary-cta" onClick={handlePulse}>
                <Zap size={15} />
                <span>PULSE (+4)</span>
              </button>
            </>
          )}

          {progress.reconDone && (
            <button
              type="button"
              className="quiet-proceed-link"
              onClick={() => {
                sound.click();
                setTraceFrames([]);
                onPhaseChange('breach');
              }}
            >
              <span>{lang === 'zh-Hant' ? '前往 Phase 2：邏輯鎖' : 'Proceed to Phase 2: Breach'}</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}

      {phase === 'breach' && (
        <BreachPanel
          locks={CH05_LOCKS}
          solvedLocks={solvedLocks}
          lang={lang}
          onMistake={() => {
            onUpdateProgress((p) => ({ ...p, breachMistakes: p.breachMistakes + 1 }));
            setFeedbackBar({
              mood: 'danger',
              text: lang === 'zh-Hant' ? '檢查迴圈進入條件與最後一次 < / <= 邊界！' : 'Check entry guard and < vs <= boundary!',
            });
          }}
          onTraceLoaded={(frames) => {
            setFeedbackBar(null);
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
              setPopup('breach-clear');
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

      {popupConfig && (
        <MissionPopup
          {...popupConfig}
          lang={lang}
          skipBriefings={skipBriefings}
          onToggleSkipBriefings={onToggleSkipBriefings}
        />
      )}
    </MissionStageLayout>
  );
};
