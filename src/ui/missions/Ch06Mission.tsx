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
import { MISSION_BRIEFINGS } from '../../game/missionBriefings';
import { ChapterProgress, computeRank } from '../../game/store';
import { PhaseId } from '../../game/types';
import { BreachPanel } from '../BreachPanel';
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MissionPopup } from '../MissionPopup';
import { MissionStageLayout, ReactiveFeedbackInfo } from '../MissionStageLayout';
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
  skipBriefings?: boolean;
  onToggleSkipBriefings?: (next: boolean) => void;
  guideRequestSeq?: number;
  suppressAutoBriefing?: boolean;
  chaosSignalTrigger?: { stream: string; seq: number } | null;
}

type PopupKind = null | 'briefing' | 'recon-clear' | 'breach-clear' | 'boss-clear';

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
  skipBriefings = false,
  onToggleSkipBriefings,
  guideRequestSeq = 0,
  suppressAutoBriefing = false,
  chaosSignalTrigger,
}) => {
  const meta = CAMPAIGN_CHAPTERS.find((c) => c.id === 6)!;
  const brief = MISSION_BRIEFINGS[6];

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
    if (!chaosSignalTrigger) return;
    suppressNextBriefRef.current = true;
    setPopup(null);
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
      setFeedbackBar(null);
      onCutIn({ tag: 'GM CHAOS', title: `STREAK ${tr.actual} VERIFIED!`, tone: 'lime' });
    } else {
      sound.hitError();
      setChaosNote(`GM Chaos "${clean}" failed: got ${tr.actual ?? 'ERR'}, need ${spec.expected}`);
      setFeedbackBar({ mood: 'danger', text: `Stream "${clean}" returned ${tr.actual ?? 'ERR'}, expected ${spec.expected}.` });
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
    if (peakGuess.trim() !== '3') {
      sound.hitError();
      setReconStatus('error');
      setFeedbackBar({
        mood: 'danger',
        text:
          lang === 'zh-Hant'
            ? '再看一下左圖掃描紀錄中的 Best Peak（最長連續 O 的長度）是多少！'
            : 'Check BEST PEAK on the scanner canvas—what was the longest unbroken O streak?',
      });
      return;
    }
    sound.breachSuccess();
    setReconStatus('ok');
    setFeedbackBar(null);
    onUpdateProgress((p) => ({
      ...p,
      reconDone: true,
      completedPhases: p.completedPhases.includes('recon') ? p.completedPhases : [...p.completedPhases, 'recon'],
    }));
    setPopup('recon-clear');
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
        setFeedbackBar(null);
        onCutIn({ tag: 'SEC-06 RESTORED', title: `NOISE PHANTOM DEFEATED // ${rank}-RANK`, tone: 'lime' });
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

  const scanFinished = cursorIdx >= RECON_STREAM.length - 1;

  const stepBanner = useMemo(() => {
    const openGuide = () => setPopup('briefing');
    if (phase === 'recon') {
      if (!scanFinished) {
        return {
          stepTag: 'STEP 1 / 2',
          instruction: lang === 'zh-Hant' ? '按 STEP PULSE 逐格掃完 8 個脈衝訊號' : 'Click STEP PULSE to scan all 8 signals',
          onOpenGuide: openGuide,
        };
      }
      return {
        stepTag: 'STEP 2 / 2',
        instruction: lang === 'zh-Hant' ? '輸入過程出現的最長連續 O 長度' : 'Enter the longest consecutive O streak',
        onOpenGuide: openGuide,
      };
    }
    if (phase === 'breach') {
      return {
        stepTag: 'PHASE 2 · BREACH',
        instruction: lang === 'zh-Hant' ? '小心全負數 traps 破解 4 道演算法鎖' : 'Watch negative extrema & crack 4 locks',
        onOpenGuide: openGuide,
      };
    }
    if (phase === 'battle') {
      return {
        stepTag: 'BOSS BATTLE',
        instruction: lang === 'zh-Hant' ? '實作 longestRun(readings) 並部署程式' : 'Implement longestRun(readings) & deploy',
        onOpenGuide: openGuide,
      };
    }
    return undefined;
  }, [phase, scanFinished, lang]);

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
        badge: lang === 'zh-Hant' ? '掃描核心解鎖' : 'PHASE 2 CLEARED',
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
          {!scanFinished ? (
            <button
              type="button"
              className="tac-btn primary deck-primary-cta"
              onClick={handleStepRecon}
            >
              <StepForward size={15} />
              <span>STEP PULSE ({cursorIdx + 1} / {RECON_STREAM.length})</span>
            </button>
          ) : (
            <>
              <div className="step-done-pill">
                <span className="mono">✓ {RECON_STREAM} scanned · Best Peak ready</span>
                <button
                  type="button"
                  className="step-adjust-btn"
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

              <label className="deck-field">
                <span className="deck-field-label mono" style={{ color: 'var(--lime)' }}>
                  {lang === 'zh-Hant' ? '輸入最長連續 O 的長度 (Best Peak)：' : 'Enter longest consecutive O streak:'}
                </span>
                <input
                  type="number"
                  className="deck-input mono"
                  value={peakGuess}
                  onChange={(e) => setPeakGuess(e.target.value)}
                  placeholder="?"
                />
              </label>

              <button type="button" className="tac-btn primary deck-primary-cta" onClick={handleVerifyRecon}>
                <span>{lang === 'zh-Hant' ? '鎖定答案' : 'LOCK ANSWER'}</span>
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
          locks={CH06_LOCKS}
          solvedLocks={solvedLocks}
          lang={lang}
          onMistake={() => {
            onUpdateProgress((p) => ({ ...p, breachMistakes: p.breachMistakes + 1 }));
            setFeedbackBar({
              mood: 'danger',
              text: lang === 'zh-Hant' ? '小心負數極值起始與連續次數歸零的時機！' : 'Watch negative-number initialization and reset timing!',
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
              onCutIn({ tag: 'SCANNER READY', title: 'ALGORITHM LOCKS CLEARED', tone: 'lime' });
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
                      <span>W{tr.waveIndex + 1} · &quot;{tr.spec.stream}&quot;</span>
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
