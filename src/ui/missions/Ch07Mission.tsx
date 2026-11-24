import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Flame, Radar, ShieldAlert, Zap } from 'lucide-react';
import { sound } from '../../engine/audio/synth';
import { Lang, t, UI_COPY } from '../../engine/i18n/text';
import { TraceFrame } from '../../engine/vm';
import { CAMPAIGN_CHAPTERS } from '../../game/campaignData';
import {
  CH07_LOCKS,
  CH07_STARTER_CODE,
  Ch07BattleResult,
  Ch07TrialResult,
  evaluateRadarBattle,
  expectedSweep,
} from '../../game/chapters/ch07Radar';
import { ChapterProgress, computeRank } from '../../game/store';
import { PhaseId } from '../../game/types';
import { BreachPanel } from '../BreachPanel';
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MemoryHud } from '../MemoryHud';
import { MiraComms } from '../MiraComms';
import { MissionHeader } from '../MissionHeader';
import { RadarCanvas } from '../stages/RadarCanvas';
import { TimelineBar } from '../TimelineBar';

export interface Ch07MissionProps {
  lang: Lang;
  phase: PhaseId;
  onPhaseChange: (p: PhaseId) => void;
  progress: ChapterProgress;
  onUpdateProgress: (updater: (prev: ChapterProgress) => ChapterProgress) => void;
  onUnlockChip: (chipId: string) => void;
  onCutIn: (c: Omit<CutInData, 'id'>) => void;
  onBackToMap: () => void;
  chaosRowsTrigger?: { rows: number; seq: number } | null;
}

