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
import { MissionStageLayout } from '../MissionStageLayout';
import { RadarCanvas } from '../stages/RadarCanvas';

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
        ? '切換「三角形」與「矩形」掃描並按下 SWEEP RADAR，觀察內層迴圈邊界如何改變總格數！'
        : 'Toggle Triangle vs Rectangle and press SWEEP RADAR to compare inner-loop cell visit counts!',
  });

  useEffect(() => {
    return () => {
      if (sweepTimerRef.current) window.clearInterval(sweepTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase === 'breach') {
      setMira({
        mood: 'neutral',
        text:
          lang === 'zh-Hant'
            ? '分析巢狀迴圈內外層關係與 n 倍增時的成長倍數，解開三道雷達鎖！'
            : 'Trace nested loop bounds and quadratic runtime scaling to crack all 3 locks!',
      });
    } else if (phase === 'battle') {
      setMira({
        mood: 'alert',
        text:
          lang === 'zh-Hant'
            ? '實作 sweep(rows) 輸出三角形 # 圖樣：記得最末行後面不可多加 \\n，且 sweep(0) 回傳 ""！'
            : 'Implement sweep(rows): triangular # pattern with no trailing \\n (sweep(0) -> "").',
      });
    } else if (phase === 'debrief') {
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? 'Act I & II 全 7 話制霸！回到 Aether-9 地圖檢視整座城市點亮的電網吧！'
            : 'All 7 sectors in Act I & II restored! Return to Aether-9 to view the energized city.',
      });
    }
  }, [phase, lang]);

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
      setChaosNote(`GM Chaos sweep(${chaosRowsTrigger.rows}) PASSED`);
      onCutIn({ tag: 'GM CHAOS', title: `SWEEP(${chaosRowsTrigger.rows}) VERIFIED!`, tone: 'lime' });
    } else {
      sound.hitError();
      setChaosNote(`GM Chaos sweep(${chaosRowsTrigger.rows}) failed! Check bounds or trailing newline.`);
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
        title: focus?.run.error ? 'RUNTIME FAULT' : `SWEEP(${focus?.spec.rows}) MISMATCH`,
        tone: 'danger',
      });
      setMira({
        mood: 'danger',
        text: focus?.run.error
          ? `Line ${focus.run.error.line}: ${focus.run.error.message}`
          : lang === 'zh-Hant'
            ? `sweep(${focus?.spec.rows}) 格式不符！檢查最後一行是否多了 \\n，或 sweep(0) 是否回傳 ""。`
            : `sweep(${focus?.spec.rows}) mismatched! Check trailing \\n or sweep(0) -> "".`,
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
          ? `平方九頭蛇擊破！獲得 ${rank} 級評價與 RADAR SWEEP，Act I & II 全制霸！`
          : `QUADRATIC HYDRA shattered! Earned ${rank}-Rank & RADAR SWEEP. Act I & II complete!`,
    });
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
          brokenShields={brokenShields}
          status={phase === 'recon' ? reconStatus : battleResult ? (battleResult.passed ? 'ok' : 'error') : 'idle'}
        />
      }
      bossHud={
        phase === 'battle'
          ? { name: 'QUADRATIC HYDRA', shields: 3, broken: brokenShields }
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
          <h2 className="deck-heading">
            {lang === 'zh-Hant' ? '巢狀迴圈矩陣掃描儀' : 'Nested Matrix Simulator'}
          </h2>

          <div className="encounter-tabs">
            <button
              type="button"
              className={`encounter-tab ${shape === 'triangle' ? 'active' : ''}`}
              onClick={() => {
                sound.click();
                setShape('triangle');
                setLitCount(0);
              }}
            >
              TRIANGLE (c &lt;= r)
            </button>
            <button
              type="button"
              className={`encounter-tab ${shape === 'rect' ? 'active' : ''}`}
              onClick={() => {
                sound.click();
                setShape('rect');
                setLitCount(0);
              }}
            >
              RECTANGLE ({rows}×{rows})
            </button>
          </div>

          <label className="control-tile">
            <div className="deck-row-between">
              <span className="mono" style={{ fontSize: 12, color: 'var(--cyan)' }}>Matrix Rows (n)</span>
              <strong className="mono">{rows}</strong>
            </div>
            <input
              type="range"
              min={2}
              max={6}
              value={rows}
              onChange={(e) => {
                setRows(Number(e.target.value));
                setLitCount(0);
              }}
              style={{ accentColor: 'var(--cyan)' }}
            />
          </label>

          <div className="deck-actions">
            <button type="button" className={`tac-btn ${progress.reconDone ? 'ghost' : 'primary'} deck-primary-cta`} onClick={handleSweepRecon}>
              <Radar size={15} />
              <span>SWEEP RADAR</span>
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
          locks={CH07_LOCKS}
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
              onCutIn({ tag: 'MATRIX LOCKED', title: 'NESTED LOCKS CLEARED', tone: 'lime' });
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
              ? '實作 sweep(rows)：回傳 rows 行的三角形 #（第 r 列有 r 個 #），列間以 "\\n" 分隔且末行不可加 "\\n"；rows == 0 回傳 ""。'
              : 'Implement sweep(rows): return rows lines of triangular # joined by "\\n" with NO trailing newline (sweep(0) -> "").'}
          </p>

          <CodeTerminal
            value={code}
            starterCode={CH07_STARTER_CODE}
            activeLine={currentFrame?.line ?? null}
            lang={lang}
            onChange={(next) => onUpdateProgress((p) => ({ ...p, codeDrafts: { ...p.codeDrafts, radar: next } }))}
          />

          <div className="deck-actions">
            <button type="button" className="tac-btn primary deck-primary-cta" onClick={handleDeployRadar}>
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
                      <span>W{tr.waveIndex + 1} · sweep({tr.spec.rows})</span>
                      <span>{tr.passed ? '✓ PASS' : '✕ FAIL'}</span>
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
                {lang === 'zh-Hant' ? '矩陣雷達全面上線' : 'Radar Matrix Online'}
              </h2>
            </div>
          </div>

          <p className="deck-copy">
            {lang === 'zh-Hant'
              ? '恭喜！Act I（Ch.01–03）與 Act II（Ch.04–07）全部 7 個戰區已完全修復！'
              : 'All 7 sectors across Act I & Act II are now restored across Aether-9!'}
          </p>

          <div className="deck-actions">
            <button type="button" className="tac-btn primary deck-primary-cta" onClick={() => { sound.click(); onBackToMap(); }}>
              <span>{lang === 'zh-Hant' ? '返回 Aether-9 地圖' : 'RETURN TO MAP'}</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
    </MissionStageLayout>
  );
};
