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
import { MemoryHud } from '../MemoryHud';
import { MiraComms } from '../MiraComms';
import { MissionHeader } from '../MissionHeader';
import { ScannerCanvas } from '../stages/ScannerCanvas';
import { TimelineBar } from '../TimelineBar';

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
        ? '雜訊幻影把訊號切得支離破碎！按 STEP PULSE 逐格掃描 "OOXOOOXO"，看清楚遇 X 時 CURRENT 歸零但 BEST 保留下來的節奏！'
        : 'NOISE PHANTOM is jamming the feed! Click STEP PULSE across "OOXOOOXO" to watch CURRENT reset on X while BEST preserves the peak!',
  });

  useEffect(() => {
    return () => timersRef.current.forEach((id) => window.clearTimeout(id));
  }, []);

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
            ? '請先按 STEP PULSE 掃完整段訊號，再填入最長連續 O 的長度 (3)！'
            : 'Step through the entire signal stream first, then enter the peak consecutive O streak (3)!',
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
          ? '雙計數器追蹤完成！遇到 X 歸零 cur，同時隨時取 max(best, cur)。進入邏輯鎖！'
          : 'Dual-tracker verified! Reset current on X while continuously protecting best!',
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
              ? `9 條訊號全數掃描成功！解鎖 SCANNER AI 晶片並獲得 ${rank} 級評價！`
              : `All 9 streams decoded cleanly! Earned ${rank}-Rank and unlocked SCANNER AI!`,
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
              <span className="tac-tag amber">PHASE 01 // LIVE STREAK SCANNER</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="tac-btn primary chamfer-sm"
                  disabled={cursorIdx >= RECON_STREAM.length - 1}
                  onClick={handleStepRecon}
                >
                  <StepForward size={15} />
                  STEP PULSE ({cursorIdx + 1} / {RECON_STREAM.length})
                </button>
                <button
                  type="button"
                  className="tac-btn ghost chamfer-sm"
                  onClick={() => { setCursorIdx(-1); setCurRun(0); setBestRun(0); setReconStatus('idle'); }}
                >
                  RESET STREAM
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={{ flex: 1, minWidth: 160, display: 'grid', gap: 4 }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--lime)' }}>
                    {lang === 'zh-Hant' ? '掃描後填寫最長連續 O (Best Peak)：' : 'Final longest consecutive O streak:'}
                  </span>
                  <input
                    type="number"
                    value={peakGuess}
                    onChange={(e) => setPeakGuess(e.target.value)}
                    placeholder="?"
                    style={{ padding: 9, background: '#050a11', border: '1px solid var(--border-active)', fontFamily: 'var(--font-mono)', fontSize: 16 }}
                  />
                </label>
                <button type="button" className="tac-btn amber chamfer-sm" style={{ minHeight: 42 }} onClick={handleVerifyRecon}>
                  LOCK PEAK STREAK
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="tac-btn lime chamfer-sm" disabled={!progress.reconDone} onClick={() => { sound.click(); onPhaseChange('breach'); }}>
                  {lang === 'zh-Hant' ? '前往 Phase 02 掃描鎖' : 'PROCEED TO BREACH'} <ArrowRight size={15} />
                </button>
              </div>
            </section>
          )}

          {phase === 'breach' && (
            <BreachPanel
              locks={CH06_LOCKS}
              solvedLocks={solvedLocks}
              lang={lang}
              tagLabel="ITERATIVE ALGORITHMS"
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
              onProceedToBattle={() => onPhaseChange('battle')}
            />
          )}

          {phase === 'battle' && (
            <section className="panel-frame chamfer" style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div className="boss-bar chamfer-sm">
                <div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--crimson)', fontWeight: 700 }}>SECTOR BOSS // 3-WAVE SIGNAL STREAMS (9 TRIALS)</div>
                  <strong style={{ fontSize: 15 }}>NOISE PHANTOM</strong>
                </div>
                <div className="shield-pips">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={`shield-pip ${battleResult && i < battleResult.wavesCleared ? 'broken' : ''}`} />
                  ))}
                </div>
              </div>

              <div style={{ padding: '10px 12px', background: 'rgba(6, 11, 18, 0.72)', borderLeft: '3px solid var(--cyan)', fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                {lang === 'zh-Hant'
                  ? '實作 longestRun(readings)：只含 "O" 與 "X"（或空字串 ""），回傳最長連續 "O" 的長度（支援 substring(...).equals("O") 或 charAt(i) == \'O\'）。'
                  : 'Implement longestRun(readings): return the longest consecutive run of "O" characters (supports substring(i, i+1).equals("O") or charAt(i) == \'O\'). Handle "" safely.'}
              </div>

              <CodeTerminal
                value={code}
                starterCode={CH06_STARTER_CODE}
                activeLine={currentFrame?.line ?? null}
                lang={lang}
                onChange={(next) => onUpdateProgress((p) => ({ ...p, codeDrafts: { ...p.codeDrafts, scanner: next } }))}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="tac-btn primary chamfer-sm" style={{ minHeight: 42 }} onClick={handleDeployScanner}>
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
                        <span>W{tr.waveIndex + 1} · "{tr.spec.stream}"</span>
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
                <span className="tac-tag lime">SIGNALS DECODED // SCANNER AI SYNCED</span>
                <span className="tac-tag cyan" style={{ fontSize: 16, padding: '6px 14px' }}>RANK {progress.rank ?? 'S'}</span>
              </div>
              <h2 style={{ fontSize: 28 }}>{lang === 'zh-Hant' ? '雜訊幻影清除完畢' : 'Pulse Scanner Online'}</h2>
              <p style={{ color: 'var(--ink-secondary)', fontSize: 13.5 }}>
                {lang === 'zh-Hant'
                  ? '你掌握了雙暫存器單次走訪與邊界防呆！最後一站 Act II 決戰：第 07 話《矩陣掃描雷達》。'
                  : 'You mastered single-pass streak tracking and edge cases! Final Act II sector: Ch.07 Radar Matrix.'}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="tac-btn primary chamfer-sm" onClick={() => { sound.deploy(); onOpenChapter(7); }}>
                  {lang === 'zh-Hant' ? '下一關：Ch.07 矩陣掃描雷達' : 'NEXT MISSION: CH.07 RADAR MATRIX'} →
                </button>
                <button type="button" className="tac-btn ghost chamfer-sm" onClick={() => { sound.click(); onBackToMap(); }}>
                  {t(UI_COPY.backToMap, lang)}
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="cockpit-right">
          <ScannerCanvas
            mode={phase === 'recon' ? 'recon' : 'battle'}
            stream={phase === 'recon' ? RECON_STREAM : inspectedTrial?.spec.stream ?? 'OOXOOO'}
            cursorIndex={phase === 'recon' ? cursorIdx : -1}
            currentRun={phase === 'recon' ? curRun : 0}
            bestRun={phase === 'recon' ? bestRun : inspectedTrial?.actual ?? 0}
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
          />
          <TimelineBar frames={traceFrames} stepIndex={stepIdx} onStepChange={setStepIdx} lang={lang} autoPlayTrigger={autoPlaySeq} />
          <MemoryHud frame={currentFrame} stdout={stdoutShown} lang={lang} />
        </div>
      </div>
    </div>
  );
};
