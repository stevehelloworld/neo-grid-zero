import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Flame, ShieldAlert, SlidersHorizontal, Zap } from 'lucide-react';
import { sound } from '../../engine/audio/synth';
import { Lang, t, UI_COPY } from '../../engine/i18n/text';
import { TraceFrame } from '../../engine/vm';
import { CAMPAIGN_CHAPTERS } from '../../game/campaignData';
import {
  CH02_LOCKS,
  CH02_SPLITTER_STARTER,
  CH02_TITAN_STARTER,
  Ch02EncounterResult,
  evaluateSplitterEncounter,
  evaluateTitanEncounter,
  MarketChaosWave,
} from '../../game/chapters/ch02Market';
import { MISSION_BRIEFINGS } from '../../game/missionBriefings';
import { ChapterProgress, computeRank } from '../../game/store';
import { PhaseId } from '../../game/types';
import { BreachPanel } from '../BreachPanel';
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MissionPopup } from '../MissionPopup';
import { MissionStageLayout, ReactiveFeedbackInfo } from '../MissionStageLayout';
import { MarketCanvas } from '../stages/MarketCanvas';

export interface Ch02MissionProps {
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
  chaosWaveTrigger?: { wave: MarketChaosWave; seq: number } | null;
}

type PopupKind = null | 'briefing' | 'recon-clear' | 'breach-clear' | 'warmup-clear' | 'boss-clear';

