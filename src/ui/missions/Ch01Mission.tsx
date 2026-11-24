import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Flame, ShieldAlert, Zap } from 'lucide-react';
import { sound } from '../../engine/audio/synth';
import { Lang, t, UI_COPY } from '../../engine/i18n/text';
import { TraceFrame } from '../../engine/vm';
import { CAMPAIGN_CHAPTERS } from '../../game/campaignData';
import {
  CH01_LOCKS,
  CH01_REACTOR_STARTER,
  CH01_SWAP_STARTER,
  evaluateReactorEncounter,
  evaluateSwapEncounter,
  ReactorWaveSpec,
} from '../../game/chapters/ch01Reactor';
import { ChapterProgress, computeRank } from '../../game/store';
import { Ch01EncounterResult, PhaseId } from '../../game/types';
import { BreachPanel } from '../BreachPanel';
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MissionStageLayout } from '../MissionStageLayout';
import { ReactorCanvas } from '../stages/ReactorCanvas';

export interface Ch01MissionProps {
  lang: Lang;
  phase: PhaseId;
  onPhaseChange: (p: PhaseId) => void;
  progress: ChapterProgress;
  onUpdateProgress: (updater: (prev: ChapterProgress) => ChapterProgress) => void;
  onUnlockChip: (chipId: string) => void;
  onCutIn: (c: Omit<CutInData, 'id'>) => void;
  onOpenChapter: (chapterId: number) => void;
  onBackToMap: () => void;
  chaosWaveTrigger?: { wave: ReactorWaveSpec; seq: number } | null;
}

