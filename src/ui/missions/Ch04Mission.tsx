import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Flame, ShieldAlert, Zap } from 'lucide-react';
import { sound } from '../../engine/audio/synth';
import { Lang, t, UI_COPY } from '../../engine/i18n/text';
import { runMethodCall, TraceFrame } from '../../engine/vm';
import { CAMPAIGN_CHAPTERS } from '../../game/campaignData';
import {
  CH04_CORRUPTED_AUTOPILOT,
  CH04_LOCKS,
  CH04_RECON_DRONES,
  CH04_STARTER_CODE,
  evaluateSentinelBattle,
} from '../../game/chapters/ch04Sentinel';
import { MISSION_BRIEFINGS } from '../../game/missionBriefings';
import { ChapterProgress, computeRank } from '../../game/store';
import { DroneFlightResult, DroneSpec, PhaseId, SentinelBattleResult } from '../../game/types';
import { BreachPanel } from '../BreachPanel';
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MissionPopup } from '../MissionPopup';
import { MissionStageLayout, ReactiveFeedbackInfo } from '../MissionStageLayout';
import { ActiveDroneVisual, SentinelCanvas } from '../stages/SentinelCanvas';

export interface Ch04MissionProps {
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
  chaosDroneTrigger?: { drone: DroneSpec; seq: number } | null;
}

type PopupKind = null | 'briefing' | 'recon-clear' | 'breach-clear' | 'boss-clear';