export const Ch02Mission: React.FC<Ch02MissionProps> = ({
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
  const meta = CAMPAIGN_CHAPTERS.find((c) => c.id === 2)!;
  const brief = MISSION_BRIEFINGS[2];

  // Phase 1: Recon state
  const [units, setUnits] = useState(17);
  const [squads, setSquads] = useState(5);
  const [customNumsOpen, setCustomNumsOpen] = useState(false);
  const [shareGuess, setShareGuess] = useState(progress.reconDone ? '3' : '');
  const [leftGuess, setLeftGuess] = useState(progress.reconDone ? '2' : '');
  const [exactGuess, setExactGuess] = useState(progress.reconDone ? '3.4' : '');
  const [distributed, setDistributed] = useState(progress.reconDone);
  const [reconStatus, setReconStatus] = useState<'idle' | 'ok' | 'error'>(
    progress.reconDone ? 'ok' : 'idle',
  );
  const [reconMsg, setReconMsg] = useState('');
  const [pulseKey, setPulseKey] = useState(0);

  // Phase 2: Breach locks
  const [solvedLocks, setSolvedLocks] = useState<boolean[]>(
    progress.breachCleared ? [true, true, true] : [false, false, false],
  );

  // Phase 3: Battle
  const [encounter, setEncounter] = useState<'splitter' | 'titan'>('splitter');
  const splitterCode = progress.codeDrafts.splitter ?? CH02_SPLITTER_STARTER;
  const titanCode = progress.codeDrafts.titan ?? CH02_TITAN_STARTER;
  const [battleResult, setBattleResult] = useState<Ch02EncounterResult | null>(null);
  const [expandedWave, setExpandedWave] = useState<number | null>(null);
  const [chaosNote, setChaosNote] = useState<string | null>(null);

  // Trace & Feedback
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

  useEffect(() => {
    if (!chaosWaveTrigger) return;
    suppressNextBriefRef.current = true;
    setPopup(null);
    setEncounter('titan');
    onPhaseChange('battle');
    const res = evaluateTitanEncounter(titanCode, chaosWaveTrigger.wave);
    setBattleResult(res);
    setExpandedWave(res.passed ? null : 0);
    setTraceFrames(res.primaryRun.frames);
    setStepIdx(0);
    setAutoPlaySeq((s) => s + 1);
    setPulseKey((k) => k + 1);
    if (res.passed) {
      sound.shieldBreak();
      setChaosNote(
        `GM Chaos (${chaosWaveTrigger.wave.subtotalCents}¢ / ${chaosWaveTrigger.wave.crewSize} crew) PASSED`,
      );
      setFeedbackBar(null);
      onCutIn({ tag: 'GM CHAOS', title: 'CHAOS ORDER CLEARED!', tone: 'lime' });
    } else {
      sound.hitError();
      setChaosNote('GM Chaos failed. Inspect the wave check below.');
      setFeedbackBar({ mood: 'danger', text: 'GM Chaos order mismatched!' });
      onCutIn({ tag: 'GM CHAOS', title: 'LEDGER MISMATCH!', tone: 'danger' });
    }
  }, [chaosWaveTrigger]);

  const handleReconDispatch = () => {
    const expPer = Math.floor(units / squads);
    const expLeft = units % squads;
    const expExact = units / squads;
    const ok =
      Number(shareGuess) === expPer &&
      Number(leftGuess) === expLeft &&
      Math.abs(Number(exactGuess) - expExact) < 0.02 &&
      exactGuess.trim() !== '';

    setPulseKey((k) => k + 1);
    if (!ok) {
      sound.hitError();
      setReconStatus('error');
      const msg =
        lang === 'zh-Hant'
          ? `再檢查：${units} / ${squads} 整數商為 ${expPer}、餘數 ${expLeft}、小數 ${expExact.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}。`
          : `Check again: ${units} / ${squads} = ${expPer}, ${units} % ${squads} = ${expLeft}, exact = ${expExact.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}.`;
      setReconMsg(msg);
      setFeedbackBar({ mood: 'danger', text: msg });
      return;
    }

    sound.shieldBreak();
    setDistributed(true);
    setReconStatus('ok');
    setReconMsg('');
    setFeedbackBar(null);
    onUpdateProgress((p) => ({
      ...p,
      reconDone: true,
      completedPhases: p.completedPhases.includes('recon') ? p.completedPhases : [...p.completedPhases, 'recon'],
    }));
    setPopup('recon-clear');
  };

  const handleDeployBattle = () => {
    setChaosNote(null);
    sound.deploy();
    const res =
      encounter === 'splitter'
        ? evaluateSplitterEncounter(splitterCode)
        : evaluateTitanEncounter(titanCode);

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
        title: res.primaryRun.error ? 'SYNTAX FAULT' : 'PRECISION MISMATCH',
        tone: 'danger',
      });
      setFeedbackBar({
        mood: 'danger',
        text: res.primaryRun.error
          ? `Line ${res.primaryRun.error.line}: ${res.primaryRun.error.message}`
          : lang === 'zh-Hant'
            ? `第 ${res.wavesCleared + 1} 波失敗！確認 (double) 轉型或 += 寫法。`
            : `Wave ${res.wavesCleared + 1} failed! Check (double) casting and scrub the trace.`,
      });
      return;
    }

    sound.shieldBreak();
    setFeedbackBar(null);
    const nextCleared = { ...progress.encounterCleared, [encounter]: true };
    const bothCleared = Boolean(nextCleared.splitter && nextCleared.titan);

    if (bothCleared) {
      const rank = computeRank(progress.breachMistakes, progress.battleMistakes);
      sound.missionClear();
      onUnlockChip(meta.chipId);
      onCutIn({ tag: 'SEC-02 RESTORED', title: `TRUNCATION TITAN DEFEATED // ${rank}-RANK`, tone: 'lime' });
      onUpdateProgress((p) => ({
        ...p,
        rank,
        encounterCleared: nextCleared,
        completedPhases: p.completedPhases.includes('battle') ? p.completedPhases : [...p.completedPhases, 'battle'],
      }));
      setPopup('boss-clear');
    } else {
      onUpdateProgress((p) => ({ ...p, encounterCleared: nextCleared }));
      onCutIn({
        tag: 'STAGE CLEAR',
        title: encounter === 'splitter' ? 'CARGO SPLITTER VERIFIED!' : 'TITAN SHIELDS SHATTERED!',
        tone: 'cyan',
      });
      if (encounter === 'splitter') {
        setPopup('warmup-clear');
      }
    }
  };

  const currentFrame = traceFrames[stepIdx] ?? null;
  const splitterCleared = Boolean(progress.encounterCleared.splitter);
  const titanCleared = Boolean(progress.encounterCleared.titan);
  const battleComplete = splitterCleared && titanCleared;

  const brokenShields =
    encounter === 'titan' && battleResult
      ? battleResult.totalWaves === 1
        ? progress.rank ? 3 : 0
        : battleResult.wavesCleared
      : encounter === 'titan' && progress.rank ? 3 : 0;

  const stdoutShown = useMemo(
    () => (currentFrame ? currentFrame.stdout : battleResult?.primaryRun.stdout ?? ''),
    [currentFrame, battleResult],
  );

  const activeWaveDetail =
    battleResult && expandedWave !== null
      ? battleResult.waveDetails[expandedWave] ?? null
      : null;

  const stepBanner = useMemo(() => {
    const openGuide = () => setPopup('briefing');
    if (phase === 'recon') {
      return {
        stepTag: 'STEP 1 / 1',
        instruction:
          lang === 'zh-Hant'
            ? `預測 ${units} ÷ ${squads} 的整數商、餘數與精確小數`
            : `Predict /, %, and exact decimal for ${units} ÷ ${squads}`,
        onOpenGuide: openGuide,
      };
    }
    if (phase === 'breach') {
      return {
        stepTag: 'PHASE 2 · BREACH',
        instruction: lang === 'zh-Hant' ? '破解三道夜市運算與轉型鎖' : 'Crack 3 market precedence & cast locks',
        onOpenGuide: openGuide,
      };
    }
    if (phase === 'battle') {
      if (encounter === 'splitter') {
        return {
          stepTag: 'WARM-UP · 1 / 2',
          instruction: lang === 'zh-Hant' ? '用 /、% 與 (double) 計算並印出 3 行' : 'Print perSquad (/), leftovers (%), and exact (double)',
          onOpenGuide: openGuide,
        };
      }
      return {
        stepTag: 'BOSS · 2 / 2',
        instruction: lang === 'zh-Hant' ? '加上手續費並轉型 (double) 避免分帳截斷' : 'Apply compound ops & cast before dividing to defeat Boss',
        onOpenGuide: openGuide,
      };
    }
    return undefined;
  }, [phase, units, squads, encounter, lang]);

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
        badge: lang === 'zh-Hant' ? '帳本解鎖' : 'PHASE 2 CLEARED',
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
        title: t(brief.battle.warmupClearTitle ?? { en: 'Splitter Cleared!', zh: '分配器過關！' }, lang),
        subtitle:
          lang === 'zh-Hant'
            ? `已通過 Cargo Splitter！準備挑戰 02 ${t(brief.battle.bossName, lang)}。`
            : `Cargo Splitter cleared! Ready to fight ${t(brief.battle.bossName, lang)}.`,
        primaryLabel: lang === 'zh-Hant' ? `迎戰 Boss：${t(brief.battle.bossName, lang)}` : 'FIGHT BOSS',
        secondaryLabel: lang === 'zh-Hant' ? '留在此頁' : 'Stay here',
        onPrimary: () => {
          setPopup(null);
          setEncounter('titan');
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
        <MarketCanvas
          mode={phase === 'recon' ? 'recon' : phase === 'breach' ? 'trace' : encounter === 'splitter' ? 'splitter' : 'titan'}
          units={units}
          squads={squads}
          distributed={distributed}
          activeFrame={currentFrame}
          bossShields={3}
          brokenShields={brokenShields}
          status={phase === 'recon' ? reconStatus : battleResult ? (battleResult.passed ? 'ok' : 'error') : 'idle'}
          pulseKey={pulseKey}
        />
      }
      bossHud={
        phase === 'battle' && encounter === 'titan'
          ? { name: 'TRUNCATION TITAN', shields: 3, broken: brokenShields }
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
          <div className="step-done-pill" style={{ borderColor: 'var(--border-subtle)', background: 'rgba(6, 11, 18, 0.72)', color: 'var(--ink-primary)' }}>
            <span className="mono">
              {units} crates ÷ {squads} squads
            </span>
            <button
              type="button"
              className="step-adjust-btn"
              onClick={() => {
                sound.click();
                setCustomNumsOpen((o) => !o);
              }}
            >
              <SlidersHorizontal size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />
              {lang === 'zh-Hant' ? '自訂數字' : 'Custom numbers'}
            </button>
          </div>

          {customNumsOpen && (
            <div className="deck-two-col">
              <div className="control-tile">
                <div className="deck-row-between">
                  <div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--cyan)' }}>CRATES</div>
                    <strong className="mono" style={{ fontSize: 20 }}>{units}</strong>
                  </div>
                  <div className="stepper-btns">
                    <button type="button" className="mini-step-btn" onClick={() => { setUnits((u) => Math.max(6, u - 1)); setDistributed(false); }}>−</button>
                    <button type="button" className="mini-step-btn" onClick={() => { setUnits((u) => Math.min(30, u + 1)); setDistributed(false); }}>+</button>
                  </div>
                </div>
              </div>

              <div className="control-tile">
                <div className="deck-row-between">
                  <div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--amber)' }}>SQUADS</div>
                    <strong className="mono" style={{ fontSize: 20 }}>{squads}</strong>
                  </div>
                  <div className="stepper-btns">
                    <button type="button" className="mini-step-btn" onClick={() => { setSquads((s) => Math.max(2, s - 1)); setDistributed(false); }}>−</button>
                    <button type="button" className="mini-step-btn" onClick={() => { setSquads((s) => Math.min(6, s + 1)); setDistributed(false); }}>+</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="deck-three-col">
            <label className="deck-field">
              <span className="deck-field-label mono" style={{ color: 'var(--cyan)' }}>perSquad (/)</span>
              <input type="number" className="deck-input mono" value={shareGuess} placeholder="?" onChange={(e) => setShareGuess(e.target.value)} />
            </label>
            <label className="deck-field">
              <span className="deck-field-label mono" style={{ color: 'var(--amber)' }}>leftovers (%)</span>
              <input type="number" className="deck-input mono" value={leftGuess} placeholder="?" onChange={(e) => setLeftGuess(e.target.value)} />
            </label>
            <label className="deck-field">
              <span className="deck-field-label mono" style={{ color: 'var(--lime)' }}>exact (double)</span>
              <input type="number" step="0.01" className="deck-input mono" value={exactGuess} placeholder="?" onChange={(e) => setExactGuess(e.target.value)} />
            </label>
          </div>

          {reconMsg && (
            <div className={`deck-feedback ${reconStatus === 'ok' ? 'ok' : 'err'}`}>
              {reconMsg}
            </div>
          )}

          <div className="deck-actions">
            <button
              type="button"
              className="tac-btn primary deck-primary-cta"
              onClick={handleReconDispatch}
            >
              <Zap size={15} />
              <span>{lang === 'zh-Hant' ? '鎖定預測並分配貨物' : 'DISPATCH CARGO'}</span>
            </button>
          </div>

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
          locks={CH02_LOCKS}
          solvedLocks={solvedLocks}
          lang={lang}
          onMistake={() => {
            onUpdateProgress((p) => ({ ...p, breachMistakes: p.breachMistakes + 1 }));
            setFeedbackBar({
              mood: 'danger',
              text: lang === 'zh-Hant' ? '先執行右側 int / int 才會賦值或轉型喔！' : 'Remember: int / int computes BEFORE assignment!',
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
              onCutIn({ tag: 'LEDGER BREACH', title: 'OPERATOR LOCKS CLEARED', tone: 'lime' });
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
          <div className="encounter-tabs" role="tablist" aria-label="Battle encounters">
            <button
              type="button"
              role="tab"
              aria-selected={encounter === 'splitter'}
              className={`encounter-tab ${encounter === 'splitter' ? 'active' : ''} ${splitterCleared ? 'cleared' : ''}`}
              onClick={() => {
                sound.click();
                setEncounter('splitter');
                setBattleResult(null);
                setExpandedWave(null);
                setTraceFrames([]);
                setChaosNote(null);
                setFeedbackBar(null);
              }}
            >
              {splitterCleared && <Check size={12} strokeWidth={2.5} />}
              <span>01 Cargo Splitter</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={encounter === 'titan'}
              className={`encounter-tab ${encounter === 'titan' ? 'active' : ''} ${titanCleared ? 'cleared' : ''}`}
              onClick={() => {
                sound.click();
                setEncounter('titan');
                setBattleResult(null);
                setExpandedWave(null);
                setTraceFrames([]);
                setChaosNote(null);
                setFeedbackBar(null);
              }}
            >
              {titanCleared && <Check size={12} strokeWidth={2.5} />}
              <span>02 Truncation Titan</span>
            </button>
          </div>

          <CodeTerminal
            value={encounter === 'splitter' ? splitterCode : titanCode}
            starterCode={encounter === 'splitter' ? CH02_SPLITTER_STARTER : CH02_TITAN_STARTER}
            activeLine={currentFrame?.line ?? null}
            lang={lang}
            onChange={(next) =>
              onUpdateProgress((p) => ({
                ...p,
                codeDrafts: { ...p.codeDrafts, [encounter]: next },
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
                {lang === 'zh-Hant' ? '夜市計價系統校準完成' : 'Market Ledger Calibrated'}
              </h2>
            </div>
          </div>

          <p className="deck-copy">
            {lang === 'zh-Hant'
              ? '你已掌握 /、% 與 (double) 轉型時機，擊破 Truncation Titan！'
              : 'You mastered /, %, and casting order to defeat Truncation Titan.'}
          </p>

          <div className="deck-actions">
            <button
              type="button"
              className="tac-btn primary deck-primary-cta"
              onClick={() => {
                sound.deploy();
                onOpenChapter(3);
              }}
            >
              <span>{lang === 'zh-Hant' ? '下一關：Ch.03 訊號檔案館' : 'NEXT: CH.03 ARCHIVE'}</span>
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