export const Ch01Mission: React.FC<Ch01MissionProps> = ({
  lang,
  phase,
  onPhaseChange,
  progress,
  onUpdateProgress,
  onUnlockChip,
  onCutIn,
  onOpenChapter,
  onBackToMap,
  chaosWaveTrigger,
}) => {
  const meta = CAMPAIGN_CHAPTERS[0];

  // Phase 1: Recon state
  const [energy, setEnergy] = useState(100);
  const [used, setUsed] = useState(35);
  const [stored, setStored] = useState(progress.reconDone ? 75 : 65);
  const [predictInput, setPredictInput] = useState(progress.reconDone ? '75' : '');
  const [reconStatus, setReconStatus] = useState<'idle' | 'ok' | 'error' | 'stale'>(
    progress.reconDone ? 'ok' : 'idle',
  );
  const [reconFeedback, setReconFeedback] = useState('');
  const [pulseKey, setPulseKey] = useState(0);

  // Phase 2: Breach state
  const [solvedLocks, setSolvedLocks] = useState<boolean[]>(
    progress.breachCleared ? [true, true] : [false, false],
  );

  // Phase 3: Battle state
  const [encounter, setEncounter] = useState<'swap' | 'reactor'>('swap');
  const swapCode = progress.codeDrafts.swap ?? CH01_SWAP_STARTER;
  const reactorCode = progress.codeDrafts.reactor ?? CH01_REACTOR_STARTER;
  const [battleResult, setBattleResult] = useState<Ch01EncounterResult | null>(null);
  const [expandedWave, setExpandedWave] = useState<number | null>(null);
  const [chaosNote, setChaosNote] = useState<string | null>(null);

  // Shared Trace Playback state
  const [traceFrames, setTraceFrames] = useState<TraceFrame[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [autoPlaySeq, setAutoPlaySeq] = useState(0);

  const [mira, setMira] = useState<{ mood: 'neutral' | 'alert' | 'danger' | 'success'; text: string }>({
    mood: 'alert',
    text:
      lang === 'zh-Hant'
        ? '反應爐儀表顯示剩餘 65 MW，但實體感測器正在漂移！將 Supply 調為 120、Usage 調為 45，觀察讀數落差。'
        : 'Dashboard reads 65 MW even while sensors drift. Set Supply = 120 and Usage = 45, then predict and execute!',
  });

  useEffect(() => {
    if (phase === 'recon') {
      setMira({
        mood: progress.reconDone ? 'success' : 'alert',
        text:
          lang === 'zh-Hant'
            ? '把 Supply 調成 120、Usage 調成 45（或按 A/D、W/S），觀察 Memory Core 是否自動更新，再輸入預測執行！'
            : 'Tune Supply = 120 and Usage = 45 (keys A/D, W/S). See if Memory Core moves on its own, then predict and execute.',
      });
    } else if (phase === 'breach') {
      setMira({
        mood: 'neutral',
        text:
          lang === 'zh-Hant'
            ? '逐行追蹤每個 = 指定運算發生的時機，解開兩道防火牆鎖。'
            : 'Trace each assignment step by step to crack both reactor locks.',
      });
    } else if (phase === 'battle') {
      setMira({
        mood: 'alert',
        text:
          lang === 'zh-Hant'
            ? '先通過 01 Channel Swap 暖身，再迎戰 02 Overload Core 守護 3 波變化輸入！'
            : 'Clear Channel Swap first, then defeat Overload Core across 3 live input waves.',
      });
    } else {
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? 'Aether-9 中央反應爐已重新上線！可從下方追蹤器重播每一步記憶體狀態。'
            : 'Aether-9 core stabilized! Scrub the trace below to review every register snapshot.',
      });
    }
  }, [phase, lang, progress.reconDone]);

  useEffect(() => {
    if (phase !== 'recon') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'a' || e.key === 'A') setEnergy((v) => Math.max(80, v - 5));
      if (e.key === 'd' || e.key === 'D') setEnergy((v) => Math.min(160, v + 5));
      if (e.key === 'w' || e.key === 'W') setUsed((v) => Math.min(70, v + 5));
      if (e.key === 's' || e.key === 'S') setUsed((v) => Math.max(0, v - 5));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  useEffect(() => {
    if (!chaosWaveTrigger) return;
    setEncounter('reactor');
    onPhaseChange('battle');
    const res = evaluateReactorEncounter(reactorCode, chaosWaveTrigger.wave);
    setBattleResult(res);
    setExpandedWave(res.passed ? null : 0);
    setTraceFrames(res.primaryRun.frames);
    setStepIdx(0);
    setAutoPlaySeq((s) => s + 1);
    setPulseKey((k) => k + 1);
    if (res.passed) {
      sound.shieldBreak();
      setChaosNote(
        lang === 'zh-Hant'
          ? `GM 干擾波通過 (${chaosWaveTrigger.wave.initEnergy}/${chaosWaveTrigger.wave.initUsed} → ${chaosWaveTrigger.wave.updEnergy}/${chaosWaveTrigger.wave.updUsed})`
          : `GM Chaos passed (${chaosWaveTrigger.wave.initEnergy}/${chaosWaveTrigger.wave.initUsed} → ${chaosWaveTrigger.wave.updEnergy}/${chaosWaveTrigger.wave.updUsed})`,
      );
      onCutIn({ tag: 'GM CHAOS', title: 'CHAOS WAVE DEFLECTED!', tone: 'lime' });
    } else {
      sound.hitError();
      setChaosNote(
        lang === 'zh-Hant'
          ? 'GM 干擾波擊穿防線！請檢視下方失敗原因。'
          : 'GM Chaos breached your code! Inspect the wave check below.',
      );
      onCutIn({ tag: 'GM CHAOS', title: 'CHAOS BREACH DETECTED', tone: 'danger' });
    }
  }, [chaosWaveTrigger]);

  const currentFrame = traceFrames[stepIdx] ?? null;

  const handleReconExecute = () => {
    const calibrated = energy === 120 && used === 45;
    const predOk = predictInput.trim() === '75';
    setPulseKey((k) => k + 1);

    if (!calibrated) {
      sound.hitError();
      setReconStatus('error');
      setReconFeedback(
        lang === 'zh-Hant'
          ? '請先將 Supply 設為 120、Usage 設為 45，製造並觀察數值落差。'
          : 'Calibrate Supply = 120 and Usage = 45 first to observe the mismatch.',
      );
      return;
    }
    if (!predOk) {
      sound.hitError();
      setReconStatus('error');
      setReconFeedback(
        lang === 'zh-Hant'
          ? '預測有誤。執行 remaining = energy - used; 時，120 - 45 會是多少？'
          : 'Prediction mismatch. When remaining = energy - used; runs, what is 120 - 45?',
      );
      return;
    }

    sound.shieldBreak();
    setStored(75);
    setReconStatus('ok');
    setReconFeedback(
      lang === 'zh-Hant'
        ? '同步成功！= 會立刻計算右側並存入記憶體，修改舊變數不會回頭重算。'
        : 'Sync restored! Assignment computes 120 - 45 now and overwrites remaining with 75.',
    );
    setMira({
      mood: 'success',
      text:
        lang === 'zh-Hant'
          ? '變數存的是「執行當下的快照」，不是自動連動公式。可以突入防火牆了！'
          : 'Variables store snapshots, not live formulas. Ready to breach the firewall!',
    });
    onUpdateProgress((prev) => ({
      ...prev,
      reconDone: true,
      completedPhases: prev.completedPhases.includes('recon')
        ? prev.completedPhases
        : [...prev.completedPhases, 'recon'],
    }));
  };

  const handleDeployBattle = () => {
    setChaosNote(null);
    sound.deploy();
    const res =
      encounter === 'swap'
        ? evaluateSwapEncounter(swapCode)
        : evaluateReactorEncounter(reactorCode);

    setBattleResult(res);
    const firstFailIdx = res.waveDetails.findIndex((w) => !w.passed);
    setExpandedWave(firstFailIdx >= 0 ? firstFailIdx : null);
    setTraceFrames(res.primaryRun.frames);
    setStepIdx(0);
    setAutoPlaySeq((s) => s + 1);
    setPulseKey((k) => k + 1);

    if (!res.passed) {
      sound.hitError();
      onUpdateProgress((p) => ({ ...p, battleMistakes: p.battleMistakes + 1 }));
      onCutIn({
        tag: `WAVE ${res.wavesCleared + 1} FAIL`,
        title: res.primaryRun.error ? 'COMPILATION FAULT' : 'LOGIC MISMATCH',
        tone: 'danger',
      });
      setMira({
        mood: 'danger',
        text: res.primaryRun.error
          ? `Line ${res.primaryRun.error.line}: ${res.primaryRun.error.message}`
          : lang === 'zh-Hant'
            ? `第 ${res.wavesCleared + 1} 波未通過！拖曳左側追蹤器檢查哪一步與預期不符。`
            : `Wave ${res.wavesCleared + 1} failed! Scrub the trace below the stage to inspect memory.`,
      });
      return;
    }

    sound.shieldBreak();
    const nextEncounterCleared = { ...progress.encounterCleared, [encounter]: true };
    const bothCleared = Boolean(nextEncounterCleared.swap && nextEncounterCleared.reactor);

    if (bothCleared) {
      const rank = computeRank(progress.breachMistakes, progress.battleMistakes);
      sound.missionClear();
      onUnlockChip(meta.chipId);
      onCutIn({
        tag: 'SEC-01 RESTORED',
        title: `OVERLOAD CORE DEFEATED // ${rank}-RANK`,
        tone: 'lime',
      });
      onUpdateProgress((prev) => ({
        ...prev,
        rank,
        encounterCleared: nextEncounterCleared,
        completedPhases: prev.completedPhases.includes('battle')
          ? prev.completedPhases
          : [...prev.completedPhases, 'battle'],
      }));
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? `全部關卡與三波測試擊破！獲得 ${rank} 級評價與 MEMORY CORE v1！`
            : `All waves shattered! Earned ${rank}-Rank and synced MEMORY CORE v1.`,
      });
    } else {
      onUpdateProgress((prev) => ({
        ...prev,
        encounterCleared: nextEncounterCleared,
      }));
      onCutIn({
        tag: 'STAGE CLEAR',
        title: encounter === 'swap' ? 'CHANNELS SWAPPED!' : 'OVERLOAD CORE SHATTERED!',
        tone: 'cyan',
      });
      setMira({
        mood: 'success',
        text:
          encounter === 'swap'
            ? lang === 'zh-Hant'
              ? '雙頻道交換過關！切換到「02 Overload Core」正面迎戰反應爐 Boss！'
              : 'Channel Swap cleared! Switch to "02 Overload Core" to face the boss.'
            : lang === 'zh-Hant'
              ? 'Boss 已擊破！再清掉「01 Channel Swap」即可結算本關評級！'
              : 'Boss defeated! Clear "01 Channel Swap" to finalize your sector rank.',
      });
    }
  };

  const canvasMode =
    phase === 'recon'
      ? 'recon'
      : phase === 'breach'
        ? 'trace'
        : encounter === 'swap'
          ? 'swap'
          : 'reactor';

  const canvasStatus: 'idle' | 'ok' | 'error' | 'stale' =
    phase === 'recon'
      ? reconStatus
      : battleResult
        ? battleResult.passed
          ? 'ok'
          : 'error'
        : 'idle';

  const brokenShields =
    encounter === 'reactor' && battleResult
      ? battleResult.totalWaves === 1
        ? progress.rank ? 3 : 0
        : battleResult.wavesCleared
      : encounter === 'reactor' && progress.rank ? 3 : 0;

  const swapCleared = Boolean(progress.encounterCleared.swap);
  const reactorCleared = Boolean(progress.encounterCleared.reactor);
  const battleComplete = swapCleared && reactorCleared;

  const stdoutShown = useMemo(() => {
    if (currentFrame) return currentFrame.stdout;
    return battleResult?.primaryRun.stdout ?? '';
  }, [currentFrame, battleResult]);

  const activeWaveDetail =
    battleResult && expandedWave !== null
      ? battleResult.waveDetails[expandedWave] ?? null
      : null;

  return (
    <MissionStageLayout
      stage={
        <ReactorCanvas
          mode={canvasMode}
          energy={energy}
          used={used}
          stored={stored}
          activeFrame={currentFrame}
          bossShields={3}
          brokenShields={brokenShields}
          status={canvasStatus}
          pulseKey={pulseKey}
        />
      }
      bossHud={
        phase === 'battle' && encounter === 'reactor'
          ? { name: 'OVERLOAD CORE', shields: 3, broken: brokenShields }
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
              {lang === 'zh-Hant' ? '製造並同步記憶體落差' : 'Break Sync, Then Restore'}
            </h2>
            <span className="deck-hint mono">A/D · W/S</span>
          </div>

          <div className="deck-two-col">
            <label className="control-tile">
              <div className="deck-row-between">
                <span className="mono" style={{ fontSize: 12, color: 'var(--cyan)' }}>Supply (energy)</span>
                <strong className="mono">{energy}</strong>
              </div>
              <input
                type="range"
                min={80}
                max={160}
                step={5}
                value={energy}
                onChange={(e) => setEnergy(Number(e.target.value))}
                style={{ accentColor: 'var(--cyan)' }}
              />
            </label>

            <label className="control-tile">
              <div className="deck-row-between">
                <span className="mono" style={{ fontSize: 12, color: 'var(--amber)' }}>Usage (used)</span>
                <strong className="mono">{used}</strong>
              </div>
              <input
                type="range"
                min={0}
                max={70}
                step={5}
                value={used}
                onChange={(e) => setUsed(Number(e.target.value))}
                style={{ accentColor: 'var(--amber)' }}
              />
            </label>
          </div>

          <div className={`sync-strip mono ${stored !== energy - used ? 'desync' : 'ok'}`}>
            <span>
              Physical <strong>{energy - used} MW</strong> · Memory <strong>{stored}</strong>
            </span>
            <span>{stored !== energy - used ? 'DESYNC' : 'SYNCED'}</span>
          </div>

          <label className="deck-field">
            <span className="deck-field-label mono">
              {lang === 'zh-Hant'
                ? '預測執行 remaining = energy - used; 後的值'
                : 'Predict remaining after assignment'}
            </span>
            <input
              type="number"
              className="deck-input mono"
              value={predictInput}
              placeholder="?"
              onChange={(e) => setPredictInput(e.target.value)}
            />
          </label>

          {reconFeedback && (
            <div className={`deck-feedback ${reconStatus === 'ok' ? 'ok' : 'err'}`}>
              {reconFeedback}
            </div>
          )}

          <div className="deck-actions">
            <button
              type="button"
              className={`tac-btn ${progress.reconDone ? 'ghost' : 'primary'} deck-primary-cta`}
              onClick={handleReconExecute}
            >
              <Zap size={15} />
              <span>EXECUTE: remaining = energy - used;</span>
            </button>

            {progress.reconDone && (
              <button
                type="button"
                className="tac-btn primary deck-primary-cta"
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
          locks={CH01_LOCKS}
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
              onCutIn({ tag: 'FIREWALL', title: 'ALL LOCKS CRACKED', tone: 'lime' });
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
          <div className="encounter-tabs" role="tablist" aria-label="Battle encounters">
            <button
              type="button"
              role="tab"
              aria-selected={encounter === 'swap'}
              className={`encounter-tab ${encounter === 'swap' ? 'active' : ''} ${swapCleared ? 'cleared' : ''}`}
              onClick={() => {
                sound.click();
                setEncounter('swap');
                setBattleResult(null);
                setExpandedWave(null);
                setTraceFrames([]);
                setChaosNote(null);
              }}
            >
              {swapCleared && <Check size={12} strokeWidth={2.5} />}
              <span>01 Channel Swap</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={encounter === 'reactor'}
              className={`encounter-tab ${encounter === 'reactor' ? 'active' : ''} ${reactorCleared ? 'cleared' : ''}`}
              onClick={() => {
                sound.click();
                setEncounter('reactor');
                setBattleResult(null);
                setExpandedWave(null);
                setTraceFrames([]);
                setChaosNote(null);
              }}
            >
              {reactorCleared && <Check size={12} strokeWidth={2.5} />}
              <span>02 Overload Core</span>
            </button>
          </div>

          <p className="mission-goal">
            {encounter === 'swap'
              ? lang === 'zh-Hant'
                ? '用 int temp 交換 left 與 right，印出 "Left: <val>" 與 "Right: <val>"。'
                : 'Swap left and right with an int temp variable, then print "Left: <val>" and "Right: <val>".'
              : lang === 'zh-Hant'
                ? '宣告 energy=120、used=45，備份 remaining 至 initialRemaining，重設為 150/65 重算，宣告 boolean online=true 並印出 Initial / Updated / Online。'
                : 'Set energy=120, used=45, snapshot initialRemaining, update to 150/65, declare boolean online=true, and print Initial / Updated / Online.'}
          </p>

          <CodeTerminal
            value={encounter === 'swap' ? swapCode : reactorCode}
            starterCode={encounter === 'swap' ? CH01_SWAP_STARTER : CH01_REACTOR_STARTER}
            activeLine={currentFrame?.line ?? null}
            lang={lang}
            onChange={(next) =>
              onUpdateProgress((prev) => ({
                ...prev,
                codeDrafts: { ...prev.codeDrafts, [encounter]: next },
              }))
            }
          />

          <div className="deck-actions">
            <button
              type="button"
              className="tac-btn primary deck-primary-cta"
              onClick={handleDeployBattle}
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

          {chaosNote && (
            <div className="deck-feedback warn">
              <Flame size={13} /> <span>{chaosNote}</span>
            </div>
          )}

          {battleResult && (
            <div className="wave-results">
              <div className="wave-pills">
                {battleResult.waveDetails.map((wd) => {
                  const isOpen = expandedWave === wd.waveIndex;
                  return (
                    <button
                      key={wd.waveIndex}
                      type="button"
                      className={`wave-pill mono ${wd.passed ? 'pass' : 'fail'} ${isOpen ? 'selected' : ''}`}
                      onClick={() => {
                        sound.click();
                        setExpandedWave(isOpen ? null : wd.waveIndex);
                        setTraceFrames(wd.run.frames);
                        setStepIdx(0);
                        setAutoPlaySeq((s) => s + 1);
                      }}
                    >
                      <span>W{wd.waveIndex + 1}</span>
                      <span>{wd.passed ? '✓' : '✕'}</span>
                    </button>
                  );
                })}
              </div>

              {activeWaveDetail && (
                <div className={`wave-detail ${activeWaveDetail.passed ? 'pass' : 'fail'}`}>
                  <div className="wave-detail-title">{t(activeWaveDetail.label, lang)}</div>
                  {!activeWaveDetail.passed && activeWaveDetail.run.error && (
                    <div className="wave-err-line mono">
                      <ShieldAlert size={12} />
                      <span>Line {activeWaveDetail.run.error.line}: {activeWaveDetail.run.error.message}</span>
                    </div>
                  )}
                  <ul className="wave-check-list">
                    {activeWaveDetail.checks.map((ck, ci) => (
                      <li key={ci} className={ck.ok ? 'ok' : 'err'}>
                        {ck.ok ? '✓' : '✕'} {t(ck.label, lang)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
                {lang === 'zh-Hant' ? '中央反應爐完全穩定' : 'Reactor Stabilized'}
              </h2>
            </div>
          </div>

          <p className="deck-copy">
            {lang === 'zh-Hant'
              ? '你已掌握 Java 基本型別、賦值快照與 temp 變數交換，成功修復 Ch.01。'
              : 'You mastered primitive snapshots and temp-variable swaps to restore Sector 01.'}
          </p>

          <div className="deck-actions">
            <button
              type="button"
              className="tac-btn primary deck-primary-cta"
              onClick={() => {
                sound.deploy();
                onOpenChapter(2);
              }}
            >
              <span>{lang === 'zh-Hant' ? '下一關：Ch.02 霓虹夜市' : 'NEXT: CH.02 MARKET'}</span>
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