export const Ch07Mission: React.FC<Ch07MissionProps> = ({
  lang,
  phase,
  onPhaseChange,
  progress,
  onUpdateProgress,
  onUnlockChip,
  onCutIn,
  onBackToMap,
  chaosRowsTrigger,
}) => {
  const meta = CAMPAIGN_CHAPTERS.find((c) => c.id === 7)!;

  // Phase 1: Recon
  const [shape, setShape] = useState<'rect' | 'triangle'>('triangle');
  const [rows, setRows] = useState(4);
  const [litCount, setLitCount] = useState(progress.reconDone ? 10 : 0);
  const [sweptRect, setSweptRect] = useState(progress.reconDone);
  const [sweptTri, setSweptTri] = useState(progress.reconDone);
  const [reconStatus, setReconStatus] = useState<'idle' | 'ok' | 'error'>(progress.reconDone ? 'ok' : 'idle');

  // Phase 2: Breach locks
  const [solvedLocks, setSolvedLocks] = useState<boolean[]>(
    progress.breachCleared ? [true, true, true] : [false, false, false],
  );

  // Phase 3: Battle
  const code = progress.codeDrafts.radar ?? CH07_STARTER_CODE;
  const [battleResult, setBattleResult] = useState<Ch07BattleResult | null>(null);
  const [inspectedTrial, setInspectedTrial] = useState<Ch07TrialResult | null>(null);
  const [chaosNote, setChaosNote] = useState<string | null>(null);

  const [traceFrames, setTraceFrames] = useState<TraceFrame[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [autoPlaySeq, setAutoPlaySeq] = useState(0);
  const sweepTimerRef = useRef<number | null>(null);

  const [mira, setMira] = useState<{ mood: 'neutral' | 'alert' | 'danger' | 'success'; text: string }>({
    mood: 'alert',
    text:
      lang === 'zh-Hant'
        ? '平方九頭蛇封鎖了雷達陣列！切換「矩形」與「三角形」掃描並按下 SWEEP RADAR，觀察內層迴圈怎麼改變格子數！'
        : 'QUADRATIC HYDRA jammed the radar grid! Toggle Rectangular vs Triangular sweep and press SWEEP RADAR to compare visit counts!',
  });

  useEffect(() => {
    return () => {
      if (sweepTimerRef.current) window.clearInterval(sweepTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!chaosRowsTrigger) return;
    onPhaseChange('battle');
    const res = evaluateRadarBattle(code, chaosRowsTrigger.rows);
    const tr = res.trials[0];
    setBattleResult(res);
    setInspectedTrial(tr);
    setTraceFrames(tr.run.frames);
    setStepIdx(0);
    setAutoPlaySeq((s) => s + 1);
    if (tr.passed) {
      sound.shieldBreak();
      setChaosNote(`GM Chaos sweep(${chaosRowsTrigger.rows}) PASSED!`);
      onCutIn({ tag: 'GM CHAOS', title: `SWEEP(${chaosRowsTrigger.rows}) VERIFIED!`, tone: 'lime' });
    } else {
      sound.hitError();
      setChaosNote(`GM Chaos sweep(${chaosRowsTrigger.rows}) failed! Check trailing newline or bounds.`);
      onCutIn({ tag: 'GM CHAOS', title: 'PATTERN MISMATCH!', tone: 'danger' });
    }
  }, [chaosRowsTrigger]);

  const handleSweepRecon = () => {
    if (sweepTimerRef.current) window.clearInterval(sweepTimerRef.current);
    const total = shape === 'rect' ? rows * rows : (rows * (rows + 1)) / 2;
    let cur = 0;
    setLitCount(0);
    sweepTimerRef.current = window.setInterval(() => {
      cur++;
      setLitCount(cur);
      sound.step();
      if (cur >= total) {
        if (sweepTimerRef.current) window.clearInterval(sweepTimerRef.current);
        sound.breachSuccess();
        setReconStatus('ok');
        const nextRect = sweptRect || shape === 'rect';
        const nextTri = sweptTri || shape === 'triangle';
        setSweptRect(nextRect);
        setSweptTri(nextTri);
        if (nextRect || nextTri) {
          onUpdateProgress((p) => ({
            ...p,
            reconDone: true,
            completedPhases: p.completedPhases.includes('recon') ? p.completedPhases : [...p.completedPhases, 'recon'],
          }));
        }
      }
    }, 55);
  };

  const handleDeployRadar = () => {
    setChaosNote(null);
    sound.deploy();
    const res = evaluateRadarBattle(code);
    const focus = res.failedTrial ?? res.trials[res.trials.length - 1];
    setBattleResult(res);
    setInspectedTrial(focus ?? null);
    if (focus) {
      setTraceFrames(focus.run.frames);
      setStepIdx(0);
      setAutoPlaySeq((s) => s + 1);
    }

    if (!res.passed) {
      sound.hitError();
      onUpdateProgress((p) => ({ ...p, battleMistakes: p.battleMistakes + 1 }));
      onCutIn({
        tag: `WAVE ${res.wavesCleared + 1} FAIL`,
        title: focus?.run.error ? 'SYNTAX / RUNTIME FAULT' : `SWEEP(${focus?.spec.rows}) PATTERN MISMATCH`,
        tone: 'danger',
      });
      setMira({
        mood: 'danger',
        text: focus?.run.error
          ? `Line ${focus.run.error.line}: ${focus.run.error.message}`
          : lang === 'zh-Hant'
            ? `sweep(${focus?.spec.rows}) 格式不符！檢查最後一行是不是多加了 \\n，或是 sweep(0) 沒有回傳空字串 ""。`
            : `sweep(${focus?.spec.rows}) mismatched! Check if a trailing \\n appeared or if sweep(0) failed to return "".`,
      });
      return;
    }

    const rank = computeRank(progress.breachMistakes, progress.battleMistakes);
    sound.missionClear();
    onUnlockChip(meta.chipId);
    onCutIn({ tag: 'ACT II COMPLETE', title: `QUADRATIC HYDRA DEFEATED // ${rank}-RANK`, tone: 'lime' });
    onUpdateProgress((p) => ({
      ...p,
      rank,
      completedPhases: p.completedPhases.includes('battle') ? p.completedPhases : [...p.completedPhases, 'battle'],
    }));
    setMira({
      mood: 'success',
      text:
        lang === 'zh-Hant'
          ? `平方九頭蛇擊破！獲得 ${rank} 級評價與 RADAR SWEEP 晶片！Act I & Act II 全 7 話任務制霸！`
          : `QUADRATIC HYDRA shattered! Earned ${rank}-Rank and RADAR SWEEP! All 7 sectors in Act I & II restored!`,
    });
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
              <span className="tac-tag amber">PHASE 01 // NESTED MATRIX SIMULATOR</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`tac-btn ${shape === 'triangle' ? 'primary' : 'ghost'} chamfer-sm`}
                  style={{ flex: 1 }}
                  onClick={() => { sound.click(); setShape('triangle'); setLitCount(0); }}
                >
                  TRIANGLE (c &lt;= r)
                </button>
                <button
                  type="button"
                  className={`tac-btn ${shape === 'rect' ? 'primary' : 'ghost'} chamfer-sm`}
                  style={{ flex: 1 }}
                  onClick={() => { sound.click(); setShape('rect'); setLitCount(0); }}
                >
                  RECTANGLE ({rows}×{rows})
                </button>
              </div>

              <label style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span className="mono" style={{ color: 'var(--cyan)' }}>Matrix Rows (n)</span>
                  <strong className="mono">{rows}</strong>
                </div>
                <input type="range" min={2} max={6} value={rows} onChange={(e) => { setRows(Number(e.target.value)); setLitCount(0); }} style={{ accentColor: 'var(--cyan)' }} />
              </label>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <button type="button" className="tac-btn primary chamfer-sm" onClick={handleSweepRecon}>
                  <Radar size={15} /> SWEEP RADAR
                </button>
                <button type="button" className="tac-btn lime chamfer-sm" disabled={!progress.reconDone} onClick={() => { sound.click(); onPhaseChange('breach'); }}>
                  {lang === 'zh-Hant' ? '前往 Phase 02 雷達鎖' : 'PROCEED TO BREACH'} <ArrowRight size={15} />
                </button>
              </div>
            </section>
          )}

          {phase === 'breach' && (
            <BreachPanel
              locks={CH07_LOCKS}
              solvedLocks={solvedLocks}
              lang={lang}
              tagLabel="NESTED BOUNDS"
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
                  onCutIn({ tag: 'MATRIX LOCKED', title: 'NESTED LOCKS CLEARED', tone: 'lime' });
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
                  <div className="mono" style={{ fontSize: 10, color: 'var(--crimson)', fontWeight: 700 }}>ACT II BOSS // 3-WAVE PATTERN SWEEPS</div>
                  <strong style={{ fontSize: 15 }}>QUADRATIC HYDRA</strong>
                </div>
                <div className="shield-pips">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={`shield-pip ${battleResult && i < battleResult.wavesCleared ? 'broken' : ''}`} />
                  ))}
                </div>
              </div>

              <div style={{ padding: '10px 12px', background: 'rgba(6, 11, 18, 0.72)', borderLeft: '3px solid var(--cyan)', fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                {lang === 'zh-Hant'
                  ? '實作 sweep(rows)：回傳含 rows 行的三角形 # 圖樣（第 r 列有 r 個 #），列間以 "\\n" 分隔且末行不可加 "\\n"；rows == 0 回傳 ""。'
                  : 'Implement sweep(rows): return a string with rows lines where line r (1..rows) has r "#" signs, separated by "\\n" with NO trailing newline (sweep(0) -> "").'}
              </div>

              <CodeTerminal
                value={code}
                starterCode={CH07_STARTER_CODE}
                activeLine={currentFrame?.line ?? null}
                lang={lang}
                onChange={(next) => onUpdateProgress((p) => ({ ...p, codeDrafts: { ...p.codeDrafts, radar: next } }))}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="tac-btn primary chamfer-sm" style={{ minHeight: 42 }} onClick={handleDeployRadar}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
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
                        <span>W{tr.waveIndex + 1} · sweep({tr.spec.rows})</span>
                        <span>{tr.passed ? '✓ PASS' : '✕ FAIL'}</span>
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
                <span className="tac-tag lime">ACT II CLEARED // RADAR SWEEP SYNCED</span>
                <span className="tac-tag cyan" style={{ fontSize: 16, padding: '6px 14px' }}>RANK {progress.rank ?? 'S'}</span>
              </div>
              <h2 style={{ fontSize: 28 }}>{lang === 'zh-Hant' ? '矩陣雷達全面上線' : 'Radar Matrix Online'}</h2>
              <p style={{ color: 'var(--ink-secondary)', fontSize: 13.5 }}>
                {lang === 'zh-Hant'
                  ? '恭喜！Act I（Ch.01–03）與 Act II（Ch.04–07）全部 7 個戰區已完全修復！回到 Aether-9 全域戰術圖檢視整座城市點亮的樣貌吧。'
                  : 'All 7 sectors across Act I & Act II are restored! Return to Aether-9 Overworld Map to view the energized city grid.'}
              </p>
              <button type="button" className="tac-btn primary chamfer-sm" onClick={() => { sound.click(); onBackToMap(); }}>
                {t(UI_COPY.backToMap, lang)}
              </button>
            </section>
          )}
        </div>

        <div className="cockpit-right">
          <RadarCanvas
            mode={phase === 'recon' ? 'recon' : 'battle'}
            shape={shape}
            rows={phase === 'recon' ? rows : inspectedTrial?.spec.rows ?? 3}
            cols={rows}
            litCount={litCount}
            patternText={inspectedTrial?.actual ?? ''}
            expectedText={inspectedTrial?.spec.expected ?? expectedSweep(3)}
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
