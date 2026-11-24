import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Flame, Scissors, ShieldAlert, Zap } from 'lucide-react';
import { sound } from '../../engine/audio/synth';
import { Lang, t, UI_COPY } from '../../engine/i18n/text';
import { runStatements, TraceFrame } from '../../engine/vm';
import { CAMPAIGN_CHAPTERS } from '../../game/campaignData';
import {
  CH03_INITIALS_STARTER,
  CH03_LOCKS,
  CH03_ROUTE_STARTER,
  Ch03EncounterResult,
  Ch03TrialResult,
  evaluateInitialsEncounter,
  evaluateRouteEncounter,
} from '../../game/chapters/ch03Archive';
import { MISSION_BRIEFINGS } from '../../game/missionBriefings';
import { ChapterProgress, computeRank } from '../../game/store';
import { PhaseId } from '../../game/types';
import { BreachPanel } from '../BreachPanel';
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MissionPopup } from '../MissionPopup';
import { MissionStageLayout, ReactiveFeedbackInfo } from '../MissionStageLayout';
import { ArchiveCanvas } from '../stages/ArchiveCanvas';

export interface Ch03MissionProps {
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
  chaosRouteTrigger?: { route: string; seq: number } | null;
}

type PopupKind = null | 'briefing' | 'recon-clear' | 'breach-clear' | 'warmup-clear' | 'boss-clear';

