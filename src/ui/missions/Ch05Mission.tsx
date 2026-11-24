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
import { MemoryHud } from '../MemoryHud';
import { MiraComms } from '../MiraComms';
import { MissionHeader } from '../MissionHeader';
import { LoopTowerCanvas } from '../stages/LoopTowerCanvas';
import { TimelineBar } from '../TimelineBar';

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
        ? '蓄電高塔出現異常迴圈熔斷！先按「TEST CORRUPTED LOOP」看無限負向充電如何燒毀保險絲，再手動脈衝充電到目標 14！'
        : 'Surge Tower tripped a breaker! Test the Corrupted Loop first, then pulse-charge from 3 by +4 until reaching target 14!',
  });

  useEffect(() => {
    return () => timersRef.current.forEach((id) => window.clearTimeout(id));
  }, []);

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
          ? '抓到了！charge -= 3 讓電量一路掉成負數，永遠小於 12，所以觸發安全熔斷！現在手動脈衝充能試試看！'
          : 'Caught it! charge -= 3 drives charge negative forever, tripping the infinite-loop breaker! Now manually pulse-charge to 14!',
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
            ? `第 ${nextRound} 輪充到 ${nextCharge}（超過 14），while (charge < 14) 在此變成 false 結束！`
            : `Round ${nextRound} reached ${nextCharge} (>= 14), so while (charge < 14) turns false and stops!`,
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
              ? `蓄電高塔 9 輪測試全通！解鎖 LOOP THRUSTER 晶片並獲得 ${rank} 級評價！`
              : `All 9 charge trials stabilized! Earned ${rank}-Rank and unlocked LOOP THRUSTER!`,
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

  return (
    <div className="mission-shell">
      <MissionHeader
        meta={meta}
        lang={lang}
        phase={phase}
        progress={progress}
        battleComplete={battleComplete}
        onPhaseChange={onPhaseChange}
      />

      <div className="cockpit-grid">
        <div className="cockpit-left">
          <MiraComms mood={mira.mood} message={mira.text} lang={lang} />

          {phase === 'recon' && (
            <section className="panel-frame chamfer" style={{ padding: 18, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span className="tac-tag amber">PHASE 01 // CAPACITOR RIG</span>
                <button type="button" className="tac-btn crimson chamfer-sm" style={{ minHeight: 34, fontSize: 11 }} onClick={handleTestInfinite}>
                  <AlertTriangle size={13} /> {infiniteSeen ? '✓ ' : ''}TEST CORRUPTED LOOP
                </button>
              </div>

              <div className="panel-frame" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--cyan)' }}>START: 3 · GAIN: +4 · TARGET: 14</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                    charge = {chargeVal} · rounds = {roundVal}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="tac-btn primary chamfer-sm" onClick={handlePulse}>
                    <Zap size={14} /> PULSE (+4)
                  </button>
                  <button
                    type="button"
                    className="tac-btn ghost chamfer-sm"
                    onClick={() => { setChargeVal(3); setRoundVal(0); setReconStatus('idle'); }}
                  >
                    RESET
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                  {infiniteSeen ? '✓ Fuse break seen' : 'Test infinite loop'} · {chargeVal >= 14 ? '✓ Target reached' : 'Pulse to >= 14'}
                </span>
                <button type="button" className="tac-btn lime chamfer-sm" disabled={!progress.reconDone} onClick={() => { sound.click(); onPhaseChange('breach'); }}>
                  {lang === 'zh-Hant' ? '前往 Phase 02 電塔鎖' : 'PROCEED TO BREACH'} <ArrowRight size={15} />
                </button>
              </div>
            </section>
          )}

          {phase === 'breach' && (
            <BreachPanel
              locks={CH05_LOCKS}
              solvedLocks={solvedLocks}
              lang={lang}
              tagLabel="ITERATION LOGIC"
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
              onProceedToBattle={() => onPhaseChange('battle')}
            />
          )}

          {phase === 'battle' && (
            <section className="panel-frame chamfer" style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="boss-bar chamfer-sm">
                <div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--crimson)', fontWeight: 700 }}>SECTOR BOSS // 3-WAVE CHARGE TRIALS (9 RUNS)</div>
                  <strong style={{ fontSize: 15 }}>INFINITE COIL</strong>
                </div>
                <div className="shield-pips">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={`shield-pip ${battleResult && i < battleResult.wavesCleared ? 'broken' : ''}`} />
                  ))}
                </div>
              </div>

              <div style={{ padding: '10px 12px', background: 'rgba(6, 11, 18, 0.72)', borderLeft: '3px solid var(--cyan)', fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                {lang === 'zh-Hant'
                  ? '實作 rounds(start, gain, target)：每輪增加 gain，回傳電量達到或超過 target 的輪數。若起點已 >= target 回傳 0。'
                  : 'Implement rounds(start, gain, target): return how many rounds adding gain each time are needed to reach or exceed target (0 if start >= target).'}
              </div>

              <CodeTerminal
                value={code}
                starterCode={CH05_STARTER_CODE}
                activeLine={currentFrame?.line ?? null}
                lang={lang}
                onChange={(next) => onUpdateProgress((p) => ({ ...p, codeDrafts: { ...p.codeDrafts, surge: next } }))}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="tac-btn primary chamfer-sm" style={{ minHeight: 42 }} onClick={handleDeploySurge}>
                  <Zap size={15} />
                  {t(UI_COPY.runDeploy, lang)}
                </button>
                {battleComplete && (
                  <button type="button" className="tac-btn lime chamfer-sm" onClick={() => { sound.click(); onPhaseChange('debrief'); }}>
                    {lang === 'zh-Hant' ? '前往 Phase 04 戰報總結' : 'OPEN MISSION DEBRIEF'} →
                  </button>
                )}
              </div>

              {chaosNote && (
                <div className="tac-tag amber" style={{ justifyContent: 'center', padding: 8 }}>
                  <Flame size={13} /> {chaosNote}
                </div>
              )}

              {battleResult && (
                <div style={{ display: 'grid', gap: 6 }}>
                  {battleResult.failedTrial?.run.error && (
                    <div className="mono" style={{ padding: 10, background: 'var(--crimson-dim)', border: '1px solid var(--crimson)', fontSize: 12 }}>
                      <ShieldAlert size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                      Line {battleResult.failedTrial.run.error.line}: {battleResult.failedTrial.run.error.message}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 6 }}>
                    {battleResult.trials.map((tr) => (
                      <button
                        key={tr.spec.id}
                        type="button"
                        className={`tac-btn ${tr.passed ? 'lime' : 'crimson'} chamfer-sm`}
                        style={{ minHeight: 34, padding: '5px 8px', fontSize: 10.5, justifyContent: 'space-between' }}
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
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {phase === 'debrief' && (
            <section className="panel-frame chamfer" style={{ padding: 20, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="tac-tag lime">SURGE TOWER ONLINE // LOOP THRUSTER SYNCED</span>
                <span className="tac-tag cyan" style={{ fontSize: 16, padding: '6px 14px' }}>RANK {progress.rank ?? 'S'}</span>
              </div>
              <h2 style={{ fontSize: 28 }}>{lang === 'zh-Hant' ? '蓄電高塔迴圈穩定' : 'Surge Tower Stabilized'}</h2>
              <p style={{ color: 'var(--ink-secondary)', fontSize: 13.5 }}>
                {lang === 'zh-Hant'
                  ? '你成功排除無窮迴圈並精準處理了超越目標與零輪邊界！下一關：第 06 話《脈衝掃描站》。'
                  : 'You defeated INFINITE COIL across overshoot and zero-round edge cases! Advance to Ch.06 Pulse Scanner.'}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="tac-btn primary chamfer-sm" onClick={() => { sound.deploy(); onOpenChapter(6); }}>
                  {lang === 'zh-Hant' ? '下一關：Ch.06 脈衝掃描站' : 'NEXT MISSION: CH.06 PULSE SCANNER'} →
                </button>
                <button type="button" className="tac-btn ghost chamfer-sm" onClick={() => { sound.click(); onBackToMap(); }}>
                  {t(UI_COPY.backToMap, lang)}
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="cockpit-right">
          <LoopTowerCanvas
            mode={phase === 'recon' ? 'recon' : 'battle'}
            chargeValue={phase === 'recon' ? chargeVal : inspectedTrial?.spec.start ?? 3}
            targetValue={phase === 'recon' ? 14 : inspectedTrial?.spec.target ?? 15}
            roundCount={phase === 'recon' ? roundVal : inspectedTrial?.actual ?? 0}
            activeFrame={currentFrame}
            bossShields={3}
            brokenShields={
              battleResult
                ? battleResult.totalWaves === 1
                  ? progress.rank ? 3 : 0
                  : battleResult.wavesCleared
                : progress.rank ? 3 : 0
            }
            status={phase === 'recon' ? reconStatus : battleResult ? (battleResult.passed ? 'ok' : 'error') : 'idle'}
            pulseKey={pulseKey}
          />
          <TimelineBar frames={traceFrames} stepIndex={stepIdx} onStepChange={setStepIdx} lang={lang} autoPlayTrigger={autoPlaySeq} />
          <MemoryHud frame={currentFrame} stdout={stdoutShown} lang={lang} />
        </div>
      </div>
    </div>
  );
};
