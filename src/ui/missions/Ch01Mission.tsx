import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { MISSION_BRIEFINGS } from '../../game/missionBriefings';
import { ChapterProgress, computeRank } from '../../game/store';
import { Ch01EncounterResult, PhaseId } from '../../game/types';
import { BreachPanel } from '../BreachPanel';
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MissionPopup } from '../MissionPopup';
import { MissionStageLayout, ReactiveFeedbackInfo } from '../MissionStageLayout';
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
  skipBriefings?: boolean;
  onToggleSkipBriefings?: (next: boolean) => void;
  guideRequestSeq?: number;
  suppressAutoBriefing?: boolean;
  chaosWaveTrigger?: { wave: ReactorWaveSpec; seq: number } | null;
}

type PopupKind = null | 'briefing' | 'recon-clear' | 'breach-clear' | 'warmup-clear' | 'boss-clear';

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
  skipBriefings = false,
  onToggleSkipBriefings,
  guideRequestSeq = 0,
  suppressAutoBriefing = false,
  chaosWaveTrigger,
}) => {
  const meta = CAMPAIGN_CHAPTERS[0];
  const brief = MISSION_BRIEFINGS[1];

  // Phase 1: Recon state
  const [energy, setEnergy] = useState(progress.reconDone ? 120 : 100);
  const [used, setUsed] = useState(progress.reconDone ? 45 : 35);
  const [stored, setStored] = useState(progress.reconDone ? 75 : 65);
  const [adjustingSliders, setAdjustingSliders] = useState(false);
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

  // Trace & Reactive Feedback
  const [traceFrames, setTraceFrames] = useState<TraceFrame[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [autoPlaySeq, setAutoPlaySeq] = useState(0);
  const [feedbackBar, setFeedbackBar] = useState<ReactiveFeedbackInfo | null>(null);

  // Guided Popups
  const [popup, setPopup] = useState<PopupKind>(() =>
    phase !== 'debrief' && !skipBriefings && !suppressAutoBriefing ? 'briefing' : null,
  );
  const prevPhaseRef = useRef<PhaseId>(phase);
  const lastGuideSeqRef = useRef(guideRequestSeq);
  const suppressNextBriefRef = useRef(false);

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

  // Keyboard tuning shortcuts in Recon (A/D for energy, W/S for used)
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

  const calibrated = energy === 120 && used === 45;
  useEffect(() => {
    if (calibrated && adjustingSliders) {
      setAdjustingSliders(false);
    }
  }, [calibrated, adjustingSliders]);

  useEffect(() => {
    if (!chaosWaveTrigger) return;
    suppressNextBriefRef.current = true;
    setPopup(null);
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
      setFeedbackBar(null);
      onCutIn({ tag: 'GM CHAOS', title: 'CHAOS WAVE DEFLECTED!', tone: 'lime' });
    } else {
      sound.hitError();
      setChaosNote(
        lang === 'zh-Hant'
          ? 'GM 干擾波擊穿防線！請檢視下方失敗原因。'
          : 'GM Chaos breached your code! Inspect the wave check below.',
      );
      setFeedbackBar({
        mood: 'danger',
        text: lang === 'zh-Hant' ? '干擾波擊穿防線！檢查下方波動檢查。' : 'GM Chaos breached your code!',
      });
      onCutIn({ tag: 'GM CHAOS', title: 'CHAOS BREACH DETECTED', tone: 'danger' });
    }
  }, [chaosWaveTrigger]);

  const currentFrame = traceFrames[stepIdx] ?? null;

  const handleReconExecute = () => {
    const predOk = predictInput.trim() === '75';
    setPulseKey((k) => k + 1);

    if (!predOk) {
      sound.hitError();
      setReconStatus('error');
      const msg =
        lang === 'zh-Hant'
          ? '預測不對喔！執行 remaining = energy - used; 時，120 - 45 是多少？'
          : 'Not quite! When remaining = energy - used; executes, what is 120 - 45?';
      setReconFeedback(msg);
      setFeedbackBar({ mood: 'danger', text: msg });
      return;
    }

    sound.shieldBreak();
    setStored(75);
    setReconStatus('ok');
    setReconFeedback('');
    setFeedbackBar(null);
    onUpdateProgress((prev) => ({
      ...prev,
      reconDone: true,
      completedPhases: prev.completedPhases.includes('recon')
        ? prev.completedPhases
        : [...prev.completedPhases, 'recon'],
    }));
    setPopup('recon-clear');
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
      setFeedbackBar({
        mood: 'danger',
        text: res.primaryRun.error
          ? `Line ${res.primaryRun.error.line}: ${res.primaryRun.error.message}`
          : lang === 'zh-Hant'
            ? `第 ${res.wavesCleared + 1} 波失敗！拖動下方追蹤器檢查哪一行與預期不符。`
            : `Wave ${res.wavesCleared + 1} failed! Scrub the trace below to see what diverged.`,
      });
      return;
    }

    sound.shieldBreak();
    setFeedbackBar(null);
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
      setPopup('boss-clear');
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
      if (encounter === 'swap') {
        setPopup('warmup-clear');
      }
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

  const stepBanner = useMemo(() => {
    const openGuide = () => setPopup('briefing');
    if (phase === 'recon') {
      if (!calibrated || adjustingSliders) {
        return {
          stepTag: 'STEP 1 / 2',
          instruction: lang === 'zh-Hant' ? '把 Supply 調為 120、Usage 調為 45' : 'Drag Supply → 120 & Usage → 45',
          onOpenGuide: openGuide,
        };
      }
      return {
        stepTag: 'STEP 2 / 2',
        instruction: lang === 'zh-Hant' ? '預測 120 - 45 結果並按 EXECUTE' : 'Predict 120 - 45 & press EXECUTE',
        onOpenGuide: openGuide,
      };
    }
    if (phase === 'breach') {
      return {
        stepTag: 'PHASE 2 · BREACH',
        instruction: lang === 'zh-Hant' ? '追蹤 = 賦值並破解兩道鎖' : 'Trace = assignments to crack locks',
        onOpenGuide: openGuide,
      };
    }
    if (phase === 'battle') {
      if (encounter === 'swap') {
        return {
          stepTag: 'WARM-UP · 1 / 2',
          instruction: lang === 'zh-Hant' ? '用 int temp 交換兩頻道後按 DEPLOY' : 'Swap left & right with temp, then DEPLOY',
          onOpenGuide: openGuide,
        };
      }
      return {
        stepTag: 'BOSS · 2 / 2',
        instruction: lang === 'zh-Hant' ? '備份 initialRemaining、更新重算並印三行' : 'Snapshot initialRemaining, update, print 3 lines',
        onOpenGuide: openGuide,
      };
    }
    return undefined;
  }, [phase, calibrated, adjustingSliders, encounter, lang]);

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
        badge: lang === 'zh-Hant' ? '防火牆突破' : 'PHASE 2 CLEARED',
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
    if (popup === 'warmup-clear') {
      return {
        open: true,
        variant: 'clear' as const,
        badge: lang === 'zh-Hant' ? '暖身通關' : 'WARM-UP CLEARED',
        title: t(brief.battle.warmupClearTitle ?? { en: 'Warm-Up Cleared!', zh: '暖身過關！' }, lang),
        subtitle:
          lang === 'zh-Hant'
            ? `已掌握 temp 變數交換！接著切換到 02 ${t(brief.battle.bossName, lang)} 進行最終對決。`
            : `Channel Swap unlocked! Ready to fight ${t(brief.battle.bossName, lang)}.`,
        primaryLabel: lang === 'zh-Hant' ? `迎戰 Boss：${t(brief.battle.bossName, lang)}` : `FIGHT BOSS`,
        secondaryLabel: lang === 'zh-Hant' ? '留在此頁' : 'Stay here',
        onPrimary: () => {
          setPopup(null);
          setEncounter('reactor');
          setBattleResult(null);
          setExpandedWave(null);
          setTraceFrames([]);
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
          {!calibrated || adjustingSliders ? (
            <>
              <div className="deck-two-col">
                <label className="control-tile">
                  <div className="deck-row-between">
                    <span className="mono" style={{ fontSize: 12, color: 'var(--cyan)' }}>
                      Supply (target 120) {energy === 120 ? '✓' : ''}
                    </span>
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
                    <span className="mono" style={{ fontSize: 12, color: 'var(--amber)' }}>
                      Usage (target 45) {used === 45 ? '✓' : ''}
                    </span>
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

              <div className="deck-hint mono" style={{ textAlign: 'right' }}>
                {lang === 'zh-Hant' ? '快捷鍵：A/D 與 W/S' : 'Keys: A/D · W/S'}
              </div>
            </>
          ) : (
            <>
              <div className="step-done-pill">
                <span className="mono">
                  ✓ Supply 120 · Usage 45 · Memory stuck at {stored}
                </span>
                <button
                  type="button"
                  className="step-adjust-btn"
                  onClick={() => {
                    sound.click();
                    setAdjustingSliders(true);
                  }}
                >
                  {lang === 'zh-Hant' ? '調整' : 'Adjust'}
                </button>
              </div>

              <label className="deck-field">
                <span className="deck-field-label mono">
                  {lang === 'zh-Hant'
                    ? '預測執行 remaining = energy - used; 後的值：'
                    : 'Predict remaining after assignment (120 - 45):'}
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
                  className="tac-btn primary deck-primary-cta"
                  onClick={handleReconExecute}
                >
                  <Zap size={15} />
                  <span>EXECUTE: remaining = energy - used;</span>
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
          locks={CH01_LOCKS}
          solvedLocks={solvedLocks}
          lang={lang}
          onMistake={() => {
            onUpdateProgress((p) => ({ ...p, breachMistakes: p.breachMistakes + 1 }));
            setFeedbackBar({
              mood: 'danger',
              text: lang === 'zh-Hant' ? '陷阱！改動舊變數不會讓已存的快照重算。' : 'Watch out—old snapshots do not auto-recalculate.',
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
              onCutIn({ tag: 'FIREWALL', title: 'ALL LOCKS CRACKED', tone: 'lime' });
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
                setFeedbackBar(null);
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
                setFeedbackBar(null);
              }}
            >
              {reactorCleared && <Check size={12} strokeWidth={2.5} />}
              <span>02 Overload Core</span>
            </button>
          </div>

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
