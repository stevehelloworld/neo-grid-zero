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
import { ChapterProgress, computeRank } from '../../game/store';
import { DroneFlightResult, DroneSpec, PhaseId, SentinelBattleResult } from '../../game/types';
import { BreachPanel } from '../BreachPanel';
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MissionStageLayout } from '../MissionStageLayout';
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
  chaosDroneTrigger?: { drone: DroneSpec; seq: number } | null;
}

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
  chaosDroneTrigger,
}) => {
  const meta = CAMPAIGN_CHAPTERS.find((c) => c.id === 4)!;

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
  const flightCounter = useRef(1);
  const seqTimersRef = useRef<number[]>([]);

  const [mira, setMira] = useState<{ mood: 'neutral' | 'alert' | 'danger' | 'success'; text: string }>({
    mood: 'alert',
    text:
      lang === 'zh-Hant'
        ? '先點「測試故障自動駕駛」目擊王牌撞毀的原因，再手動引導三架無人機進正確航道！'
        : 'Test the corrupted autopilot first to spot the bug, then route all 3 recon drones cleanly.',
  });

  useEffect(() => {
    return () => {
      seqTimersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (phase === 'recon') {
      setMira({
        mood: progress.reconDone ? 'success' : 'alert',
        text:
          lang === 'zh-Hant'
            ? '先試試故障自動駕駛，再手動為 ACE-16、CADET-14、ROOKIE-12 選擇正確航道！'
            : 'Watch the corrupted autopilot fail, then route ACE-16, CADET-14, and ROOKIE-12.',
      });
    } else if (phase === 'breach') {
      setMira({
        mood: 'neutral',
        text:
          lang === 'zh-Hant'
            ? '解開三道布林邏輯鎖，奪回 Sentinel Gatekeeper 控制權！'
            : 'Crack all 3 boolean locks to override Sentinel Gatekeeper.',
      });
    } else if (phase === 'battle') {
      setMira({
        mood: 'alert',
        text:
          lang === 'zh-Hant'
            ? '優先序：trained && age >= 16 → CLEAR；否則 mentor && age >= 13 → PRACTICE；其餘 WAIT。'
            : 'Priority: trained && age >= 16 → CLEAR; else mentor && age >= 13 → PRACTICE; else WAIT.',
      });
    } else {
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? '空域完全暢通！準備推進第 05 話蓄電高塔迴圈！'
            : 'Airspace secured! Advance to Ch.05 Surge Tower.',
      });
    }
  }, [phase, lang, progress.reconDone]);

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
      onCutIn({ tag: 'GM DRONE', title: `ROUTED → ${flight.actual}`, tone: 'lime' });
    } else {
      sound.hitError();
      setChaosBanner(
        `GM CHAOS DRONE ${flight.drone.callsign} CRASHED (${flight.actual}, need ${flight.drone.expected})`,
      );
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
    setMira({
      mood: 'danger',
      text:
        lang === 'zh-Hant'
          ? '抓到了！if (age >= 13) 寫在最前面，讓 16 歲已受訓的 ACE-16 誤掉進 PRACTICE！'
          : 'Caught! if (age >= 13) comes first, trapping trained 16yo ACE-16 in PRACTICE!',
    });

    if (reconCleared.every(Boolean)) {
      onUpdateProgress((p) => ({
        ...p,
        reconDone: true,
        completedPhases: p.completedPhases.includes('recon')
          ? p.completedPhases
          : [...p.completedPhases, 'recon'],
      }));
    }
  };

  const handleManualRoute = (lane: 'CLEAR' | 'PRACTICE' | 'WAIT') => {
    const drone = CH04_RECON_DRONES[reconIdx];
    const ok = lane === drone.expected;
    setSelectedGate(lane);
    launchDroneVisual(drone, lane, ok, [], false);

    if (!ok) {
      sound.hitError();
      setMira({
        mood: 'danger',
        text:
          lang === 'zh-Hant'
            ? `${drone.callsign} (age=${drone.age}, T=${drone.trained}, M=${drone.mentor}) 不能進 ${lane}。`
            : `${drone.callsign} (age=${drone.age}, T=${drone.trained}, M=${drone.mentor}) cannot enter ${lane}.`,
      });
      return;
    }

    sound.breachSuccess();
    const nextCleared = [...reconCleared];
    nextCleared[reconIdx] = true;
    setReconCleared(nextCleared);

    const allDronesRouted = nextCleared.every(Boolean);
    if (allDronesRouted && autopilotSeen) {
      onUpdateProgress((p) => ({
        ...p,
        reconDone: true,
        completedPhases: p.completedPhases.includes('recon')
          ? p.completedPhases
          : [...p.completedPhases, 'recon'],
      }));
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? '全部無人機引導完成，也抓出優先序 Bug 了。進入邏輯突入！'
            : 'All 3 drones routed and bug diagnosed. Proceed to Breach!',
      });
    } else if (!allDronesRouted) {
      const nextIdx = nextCleared.findIndex((x) => !x);
      if (nextIdx >= 0) {
        window.setTimeout(() => setReconIdx(nextIdx), 600);
      }
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? `${drone.callsign} 安全進入 ${lane}！繼續引導下一架。`
            : `${drone.callsign} cleared into ${lane}! Route the next drone.`,
      });
    } else {
      setMira({
        mood: 'alert',
        text:
          lang === 'zh-Hant'
            ? '三架都放行了！別忘了按一次「測試故障自動駕駛」看 Bug！'
            : 'All 3 routed! Click "Test Corrupted Autopilot" once to inspect the bug.',
      });
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
        setMira({
          mood: 'success',
          text:
            lang === 'zh-Hant'
              ? `9 架無人機零碰撞放行！獲得 ${rank} 級評價與 LOGIC GATE v2！`
              : `All 9 drones routed cleanly! Earned ${rank}-Rank and LOGIC GATE v2.`,
        });
      } else {
        onUpdateProgress((p) => ({ ...p, battleMistakes: p.battleMistakes + 1 }));
        const fail = res.failedFlight;
        setMira({
          mood: 'danger',
          text: fail?.run.error
            ? `Line ${fail.run.error.line}: ${fail.run.error.message}`
            : lang === 'zh-Hant'
              ? `${fail?.drone.callsign} 回傳 "${fail?.actual}"，應為 "${fail?.drone.expected}"。點擊無人機膠囊檢查分支追蹤！`
              : `${fail?.drone.callsign} returned "${fail?.actual}" instead of "${fail?.drone.expected}". Scrub the trace!`,
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
              {lang === 'zh-Hant' ? '手動引導並診斷順序 Bug' : 'Route Drones & Inspect Bug'}
            </h2>
            <button
              type="button"
              className="tac-btn ghost compact-btn"
              onClick={handleCorruptedAutopilot}
            >
              <AlertTriangle size={13} />
              <span>{autopilotSeen ? '✓ ' : ''}{lang === 'zh-Hant' ? '測故障碼' : 'Test Bug'}</span>
            </button>
          </div>

          <div className="rule-strip mono">
            <div><strong style={{ color: 'var(--lime)' }}>CLEAR</strong>: <code>trained && age &gt;= 16</code></div>
            <div><strong style={{ color: 'var(--cyan)' }}>PRACTICE</strong>: <code>mentor && age &gt;= 13</code></div>
            <div><strong style={{ color: 'var(--ink-muted)' }}>WAIT</strong>: {lang === 'zh-Hant' ? '其餘條件' : 'all others'}</div>
          </div>

          <div className="deck-three-col">
            {CH04_RECON_DRONES.map((d, idx) => (
              <button
                key={d.id}
                type="button"
                className={`drone-select-btn ${idx === reconIdx ? 'active' : ''} ${reconCleared[idx] ? 'cleared' : ''}`}
                onClick={() => {
                  sound.click();
                  setReconIdx(idx);
                }}
              >
                <span className="drone-call">{reconCleared[idx] ? '✓ ' : ''}{d.callsign}</span>
                <span className="drone-stats mono">age:{d.age} T:{d.trained ? 1 : 0} M:{d.mentor ? 1 : 0}</span>
              </button>
            ))}
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

          <div className="deck-row-between">
            <span className="deck-hint mono">
              {reconCleared.filter(Boolean).length}/3 {lang === 'zh-Hant' ? '架放行' : 'routed'} · {autopilotSeen ? '✓ bug tested' : 'test bug once'}
            </span>
            {progress.reconDone && (
              <button
                type="button"
                className="tac-btn primary"
                onClick={() => {
                  sound.click();
                  setTraceFrames([]);
                  onPhaseChange('breach');
                }}
              >
                <span>{lang === 'zh-Hant' ? '前往 Phase 2 突入' : 'PROCEED TO BREACH'}</span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {phase === 'breach' && (
        <BreachPanel
          locks={CH04_LOCKS}
          solvedLocks={solvedLocks}
          lang={lang}
          onMistake={() => onUpdateProgress((p) => ({ ...p, breachMistakes: p.breachMistakes + 1 }))}
          onTraceLoaded={(frames) => {
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
              ? '實作 access(age, trained, mentor)：trained && age >= 16 優先回傳 "CLEAR"；其餘 mentor && age >= 13 回傳 "PRACTICE"；否則 "WAIT"。'
              : 'Implement access(age, trained, mentor): "CLEAR" if trained && age >= 16 first, else "PRACTICE" if mentor && age >= 13, else "WAIT".'}
          </p>

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
    </MissionStageLayout>
  );
};