export const Ch04Mission: React.FC<Ch04MissionProps> = ({
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
  chaosDroneTrigger,
}) => {
  const meta = CAMPAIGN_CHAPTERS.find((c) => c.id === 4)!;
  const brief = MISSION_BRIEFINGS[4];

  // Phase 1: Recon state
  const [reconIdx, setReconIdx] = useState(0);
  const [reconCleared, setReconCleared] = useState<boolean[]>(
    progress.reconDone ? [true, true, true] : [false, false, false],
  );
  const [autopilotSeen, setAutopilotSeen] = useState(progress.reconDone);
  const [selectedGate, setSelectedGate] = useState<'CLEAR' | 'PRACTICE' | 'WAIT' | null>(null);

  // Phase 2: Breach state
  const [solvedLocks, setSolvedLocks] = useState<boolean[]>(
    progress.breachCleared ? [true, true, true] : [false, false, false],
  );

  // Phase 3: Battle state
  const code = progress.codeDrafts.sentinel ?? CH04_STARTER_CODE;
  const [battleResult, setBattleResult] = useState<SentinelBattleResult | null>(null);
  const [inspectedFlight, setInspectedFlight] = useState<DroneFlightResult | null>(null);
  const [chaosBanner, setChaosBanner] = useState<string | null>(null);

  // Canvas active drone & trace
  const [activeDrone, setActiveDrone] = useState<ActiveDroneVisual | null>(null);
  const [traceFrames, setTraceFrames] = useState<TraceFrame[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [autoPlaySeq, setAutoPlaySeq] = useState(0);
  const [feedbackBar, setFeedbackBar] = useState<ReactiveFeedbackInfo | null>(null);
  const flightCounter = useRef(1);
  const seqTimersRef = useRef<number[]>([]);

  // Guided Popups
  const [popup, setPopup] = useState<PopupKind>(() =>
    phase !== 'debrief' && !skipBriefings && !suppressAutoBriefing ? 'briefing' : null,
  );
  const prevPhaseRef = useRef<PhaseId>(phase);
  const lastGuideSeqRef = useRef(guideRequestSeq);
  const suppressNextBriefRef = useRef(false);

  useEffect(() => {
    return () => {
      seqTimersRef.current.forEach((id) => window.clearTimeout(id));
    };
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

  const launchDroneVisual = (
    drone: DroneSpec,
    actual: string,
    passed: boolean,
    frames: TraceFrame[],
    playTrace = false,
  ) => {
    flightCounter.current += 1;
    setActiveDrone({
      callsign: drone.callsign,
      age: drone.age,
      trained: drone.trained,
      mentor: drone.mentor,
      expected: drone.expected,
      actual,
      passed,
      flightKey: flightCounter.current,
    });
    setTraceFrames(frames);
    setStepIdx(0);
    if (playTrace) {
      setAutoPlaySeq((s) => s + 1);
    }
  };

  useEffect(() => {
    if (!chaosDroneTrigger) return;
    suppressNextBriefRef.current = true;
    setPopup(null);
    onPhaseChange('battle');
    seqTimersRef.current.forEach((id) => window.clearTimeout(id));
    const res = evaluateSentinelBattle(code, chaosDroneTrigger.drone);
    const flight = res.flights[0];
    setInspectedFlight(flight);
    launchDroneVisual(
      flight.drone,
      flight.actual,
      flight.passed,
      flight.run.frames,
      true,
    );
    if (flight.passed) {
      sound.shieldBreak();
      setChaosBanner(
        `GM CHAOS DRONE ${flight.drone.callsign} → ${flight.actual} (VERIFIED)`,
      );
      setFeedbackBar(null);
      onCutIn({ tag: 'GM DRONE', title: `ROUTED → ${flight.actual}`, tone: 'lime' });
    } else {
      sound.hitError();
      setChaosBanner(
        `GM CHAOS DRONE ${flight.drone.callsign} CRASHED (${flight.actual}, need ${flight.drone.expected})`,
      );
      setFeedbackBar({
        mood: 'danger',
        text: `${flight.drone.callsign} returned "${flight.actual}", expected "${flight.drone.expected}".`,
      });
      onCutIn({ tag: 'GM DRONE', title: 'MISROUTED CRASH!', tone: 'danger' });
    }
  }, [chaosDroneTrigger]);

  const handleCorruptedAutopilot = () => {
    const ace = CH04_RECON_DRONES[0];
    const run = runMethodCall(CH04_CORRUPTED_AUTOPILOT, 'access', [
      ace.age,
      ace.trained,
      ace.mentor,
    ]);
    const actual = String(run.returnValue?.value ?? 'ERROR');
    setAutopilotSeen(true);
    sound.hitError();
    launchDroneVisual(ace, actual, false, run.frames, true);
    onCutIn({
      tag: 'BUG DETECTED',
      title: 'age >= 13 HIJACKED ACE PILOT!',
      tone: 'danger',
    });
    setFeedbackBar({
      mood: 'danger',
      text:
        lang === 'zh-Hant'
          ? 'if (age >= 13) 排在最前面，讓 16 歲已受訓的 ACE-16 誤進 PRACTICE！'
          : 'if (age >= 13) runs first, trapping trained 16yo ACE-16 in PRACTICE!',
    });

    if (reconCleared.every(Boolean)) {
      onUpdateProgress((p) => ({
        ...p,
        reconDone: true,
        completedPhases: p.completedPhases.includes('recon')
          ? p.completedPhases
          : [...p.completedPhases, 'recon'],
      }));
      setPopup('recon-clear');
    }
  };

  const handleManualRoute = (lane: 'CLEAR' | 'PRACTICE' | 'WAIT') => {
    const drone = CH04_RECON_DRONES[reconIdx];
    const ok = lane === drone.expected;
    setSelectedGate(lane);
    launchDroneVisual(drone, lane, ok, [], false);

    if (!ok) {
      sound.hitError();
      setFeedbackBar({
        mood: 'danger',
        text:
          lang === 'zh-Hant'
            ? `${drone.callsign} (age=${drone.age}, trained=${drone.trained}, mentor=${drone.mentor}) 不符合 ${lane} 規則！`
            : `${drone.callsign} cannot enter ${lane}—recheck the priority order!`,
      });
      return;
    }

    sound.breachSuccess();
    setFeedbackBar(null);
    const nextCleared = [...reconCleared];
    nextCleared[reconIdx] = true;
    setReconCleared(nextCleared);

    const allDronesRouted = nextCleared.every(Boolean);
    if (allDronesRouted) {
      onUpdateProgress((p) => ({
        ...p,
        reconDone: true,
        completedPhases: p.completedPhases.includes('recon')
          ? p.completedPhases
          : [...p.completedPhases, 'recon'],
      }));
      setPopup('recon-clear');
    } else {
      const nextIdx = nextCleared.findIndex((x) => !x);
      if (nextIdx >= 0) {
        setReconIdx(nextIdx);
      }
    }
  };

  const handleDeploySentinel = () => {
    setChaosBanner(null);
    seqTimersRef.current.forEach((id) => window.clearTimeout(id));
    seqTimersRef.current = [];

    sound.deploy();
    const res = evaluateSentinelBattle(code);
    setBattleResult(res);

    res.flights.forEach((flight, idx) => {
      const tid = window.setTimeout(() => {
        setInspectedFlight(flight);
        launchDroneVisual(
          flight.drone,
          flight.actual,
          flight.passed,
          flight.run.frames,
          !flight.passed,
        );
        if (flight.passed) {
          sound.beam();
          if (idx % 3 === 2) sound.shieldBreak();
        } else {
          sound.hitError();
          onCutIn({
            tag: `WAVE ${flight.waveIndex + 1} CRASH`,
            title: `${flight.drone.callsign} → ${flight.actual} (NEED ${flight.drone.expected})`,
            tone: 'danger',
          });
        }
      }, idx * 700);
      seqTimersRef.current.push(tid);
    });

    const totalDelay = res.flights.length * 700;
    const endTid = window.setTimeout(() => {
      if (res.passed) {
        const rank = computeRank(progress.breachMistakes, progress.battleMistakes);
        sound.missionClear();
        onUnlockChip(meta.chipId);
        setFeedbackBar(null);
        onCutIn({
          tag: 'SEC-04 RESTORED',
          title: `GATEKEEPER DEFEATED // ${rank}-RANK`,
          tone: 'lime',
        });
        onUpdateProgress((prev) => ({
          ...prev,
          rank,
          completedPhases: prev.completedPhases.includes('battle')
            ? prev.completedPhases
            : [...prev.completedPhases, 'battle'],
        }));
        setPopup('boss-clear');
      } else {
        onUpdateProgress((p) => ({ ...p, battleMistakes: p.battleMistakes + 1 }));
        const fail = res.failedFlight;
        setFeedbackBar({
          mood: 'danger',
          text: fail?.run.error
            ? `Line ${fail.run.error.line}: ${fail.run.error.message}`
            : lang === 'zh-Hant'
              ? `${fail?.drone.callsign} 回傳 "${fail?.actual}"，應為 "${fail?.drone.expected}"。`
              : `${fail?.drone.callsign} returned "${fail?.actual}", expected "${fail?.drone.expected}".`,
        });
      }
    }, totalDelay);
    seqTimersRef.current.push(endTid);
  };

  const currentFrame = traceFrames[stepIdx] ?? null;
  const battleComplete = Boolean(progress.rank || progress.completedPhases.includes('battle'));

  const stdoutShown = useMemo(() => {
    if (currentFrame) return currentFrame.stdout;
    return inspectedFlight?.run.stdout ?? '';
  }, [currentFrame, inspectedFlight]);

  const brokenShields = battleResult
    ? battleResult.totalWaves === 1
      ? progress.rank ? 3 : 0
      : battleResult.wavesCleared
    : progress.rank ? 3 : 0;

  const activeDroneCard = CH04_RECON_DRONES[reconIdx];

  const stepBanner = useMemo(() => {
    const openGuide = () => setPopup('briefing');
    if (phase === 'recon') {
      if (!autopilotSeen) {
        return {
          stepTag: 'STEP 1 / 2',
          instruction: lang === 'zh-Hant' ? '按下故障自動駕駛，親眼找出優先序漏洞' : 'Test the broken autopilot to spot the bug',
          onOpenGuide: openGuide,
        };
      }
      return {
        stepTag: 'STEP 2 / 2',
        instruction:
          lang === 'zh-Hant'
            ? `引導無人機 ${reconIdx + 1} / 3 進入正確航道`
            : `Route Drone ${reconIdx + 1} of 3 to the right gate`,
        onOpenGuide: openGuide,
      };
    }
    if (phase === 'breach') {
      return {
        stepTag: 'PHASE 2 · BREACH',
        instruction: lang === 'zh-Hant' ? '破解三道 && / || 與笛摩根邏輯鎖' : 'Crack 3 boolean & De Morgan locks',
        onOpenGuide: openGuide,
      };
    }
    if (phase === 'battle') {
      return {
        stepTag: 'BOSS BATTLE',
        instruction: lang === 'zh-Hant' ? '先檢查 trained && age >= 16，再檢查 PRACTICE' : 'Check trained && age >= 16 before PRACTICE',
        onOpenGuide: openGuide,
      };
    }
    return undefined;
  }, [phase, autopilotSeen, reconIdx, lang]);

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
        badge: lang === 'zh-Hant' ? '閘門解鎖' : 'PHASE 2 CLEARED',
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
        <SentinelCanvas
          mode={phase === 'recon' ? 'recon' : 'battle'}
          activeDrone={activeDrone}
          activeFrame={currentFrame}
          selectedGate={selectedGate}
          bossShields={3}
          brokenShields={brokenShields}
          scrubProgress={traceFrames.length > 0 && currentFrame ? 0.45 + 0.55 * ((stepIdx + 1) / traceFrames.length) : null}
        />
      }
      bossHud={
        phase === 'battle'
          ? { name: 'SENTINEL GATEKEEPER', shields: 3, broken: brokenShields }
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
          {!autopilotSeen ? (
            <>
              <p className="deck-copy">
                {lang === 'zh-Hant'
                  ? '目前自動駕駛的 if-else 順序錯了！先按下下方按鈕，看王牌 ACE-16 發生了什麼事。'
                  : 'The old if-else order is broken. Fire the corrupted autopilot first to see what happens to ACE-16.'}
              </p>

              <button
                type="button"
                className="tac-btn crimson deck-primary-cta"
                onClick={handleCorruptedAutopilot}
              >
                <AlertTriangle size={15} />
                <span>{lang === 'zh-Hant' ? 'TEST CORRUPTED AUTOPILOT（測故障）' : 'TEST CORRUPTED AUTOPILOT'}</span>
              </button>
            </>
          ) : (
            <>
              <div className="step-done-pill">
                <span className="mono">
                  {lang === 'zh-Hant' ? '✓ 已目擊 Bug：if (age >= 13) 搶先攔截了 ACE-16' : '✓ Bug seen: age >= 13 trapped ACE-16'}
                </span>
                <button
                  type="button"
                  className="step-adjust-btn"
                  onClick={handleCorruptedAutopilot}
                >
                  {lang === 'zh-Hant' ? '重看一次' : 'Replay bug'}
                </button>
              </div>

              <div className="rule-strip mono">
                <div>1. <strong style={{ color: 'var(--lime)' }}>CLEAR</strong>: <code>trained &amp;&amp; age &gt;= 16</code></div>
                <div>2. <strong style={{ color: 'var(--cyan)' }}>PRACTICE</strong>: <code>mentor &amp;&amp; age &gt;= 13</code></div>
                <div>3. <strong style={{ color: 'var(--amber)' }}>WAIT</strong>: {lang === 'zh-Hant' ? '其餘條件' : 'all others'}</div>
              </div>

              <div className="focused-drone-card">
                <div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--cyan)' }}>
                    DRONE {reconIdx + 1} / 3
                  </div>
                  <div className="display" style={{ fontSize: 20, fontWeight: 700 }}>
                    {activeDroneCard.callsign}
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-secondary)', textAlign: 'right' }}>
                  <div>age = <strong>{activeDroneCard.age}</strong></div>
                  <div>trained = <strong>{String(activeDroneCard.trained)}</strong> · mentor = <strong>{String(activeDroneCard.mentor)}</strong></div>
                </div>
              </div>

              <div className="deck-three-col">
                <button type="button" className="tac-btn lime" onClick={() => handleManualRoute('CLEAR')}>
                  CLEAR
                </button>
                <button type="button" className="tac-btn primary" onClick={() => handleManualRoute('PRACTICE')}>
                  PRACTICE
                </button>
                <button type="button" className="tac-btn amber" onClick={() => handleManualRoute('WAIT')}>
                  WAIT
                </button>
              </div>
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
          locks={CH04_LOCKS}
          solvedLocks={solvedLocks}
          lang={lang}
          onMistake={() => {
            onUpdateProgress((p) => ({ ...p, breachMistakes: p.breachMistakes + 1 }));
            setFeedbackBar({
              mood: 'danger',
              text: lang === 'zh-Hant' ? '檢查等號邊界與笛摩根定律反轉規則！' : 'Recheck inclusive bounds and De Morgan flipping!',
            });
          }}
          onTraceLoaded={(frames) => {
            setFeedbackBar(null);
            setTraceFrames(frames);
            setStepIdx(0);
            setAutoPlaySeq((s) => s + 1);
          }}
          onSolvedLock={(idx, allCleared) => {
            const next = [...solvedLocks];
            next[idx] = true;
            setSolvedLocks(next);
            if (allCleared) {
              onCutIn({ tag: 'GATE OVERRIDE', title: 'BOOLEAN LOCKS CLEARED', tone: 'lime' });
              onUpdateProgress((prev) => ({
                ...prev,
                breachCleared: true,
                completedPhases: prev.completedPhases.includes('breach')
                  ? prev.completedPhases
                  : [...prev.completedPhases, 'breach'],
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
            starterCode={CH04_STARTER_CODE}
            activeLine={currentFrame?.line ?? null}
            lang={lang}
            onChange={(next) =>
              onUpdateProgress((prev) => ({
                ...prev,
                codeDrafts: { ...prev.codeDrafts, sentinel: next },
              }))
            }
          />

          <div className="deck-actions">
            <button
              type="button"
              className="tac-btn primary deck-primary-cta"
              onClick={handleDeploySentinel}
            >
              <Zap size={15} />
              <span>{t(UI_COPY.runDeploy, lang)}</span>
            </button>

            {battleComplete && (
              <button
                type="button"
                className="tac-btn lime deck-primary-cta"
                onClick={() => {
                  sound.click();
                  onPhaseChange('debrief');
                }}
              >
                <span>{lang === 'zh-Hant' ? '查看破關結算' : 'OPEN DEBRIEF'}</span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>

          {chaosBanner && (
            <div className="deck-feedback warn">
              <Flame size={13} /> <span>{chaosBanner}</span>
            </div>
          )}

          {battleResult && (
            <div className="wave-results">
              {battleResult.failedFlight?.run.error && (
                <div className="wave-err-line mono" style={{ marginBottom: 6 }}>
                  <ShieldAlert size={12} />
                  <span>Line {battleResult.failedFlight.run.error.line}: {battleResult.failedFlight.run.error.message}</span>
                </div>
              )}
              <div className="wave-pills">
                {battleResult.flights.map((fl) => {
                  const isSel = inspectedFlight?.drone.id === fl.drone.id;
                  return (
                    <button
                      key={fl.drone.id}
                      type="button"
                      className={`wave-pill mono ${fl.passed ? 'pass' : 'fail'} ${isSel ? 'selected' : ''}`}
                      onClick={() => {
                        sound.click();
                        setInspectedFlight(fl);
                        launchDroneVisual(fl.drone, fl.actual, fl.passed, fl.run.frames, true);
                      }}
                    >
                      <span>W{fl.waveIndex + 1} · {fl.drone.callsign}</span>
                      <span>{fl.passed ? `✓ ${fl.actual}` : `✕ ${fl.actual}/${fl.drone.expected}`}</span>
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
                {lang === 'zh-Hant' ? '哨兵空域閘門全面恢復' : 'Sky-Gate Restored'}
              </h2>
            </div>
          </div>

          <p className="deck-copy">
            {lang === 'zh-Hant'
              ? '你修復了 else-if 條件優先順序覆蓋陷阱並通過全部 9 次飛行測試。'
              : 'You fixed the if/else priority bug across all 9 drone flights.'}
          </p>

          <div className="deck-actions">
            <button
              type="button"
              className="tac-btn primary deck-primary-cta"
              onClick={() => {
                sound.deploy();
                onOpenChapter(5);
              }}
            >
              <span>{lang === 'zh-Hant' ? '下一關：Ch.05 蓄電高塔' : 'NEXT: CH.05 SURGE TOWER'}</span>
              <ArrowRight size={15} />
            </button>
            <button
              type="button"
              className="tac-btn ghost"
              onClick={() => {
                sound.click();
                onBackToMap();
              }}
            >
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