export const Ch03Mission: React.FC<Ch03MissionProps> = ({
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
  chaosRouteTrigger,
}) => {
  const meta = CAMPAIGN_CHAPTERS.find((c) => c.id === 3)!;
  const brief = MISSION_BRIEFINGS[3];

  // Phase 1: Recon Optical Slicer on "DRONE"
  const [beginIdx, setBeginIdx] = useState(progress.reconDone ? 1 : 0);
  const [endIdx, setEndIdx] = useState(progress.reconDone ? 4 : 3);
  const [adjustingSlice, setAdjustingSlice] = useState(false);
  const [slicedText, setSlicedText] = useState(progress.reconDone ? 'RON' : 'DRO');
  const [slicedOk, setSlicedOk] = useState(progress.reconDone);
  const [oobSeen, setOobSeen] = useState(progress.reconDone);
  const [immutableSeen, setImmutableSeen] = useState(progress.reconDone);
  const [reconStatus, setReconStatus] = useState<'idle' | 'ok' | 'error'>(progress.reconDone ? 'ok' : 'idle');
  const [reconFeedback, setReconFeedback] = useState('');
  const [pulseKey, setPulseKey] = useState(0);

  // Phase 2: Breach
  const [solvedLocks, setSolvedLocks] = useState<boolean[]>(
    progress.breachCleared ? [true, true, true] : [false, false, false],
  );

  // Phase 3: Battle
  const [encounter, setEncounter] = useState<'initials' | 'route'>('initials');
  const initialsCode = progress.codeDrafts.initials ?? CH03_INITIALS_STARTER;
  const routeCode = progress.codeDrafts.route ?? CH03_ROUTE_STARTER;
  const [battleResult, setBattleResult] = useState<Ch03EncounterResult | null>(null);
  const [inspectedTrial, setInspectedTrial] = useState<Ch03TrialResult | null>(null);
  const [chaosNote, setChaosNote] = useState<string | null>(null);

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
    if (chaosRouteTrigger) {
      suppressNextBriefRef.current = true;
      setPopup(null);
      setEncounter('route');
      onPhaseChange('battle');
      const res = evaluateRouteEncounter(routeCode, chaosRouteTrigger.route);
      const tr = res.trials[0];
      setBattleResult(res);
      setInspectedTrial(tr);
      setTraceFrames(tr.run.frames);
      setStepIdx(0);
      setAutoPlaySeq((s) => s + 1);
      setPulseKey((k) => k + 1);
      if (res.passed) {
        sound.shieldBreak();
        setChaosNote(`GM Chaos routeSuffix("${chaosRouteTrigger.route}") → "${tr.actual}" ✓`);
        setFeedbackBar(null);
        onCutIn({ tag: 'GM CHAOS', title: `EXTRACTED "${tr.actual}"`, tone: 'lime' });
      } else {
        sound.hitError();
        setChaosNote(`GM Chaos "${chaosRouteTrigger.route}" FAILED (got "${tr.actual}", need "${tr.expected}")`);
        setFeedbackBar({ mood: 'danger', text: `Expected "${tr.expected}", got "${tr.actual}".` });
        onCutIn({ tag: 'GM CHAOS', title: 'SLICER MISMATCH!', tone: 'danger' });
      }
    }
  }, [chaosRouteTrigger]);

  const markReconIfReady = (sOk: boolean, oob: boolean, imm: boolean) => {
    if (sOk && (oob || imm)) {
      onUpdateProgress((p) => ({
        ...p,
        reconDone: true,
        completedPhases: p.completedPhases.includes('recon') ? p.completedPhases : [...p.completedPhases, 'recon'],
      }));
      setPopup('recon-clear');
    }
  };

  const handleFireSlice = () => {
    setPulseKey((k) => k + 1);
    const run = runStatements(`String s = "DRONE";\nString slice = s.substring(${beginIdx}, ${endIdx});\nSystem.out.println(slice);`);
    setTraceFrames(run.frames);
    setStepIdx(0);
    setAutoPlaySeq((s) => s + 1);
    if (!run.ok) {
      sound.hitError();
      setReconStatus('error');
      setSlicedText('OOB ERROR');
      setOobSeen(true);
      const errText = run.error?.message ?? 'StringIndexOutOfBoundsException';
      setReconFeedback(errText);
      setFeedbackBar({ mood: 'danger', text: errText });
      markReconIfReady(slicedOk, true, immutableSeen);
      return;
    }
    const out = run.stdout.trim();
    setSlicedText(out);
    if (out === 'RON') {
      sound.breachSuccess();
      setReconStatus('ok');
      setSlicedOk(true);
      setAdjustingSlice(false);
      setReconFeedback('');
      setFeedbackBar(null);
      markReconIfReady(true, oobSeen, immutableSeen);
    } else {
      sound.click();
      setReconStatus('idle');
      const hint = `s.substring(${beginIdx}, ${endIdx}) → "${out}". Target is "RON".`;
      setReconFeedback(hint);
      setFeedbackBar({ mood: 'alert', text: hint });
    }
  };

  const handleTestOob = () => {
    const run = runStatements(`String s = "DRONE";\nString bad = s.substring(1, 7);`);
    setTraceFrames(run.frames);
    setStepIdx(0);
    setAutoPlaySeq((s) => s + 1);
    setPulseKey((k) => k + 1);
    sound.hitError();
    setOobSeen(true);
    setReconStatus('error');
    setSlicedText('StringIndexOutOfBounds!');
    const msg =
      lang === 'zh-Hant'
        ? 'end=7 超過長度 5，立刻觸發 StringIndexOutOfBoundsException！'
        : 'end=7 exceeds length 5, throwing StringIndexOutOfBoundsException!';
    setReconFeedback(run.error?.message ?? 'StringIndexOutOfBoundsException');
    setFeedbackBar({ mood: 'danger', text: msg });
    markReconIfReady(slicedOk, true, immutableSeen);
  };

  const handleTestImmutable = () => {
    const run = runStatements(`String s = "DRONE";\ns.substring(0, 3);\nSystem.out.println(s);`);
    setTraceFrames(run.frames);
    setStepIdx(0);
    setAutoPlaySeq((s) => s + 1);
    setPulseKey((k) => k + 1);
    sound.click();
    setImmutableSeen(true);
    setReconStatus('ok');
    setSlicedText('s stays "DRONE"');
    const msg =
      lang === 'zh-Hant'
        ? 's.substring(0, 3); 沒存回變數，s 依然維持 "DRONE"！'
        : 's.substring(0, 3); discarded its result, so s remains "DRONE".';
    setReconFeedback(msg);
    setFeedbackBar({ mood: 'success', text: msg });
    markReconIfReady(slicedOk, oobSeen, true);
  };

  const handleDeployBattle = () => {
    setChaosNote(null);
    sound.deploy();
    const res =
      encounter === 'initials'
        ? evaluateInitialsEncounter(initialsCode)
        : evaluateRouteEncounter(routeCode);
    const focusTrial = res.failedTrial ?? res.trials[res.trials.length - 1];
    setBattleResult(res);
    setInspectedTrial(focusTrial ?? null);
    if (focusTrial) {
      setTraceFrames(focusTrial.run.frames);
      setStepIdx(0);
      setAutoPlaySeq((s) => s + 1);
    }
    setPulseKey((k) => k + 1);

    if (!res.passed) {
      sound.hitError();
      onUpdateProgress((p) => ({ ...p, battleMistakes: p.battleMistakes + 1 }));
      onCutIn({
        tag: `WAVE ${res.wavesCleared + 1} FAIL`,
        title: focusTrial?.run.error ? 'STRING BOUNDARY FAULT' : 'ARCHIVE MISMATCH',
        tone: 'danger',
      });
      setFeedbackBar({
        mood: 'danger',
        text: focusTrial?.run.error
          ? `Line ${focusTrial.run.error.line}: ${focusTrial.run.error.message}`
          : `Expected "${focusTrial?.expected}", got "${focusTrial?.actual}".`,
      });
      return;
    }

    sound.shieldBreak();
    setFeedbackBar(null);
    const nextCleared = { ...progress.encounterCleared, [encounter]: true };
    const both = Boolean(nextCleared.initials && nextCleared.route);
    if (both) {
      const rank = computeRank(progress.breachMistakes, progress.battleMistakes);
      sound.missionClear();
      onUnlockChip(meta.chipId);
      onCutIn({ tag: 'SEC-03 RESTORED', title: `ARCHIVIST DEFEATED // ${rank}-RANK`, tone: 'lime' });
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
        title: encounter === 'initials' ? 'INITIALS SLICER VERIFIED!' : 'ROUTE EXTRACTOR CLEARED!',
        tone: 'cyan',
      });
      if (encounter === 'initials') {
        setPopup('warmup-clear');
      }
    }
  };

  const currentFrame = traceFrames[stepIdx] ?? null;
  const initialsCleared = Boolean(progress.encounterCleared.initials);
  const routeCleared = Boolean(progress.encounterCleared.route);
  const battleComplete = initialsCleared && routeCleared;
  const stdoutShown = useMemo(
    () => (currentFrame ? currentFrame.stdout : inspectedTrial?.run.stdout ?? ''),
    [currentFrame, inspectedTrial],
  );

  const tapeText =
    phase === 'recon'
      ? 'DRONE'
      : encounter === 'route' && inspectedTrial
        ? inspectedTrial.label
        : 'west-42';

  const brokenShields =
    encounter === 'route' && battleResult
      ? battleResult.totalWaves === 1
        ? progress.rank ? 3 : 0
        : battleResult.wavesCleared
      : encounter === 'route' && progress.rank ? 3 : 0;

  const stepBanner = useMemo(() => {
    const openGuide = () => setPopup('briefing');
    if (phase === 'recon') {
      if (!slicedOk || adjustingSlice) {
        return {
          stepTag: 'STEP 1 / 2',
          instruction: lang === 'zh-Hant' ? '調整拉桿從 "DRONE" 切出 "RON"' : 'Set begin/end sliders to slice "RON"',
          onOpenGuide: openGuide,
        };
      }
      return {
        stepTag: 'STEP 2 / 2',
        instruction: lang === 'zh-Hant' ? '點選一個字串陷阱進行實測' : 'Trigger 1 String trap below',
        onOpenGuide: openGuide,
      };
    }
    if (phase === 'breach') {
      return {
        stepTag: 'PHASE 2 · BREACH',
        instruction: lang === 'zh-Hant' ? '解開三道字串與 Math API 鎖' : 'Crack 3 String & Math API locks',
        onOpenGuide: openGuide,
      };
    }
    if (phase === 'battle') {
      if (encounter === 'initials') {
        return {
          stepTag: 'WARM-UP · 1 / 2',
          instruction: lang === 'zh-Hant' ? '取出兩字首字母並大寫輸出' : 'Return initials of both names (e.g. "MB")',
          onOpenGuide: openGuide,
        };
      }
      return {
        stepTag: 'BOSS · 2 / 2',
        instruction: lang === 'zh-Hant' ? '用 indexOf("-") 抽出 "-" 後方的路線代碼' : 'Extract everything after "-" safely',
        onOpenGuide: openGuide,
      };
    }
    return undefined;
  }, [phase, slicedOk, adjustingSlice, encounter, lang]);

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
        badge: lang === 'zh-Hant' ? '檔案館解鎖' : 'PHASE 2 CLEARED',
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
        title: t(brief.battle.warmupClearTitle ?? { en: 'Slicer Cleared!', zh: '首字母切片過關！' }, lang),
        subtitle:
          lang === 'zh-Hant'
            ? `已通過 Initials Slicer！接著迎戰 02 ${t(brief.battle.bossName, lang)}。`
            : `Initials Slicer cleared! Ready to fight ${t(brief.battle.bossName, lang)}.`,
        primaryLabel: lang === 'zh-Hant' ? `迎戰 Boss：${t(brief.battle.bossName, lang)}` : 'FIGHT BOSS',
        secondaryLabel: lang === 'zh-Hant' ? '留在此頁' : 'Stay here',
        onPrimary: () => {
          setPopup(null);
          setEncounter('route');
          setBattleResult(null);
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
        <ArchiveCanvas
          mode={phase === 'recon' ? 'recon' : 'battle'}
          tapeText={tapeText}
          beginIdx={beginIdx}
          endIdx={endIdx}
          slicedResult={phase === 'recon' ? slicedText : inspectedTrial?.actual ?? ''}
          activeFrame={currentFrame}
          bossShields={3}
          brokenShields={brokenShields}
          status={phase === 'recon' ? reconStatus : battleResult ? (battleResult.passed ? 'ok' : 'error') : 'idle'}
          pulseKey={pulseKey}
        />
      }
      bossHud={
        phase === 'battle' && encounter === 'route'
          ? { name: 'IMMUTABLE ARCHIVIST', shields: 3, broken: brokenShields }
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
          {!slicedOk || adjustingSlice ? (
            <>
              <div className="deck-two-col">
                <label className="control-tile">
                  <div className="deck-row-between">
                    <span className="mono" style={{ fontSize: 12, color: 'var(--cyan)' }}>begin</span>
                    <strong className="mono">{beginIdx}</strong>
                  </div>
                  <input type="range" min={0} max={5} value={beginIdx} onChange={(e) => setBeginIdx(Number(e.target.value))} style={{ accentColor: 'var(--cyan)' }} />
                </label>
                <label className="control-tile">
                  <div className="deck-row-between">
                    <span className="mono" style={{ fontSize: 12, color: 'var(--amber)' }}>end</span>
                    <strong className="mono">{endIdx}</strong>
                  </div>
                  <input type="range" min={0} max={5} value={endIdx} onChange={(e) => setEndIdx(Number(e.target.value))} style={{ accentColor: 'var(--amber)' }} />
                </label>
              </div>

              {reconFeedback && (
                <div className={`deck-feedback ${reconStatus === 'error' ? 'err' : 'ok'}`}>
                  {reconFeedback}
                </div>
              )}

              <div className="deck-actions">
                <button
                  type="button"
                  className="tac-btn primary deck-primary-cta"
                  onClick={handleFireSlice}
                >
                  <Scissors size={14} />
                  <span>FIRE LASER: s.substring({beginIdx}, {endIdx})</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="step-done-pill">
                <span className="mono">✓ &quot;RON&quot; sliced with substring(1, 4)</span>
                <button
                  type="button"
                  className="step-adjust-btn"
                  onClick={() => {
                    sound.click();
                    setAdjustingSlice(true);
                  }}
                >
                  {lang === 'zh-Hant' ? '重切' : 'Adjust'}
                </button>
              </div>

              <div className="deck-two-col">
                <button type="button" className="tac-btn crimson deck-primary-cta" onClick={handleTestOob}>
                  <AlertTriangle size={14} />
                  <span>{oobSeen ? '✓ ' : ''}{lang === 'zh-Hant' ? '實測越界 OOB (1, 7)' : 'Test OOB (1, 7)'}</span>
                </button>
                <button type="button" className="tac-btn amber deck-primary-cta" onClick={handleTestImmutable}>
                  <span>{immutableSeen ? '✓ ' : ''}{lang === 'zh-Hant' ? '實測字串不可變' : 'Test Immutability'}</span>
                </button>
              </div>

              {reconFeedback && (
                <div className={`deck-feedback ${reconStatus === 'error' ? 'err' : 'ok'}`}>
                  {reconFeedback}
                </div>
              )}
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
          locks={CH03_LOCKS}
          solvedLocks={solvedLocks}
          lang={lang}
          onMistake={() => {
            onUpdateProgress((p) => ({ ...p, breachMistakes: p.breachMistakes + 1 }));
            setFeedbackBar({
              mood: 'danger',
              text: lang === 'zh-Hant' ? '注意索引從 0 開始且 substring 不含終點索引！' : 'Check 0-based index bounds and String immutability!',
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
              onCutIn({ tag: 'ARCHIVE UNLOCKED', title: 'STRING LOCKS CLEARED', tone: 'lime' });
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
              aria-selected={encounter === 'initials'}
              className={`encounter-tab ${encounter === 'initials' ? 'active' : ''} ${initialsCleared ? 'cleared' : ''}`}
              onClick={() => {
                sound.click();
                setEncounter('initials');
                setBattleResult(null);
                setTraceFrames([]);
                setChaosNote(null);
                setFeedbackBar(null);
              }}
            >
              {initialsCleared && <Check size={12} strokeWidth={2.5} />}
              <span>01 Initials Slicer</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={encounter === 'route'}
              className={`encounter-tab ${encounter === 'route' ? 'active' : ''} ${routeCleared ? 'cleared' : ''}`}
              onClick={() => {
                sound.click();
                setEncounter('route');
                setBattleResult(null);
                setTraceFrames([]);
                setChaosNote(null);
                setFeedbackBar(null);
              }}
            >
              {routeCleared && <Check size={12} strokeWidth={2.5} />}
              <span>02 Route Extractor</span>
            </button>
          </div>

          <CodeTerminal
            value={encounter === 'initials' ? initialsCode : routeCode}
            starterCode={encounter === 'initials' ? CH03_INITIALS_STARTER : CH03_ROUTE_STARTER}
            activeLine={currentFrame?.line ?? null}
            lang={lang}
            onChange={(next) => onUpdateProgress((p) => ({ ...p, codeDrafts: { ...p.codeDrafts, [encounter]: next } }))}
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
              {battleResult.failedTrial?.run.error && (
                <div className="wave-err-line mono" style={{ marginBottom: 6 }}>
                  <ShieldAlert size={12} />
                  <span>Line {battleResult.failedTrial.run.error.line}: {battleResult.failedTrial.run.error.message}</span>
                </div>
              )}
              <div className="wave-pills">
                {battleResult.trials.map((tr, i) => {
                  const isSel = inspectedTrial === tr;
                  return (
                    <button
                      key={i}
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
                      <span>W{tr.waveIndex + 1} · {tr.label}</span>
                      <span>{tr.passed ? `✓ "${tr.actual}"` : `✕ "${tr.actual}"`}</span>
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
                {lang === 'zh-Hant' ? '訊號檔案館全數復原' : 'Signal Archive Restored'}
              </h2>
            </div>
          </div>

          <p className="deck-copy">
            {lang === 'zh-Hant'
              ? 'Act I 全數完成！你已掌握 String 不可變性與 indexOf/substring 切片。'
              : 'Act I complete! You mastered String immutability and indexOf/substring slicing.'}
          </p>

          <div className="deck-actions">
            <button
              type="button"
              className="tac-btn primary deck-primary-cta"
              onClick={() => {
                sound.deploy();
                onOpenChapter(4);
              }}
            >
              <span>{lang === 'zh-Hant' ? '下一章 Act II：Ch.04 空域閘門' : 'NEXT: CH.04 SKY-GATE'}</span>
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
