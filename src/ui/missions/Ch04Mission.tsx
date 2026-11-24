import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Flame, ShieldAlert, Zap } from 'lucide-react';
import { sound } from '../../engine/audio/synth';
import { Lang, t, UI_COPY } from '../../engine/i18n/text';
import { runMethodCall, runStatements, TraceFrame } from '../../engine/vm';
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
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MemoryHud } from '../MemoryHud';
import { MiraComms } from '../MiraComms';
import { ActiveDroneVisual, SentinelCanvas } from '../stages/SentinelCanvas';
import { TimelineBar } from '../TimelineBar';

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
  const [lockIdx, setLockIdx] = useState(0);
  const [solvedLocks, setSolvedLocks] = useState<boolean[]>(
    progress.breachCleared ? [true, true, true] : [false, false, false],
  );
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
  const [breachMsg, setBreachMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
        ? '哨兵空域閘門大亂！先按「TEST CORRUPTED AUTOPILOT」看看壞掉的程式碼怎麼撞毀王牌飛行員，再手動引導三架無人機！'
        : 'Sky-Gate autopilot is compromised! Fire "TEST CORRUPTED AUTOPILOT" to witness the bug, then manually route all 3 recon drones!',
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
            : 'Watch the Corrupted Autopilot fail first, then manually route ACE-16, CADET-14, and ROOKIE-12!',
      });
    } else if (phase === 'breach') {
      setMira({
        mood: 'neutral',
        text:
          lang === 'zh-Hant'
            ? '解開三道布林邏輯鎖，就能取得 GATEKEEPER 的核心寫入權限！'
            : 'Crack all three boolean logic locks to override Sentinel Gatekeeper!',
      });
    } else if (phase === 'battle') {
      setMira({
        mood: 'alert',
        text:
          lang === 'zh-Hant'
            ? '規則：trained && age >= 16 優先放行 CLEAR；其餘 mentor && age >= 13 進 PRACTICE；否則 WAIT。9 架無人機分 3 波突襲！'
            : 'Priority: trained && age >= 16 -> CLEAR first! Else mentor && age >= 13 -> PRACTICE; otherwise WAIT. 3 escalating waves incoming!',
      });
    } else {
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? '空域完全暢通！點選下方任一架無人機飛行紀錄，即可在畫面上逐步追蹤它的每個 if 判定。'
            : 'Airspace secured! Select any drone flight below to scrub its if/else-if evaluation frame-by-frame.',
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

  // Listen for GM Chaos Drone launches
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
        `GM CHAOS DRONE ${flight.drone.callsign} → ${flight.actual} (VERIFIED!)`,
      );
      onCutIn({ tag: 'GM DRONE', title: `ROUTED → ${flight.actual}`, tone: 'lime' });
    } else {
      sound.hitError();
      setChaosBanner(
        `GM CHAOS DRONE ${flight.drone.callsign} CRASHED! GOT ${flight.actual}, EXPECTED ${flight.drone.expected}`,
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
          ? '抓到了！因為 if (age >= 13) 寫在最前面，16 歲已受訓的 ACE-16 直接掉進 PRACTICE 撞上護欄！'
          : 'Caught red-handed! Because if (age >= 13) comes first, trained 16-year-old ACE-16 gets trapped in PRACTICE!',
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
            ? `${drone.callsign} (age=${drone.age}, trained=${drone.trained}, mentor=${drone.mentor}) 不能進 ${lane}，再確認資格順序！`
            : `${drone.callsign} (age=${drone.age}, trained=${drone.trained}, mentor=${drone.mentor}) cannot enter ${lane}. Recheck priority!`,
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
            ? '現場偵查完成！你親眼見證了順序錯誤，也順利手動疏導全部無人機。進入防火牆突入！'
            : 'Recon complete! You diagnosed the priority bug and cleared every drone. Proceed to Breach!',
      });
    } else if (!allDronesRouted) {
      const nextIdx = nextCleared.findIndex((x) => !x);
      if (nextIdx >= 0) {
        window.setTimeout(() => setReconIdx(nextIdx), 650);
      }
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? `${drone.callsign} 安全降落 ${lane} 航道！繼續引導下一架無人機。`
            : `${drone.callsign} cleared into ${lane}! Route the next incoming drone.`,
      });
    } else {
      setMira({
        mood: 'alert',
        text:
          lang === 'zh-Hant'
            ? '三架都引導對了！別忘了按一次「TEST CORRUPTED AUTOPILOT」看看原本的 Bug 怎麼發生。'
            : 'All 3 routed! Click "TEST CORRUPTED AUTOPILOT" once to inspect why the old firmware fails.',
      });
    }
  };

  const handleCrackLock = () => {
    const lock = CH04_LOCKS[lockIdx];
    if (selectedOpt === null) return;
    if (selectedOpt !== lock.correctIndex) {
      sound.hitError();
      onUpdateProgress((p) => ({ ...p, breachMistakes: p.breachMistakes + 1 }));
      setBreachMsg({
        ok: false,
        text:
          lang === 'zh-Hant'
            ? '布林判定錯誤！再檢查邊界符號或 && / || 的優先與反轉規則。'
            : 'Boolean check failed! Recheck inclusive bounds or operator priority.',
      });
      return;
    }

    sound.breachSuccess();
    setBreachMsg({ ok: true, text: t(lock.explanation, lang) });
    if (lock.traceSource) {
      const trace = runStatements(lock.traceSource);
      setTraceFrames(trace.frames);
      setStepIdx(0);
      setAutoPlaySeq((s) => s + 1);
    }

    const nextSolved = [...solvedLocks];
    nextSolved[lockIdx] = true;
    setSolvedLocks(nextSolved);
    if (nextSolved.every(Boolean)) {
      onCutIn({ tag: 'GATE OVERRIDE', title: 'BOOLEAN LOCKS CLEARED', tone: 'lime' });
      onUpdateProgress((prev) => ({
        ...prev,
        breachCleared: true,
        completedPhases: prev.completedPhases.includes('breach')
          ? prev.completedPhases
          : [...prev.completedPhases, 'breach'],
      }));
    }
  };

  const handleDeploySentinel = () => {
    setChaosBanner(null);
    seqTimersRef.current.forEach((id) => window.clearTimeout(id));
    seqTimersRef.current = [];

    sound.deploy();
    const res = evaluateSentinelBattle(code);
    setBattleResult(res);

    // Animate flights sequentially so every drone physically flies across SentinelCanvas!
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
      }, idx * 720);
      seqTimersRef.current.push(tid);
    });

    const totalDelay = res.flights.length * 720;
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
              ? `9 架無人機全數精準導流！哨兵閘門王被擊破，獲得 ${rank} 級評價與 LOGIC GATE v2 晶片！`
              : `All 9 drones across 3 waves routed with zero collisions! Earned ${rank}-Rank and LOGIC GATE v2!`,
        });
      } else {
        onUpdateProgress((p) => ({ ...p, battleMistakes: p.battleMistakes + 1 }));
        const fail = res.failedFlight;
        setMira({
          mood: 'danger',
          text: fail?.run.error
            ? `Line ${fail.run.error.line}: ${fail.run.error.message}`
            : lang === 'zh-Hant'
              ? `${fail?.drone.callsign} 撞毀！你的程式回傳 "${fail?.actual}"，但應該進 "${fail?.drone.expected}"。拖動右側時間軸看看哪一個 if 條件搶先攔截了它！`
              : `${fail?.drone.callsign} crashed! Your access() returned "${fail?.actual}" instead of "${fail?.drone.expected}". Scrub the trace bar to see which branch fired!`,
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

  return (
    <div className="mission-shell">
      <div className="mission-header-bar chamfer-sm">
        <div>
          <span className="mono" style={{ fontSize: 11, color: 'var(--cyan)' }}>
            {meta.code} // {t(meta.topic, lang)}
          </span>
          <h1 style={{ fontSize: 22 }}>{t(meta.title, lang)}</h1>
        </div>

        <nav className="phase-stepper" aria-label="Mission phases">
          {(
            [
              ['recon', UI_COPY.phaseRecon, true],
              ['breach', UI_COPY.phaseBreach, progress.reconDone],
              ['battle', UI_COPY.phaseBattle, progress.breachCleared],
              ['debrief', UI_COPY.phaseDebrief, battleComplete],
            ] as const
          ).map(([id, label, unlocked]) => {
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

      <div className="cockpit-grid">
        <div className="cockpit-left">
          <MiraComms mood={mira.mood} message={mira.text} lang={lang} />

          {phase === 'recon' && (
            <section className="panel-frame chamfer" style={{ padding: 18, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span className="tac-tag amber">PHASE 01 // SKY-GATE RECON</span>
                <button
                  type="button"
                  className="tac-btn amber chamfer-sm"
                  style={{ minHeight: 32, padding: '4px 12px', fontSize: 11 }}
                  onClick={handleCorruptedAutopilot}
                >
                  <AlertTriangle size={13} />
                  {autopilotSeen ? '✓ ' : ''}TEST CORRUPTED AUTOPILOT
                </button>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  background: '#050a11',
                  border: '1px solid var(--border-subtle)',
                  fontSize: 12.5,
                  color: 'var(--ink-secondary)',
                }}
              >
                <div className="mono" style={{ color: 'var(--cyan)', marginBottom: 4, fontWeight: 700 }}>
                  {lang === 'zh-Hant' ? '塔台放行規則（注意優先順序）：' : 'GATE PRIORITY PROTOCOL:'}
                </div>
                <div>1. <strong style={{ color: 'var(--lime)' }}>CLEAR</strong>: <code>trained == true && age &gt;= 16</code></div>
                <div>2. <strong style={{ color: 'var(--cyan)' }}>PRACTICE</strong>: <code>mentor == true && age &gt;= 13</code></div>
                <div>3. <strong style={{ color: 'var(--amber)' }}>WAIT</strong>: {lang === 'zh-Hant' ? '其餘所有情況' : 'all other pilots'}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {CH04_RECON_DRONES.map((d, idx) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`tac-btn ${idx === reconIdx ? 'primary' : reconCleared[idx] ? 'lime' : 'ghost'} chamfer-sm`}
                    style={{ flexDirection: 'column', padding: '8px 6px', gap: 2, fontSize: 11 }}
                    onClick={() => {
                      sound.click();
                      setReconIdx(idx);
                    }}
                  >
                    <span>{reconCleared[idx] ? '✓ ' : ''}{d.callsign}</span>
                    <span className="mono" style={{ fontSize: 10, opacity: 0.85 }}>
                      age:{d.age} T:{d.trained ? '1' : '0'} M:{d.mentor ? '1' : '0'}
                    </span>
                  </button>
                ))}
              </div>

              <div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 8 }}>
                  {lang === 'zh-Hant'
                    ? `手動切換閘門放行 ${CH04_RECON_DRONES[reconIdx].callsign}：`
                    : `SWITCH GATE CORRIDOR FOR ${CH04_RECON_DRONES[reconIdx].callsign}:`}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <button type="button" className="tac-btn lime chamfer-sm" onClick={() => handleManualRoute('CLEAR')}>
                    1 · CLEAR
                  </button>
                  <button type="button" className="tac-btn primary chamfer-sm" onClick={() => handleManualRoute('PRACTICE')}>
                    2 · PRACTICE
                  </button>
                  <button type="button" className="tac-btn amber chamfer-sm" onClick={() => handleManualRoute('WAIT')}>
                    3 · WAIT
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                  {reconCleared.filter(Boolean).length}/3 {lang === 'zh-Hant' ? '架已放行' : 'drones routed'} ·{' '}
                  {autopilotSeen ? (lang === 'zh-Hant' ? '已目擊故障' : 'bug witnessed') : (lang === 'zh-Hant' ? '尚未測故障碼' : 'run autopilot demo')}
                </span>
                <button
                  type="button"
                  className="tac-btn lime chamfer-sm"
                  disabled={!progress.reconDone}
                  onClick={() => {
                    sound.click();
                    onPhaseChange('breach');
                  }}
                >
                  {lang === 'zh-Hant' ? '前往 Phase 02 邏輯突入' : 'PROCEED TO BREACH'}
                  <ArrowRight size={15} />
                </button>
              </div>
            </section>
          )}

          {phase === 'breach' && (
            <section className="panel-frame chamfer" style={{ padding: 18, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {CH04_LOCKS.map((lk, idx) => (
                    <button
                      key={lk.id}
                      type="button"
                      className={`tac-btn ${idx === lockIdx ? 'primary' : solvedLocks[idx] ? 'lime' : 'ghost'} chamfer-sm`}
                      style={{ minHeight: 32, padding: '4px 10px', fontSize: 11 }}
                      onClick={() => {
                        sound.click();
                        setLockIdx(idx);
                        setSelectedOpt(null);
                        setBreachMsg(null);
                      }}
                    >
                      {solvedLocks[idx] ? '✓ ' : ''}LOCK 0{idx + 1}
                    </button>
                  ))}
                </div>
                <span className="tac-tag cyan">BOOLEAN BREACH</span>
              </div>

              <div>
                <h2 style={{ fontSize: 20 }}>{t(CH04_LOCKS[lockIdx].title, lang)}</h2>
                <p style={{ color: 'var(--ink-secondary)', fontSize: 13.5, marginTop: 4 }}>
                  {t(CH04_LOCKS[lockIdx].prompt, lang)}
                </p>
              </div>

              {CH04_LOCKS[lockIdx].code && (
                <pre
                  className="mono"
                  style={{
                    margin: 0,
                    padding: '12px 14px',
                    background: '#050a11',
                    border: '1px solid rgba(0, 240, 255, 0.25)',
                    fontSize: 12.5,
                    lineHeight: 1.6,
                  }}
                >
                  {CH04_LOCKS[lockIdx].code}
                </pre>
              )}

              <div style={{ display: 'grid', gap: 8 }}>
                {CH04_LOCKS[lockIdx].options.map((opt, idx) => {
                  const isSel = selectedOpt === idx;
                  const stateCls =
                    breachMsg && isSel ? (breachMsg.ok ? 'correct' : 'wrong') : isSel ? 'selected' : '';
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`breach-option chamfer-sm ${stateCls}`}
                      onClick={() => {
                        sound.click();
                        setSelectedOpt(idx);
                        setBreachMsg(null);
                      }}
                    >
                      <span className="tac-tag cyan">{String.fromCharCode(65 + idx)}</span>
                      <code style={{ fontSize: 13 }}>{t(opt, lang)}</code>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className="tac-btn primary chamfer-sm"
                  disabled={selectedOpt === null}
                  onClick={handleCrackLock}
                >
                  {lang === 'zh-Hant' ? '破解邏輯鎖' : 'CRACK CYBER LOCK'}
                </button>
                {solvedLocks[lockIdx] && lockIdx < CH04_LOCKS.length - 1 && !solvedLocks.every(Boolean) && (
                  <button
                    type="button"
                    className="tac-btn amber chamfer-sm"
                    onClick={() => {
                      sound.click();
                      setLockIdx(lockIdx + 1);
                      setSelectedOpt(null);
                      setBreachMsg(null);
                    }}
                  >
                    NEXT LOCK →
                  </button>
                )}
                {solvedLocks.every(Boolean) && (
                  <button
                    type="button"
                    className="tac-btn lime chamfer-sm"
                    onClick={() => {
                      sound.click();
                      onPhaseChange('battle');
                    }}
                  >
                    {lang === 'zh-Hant' ? '迎戰 Phase 03 哨兵閘門王' : 'ENGAGE SENTINEL BOSS'} →
                  </button>
                )}
              </div>

              {breachMsg && (
                <div
                  style={{
                    padding: '10px 12px',
                    fontSize: 12.5,
                    background: breachMsg.ok ? 'var(--lime-dim)' : 'var(--crimson-dim)',
                    border: `1px solid ${breachMsg.ok ? 'var(--lime)' : 'var(--crimson)'}`,
                  }}
                >
                  {breachMsg.text}
                </div>
              )}
            </section>
          )}

          {phase === 'battle' && (
            <section className="panel-frame chamfer" style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="boss-bar chamfer-sm">
                <div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--crimson)', fontWeight: 700 }}>
                    SECTOR BOSS // 3 DRONE WAVES (9 TRIALS)
                  </div>
                  <strong style={{ fontSize: 15 }}>SENTINEL GATEKEEPER</strong>
                </div>
                <div className="shield-pips" aria-label="Sentinel Boss shields">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={`shield-pip ${battleResult && i < battleResult.wavesCleared ? 'broken' : ''}`}
                    />
                  ))}
                </div>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  background: 'rgba(6, 11, 18, 0.72)',
                  borderLeft: '3px solid var(--cyan)',
                  fontSize: 12.5,
                  color: 'var(--ink-secondary)',
                }}
              >
                {lang === 'zh-Hant'
                  ? '實作 access(age, trained, mentor)：已受訓且 age >= 16 優先回傳 "CLEAR"；其餘有導師且 age >= 13 回傳 "PRACTICE"；否則回傳 "WAIT"。'
                  : 'Implement access(age, trained, mentor): return "CLEAR" if trained and age >= 16 (highest priority); else "PRACTICE" if mentor and age >= 13; otherwise "WAIT".'}
              </div>

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

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="tac-btn primary chamfer-sm"
                  style={{ minHeight: 42, fontSize: 13 }}
                  onClick={handleDeploySentinel}
                >
                  <Zap size={15} />
                  {t(UI_COPY.runDeploy, lang)}
                </button>

                {battleComplete && (
                  <button
                    type="button"
                    className="tac-btn lime chamfer-sm"
                    onClick={() => {
                      sound.click();
                      onPhaseChange('debrief');
                    }}
                  >
                    {lang === 'zh-Hant' ? '前往 Phase 04 戰報總結' : 'OPEN MISSION DEBRIEF'} →
                  </button>
                )}
              </div>

              {chaosBanner && (
                <div className="tac-tag amber" style={{ justifyContent: 'center', padding: 8 }}>
                  <Flame size={13} /> {chaosBanner}
                </div>
              )}

              {battleResult && (
                <div style={{ display: 'grid', gap: 6 }}>
                  {battleResult.failedFlight?.run.error && (
                    <div className="mono" style={{ padding: 10, background: 'var(--crimson-dim)', border: '1px solid var(--crimson)', fontSize: 12 }}>
                      <ShieldAlert size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                      Line {battleResult.failedFlight.run.error.line}: {battleResult.failedFlight.run.error.message}
                    </div>
                  )}
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                    {lang === 'zh-Hant' ? '點擊任一無人機即可追蹤該次執行分支：' : 'Click any drone telemetry chip to inspect its exact branch trace:'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 6 }}>
                    {battleResult.flights.map((fl) => {
                      const isSel = inspectedFlight?.drone.id === fl.drone.id;
                      return (
                        <button
                          key={fl.drone.id}
                          type="button"
                          className={`tac-btn ${fl.passed ? 'lime' : 'crimson'} chamfer-sm`}
                          style={{
                            minHeight: 34,
                            padding: '5px 8px',
                            fontSize: 10.5,
                            justifyContent: 'space-between',
                            boxShadow: isSel ? '0 0 0 2px #fff' : undefined,
                          }}
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
            </section>
          )}

          {phase === 'debrief' && (
            <section className="panel-frame chamfer" style={{ padding: 20, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="tac-tag lime">SKY-GATE SECURED // UNIT 2 VERIFIED</span>
                <span className="tac-tag cyan" style={{ fontSize: 16, padding: '6px 14px' }}>
                  RANK {progress.rank ?? 'S'}
                </span>
              </div>
              <h2 style={{ fontSize: 28 }}>
                {lang === 'zh-Hant' ? '哨兵空域閘門全面恢復' : 'Sentinel Sky-Gate Restored'}
              </h2>
              <p style={{ color: 'var(--ink-secondary)', fontSize: 13.5 }}>
                {lang === 'zh-Hant'
                  ? '你解決了條件優先順序覆蓋陷阱，解鎖 LOGIC GATE v2 晶片！你隨時可以切換不同波次的無人機，用時間軸重播 if / else-if 的分支判定。'
                  : 'You resolved the priority-shadowing defect and synced LOGIC GATE v2! Click any wave flight or use GM Copilot to test tricky edge-case drones.'}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="tac-btn primary chamfer-sm"
                  onClick={() => {
                    sound.deploy();
                    onOpenChapter(5);
                  }}
                >
                  {lang === 'zh-Hant' ? '下一關：Ch.05 蓄電高塔迴圈' : 'NEXT MISSION: CH.05 SURGE TOWER'} →
                </button>
                <button
                  type="button"
                  className="tac-btn ghost chamfer-sm"
                  onClick={() => {
                    sound.click();
                    onBackToMap();
                  }}
                >
                  {t(UI_COPY.backToMap, lang)}
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Live Sentinel Sky-Gate Canvas + Timeline + Memory HUD */}
        <div className="cockpit-right">
          <SentinelCanvas
            mode={phase === 'recon' ? 'recon' : 'battle'}
            activeDrone={activeDrone}
            activeFrame={currentFrame}
            selectedGate={selectedGate}
            bossShields={3}
            brokenShields={
              battleResult
                ? battleResult.totalWaves === 1
                  ? progress.rank ? 3 : 0
                  : battleResult.wavesCleared
                : progress.rank ? 3 : 0
            }
            scrubProgress={traceFrames.length > 0 && currentFrame ? 0.45 + 0.55 * ((stepIdx + 1) / traceFrames.length) : null}
          />

          <TimelineBar
            frames={traceFrames}
            stepIndex={stepIdx}
            onStepChange={(idx) => setStepIdx(idx)}
            lang={lang}
            autoPlayTrigger={autoPlaySeq}
          />

          <MemoryHud frame={currentFrame} stdout={stdoutShown} lang={lang} />
        </div>
      </div>
    </div>
  );
};
