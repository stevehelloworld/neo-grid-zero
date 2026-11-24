import React, { useEffect, useMemo, useState } from 'react';
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
import { ChapterProgress, computeRank } from '../../game/store';
import { PhaseId } from '../../game/types';
import { BreachPanel } from '../BreachPanel';
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MissionStageLayout } from '../MissionStageLayout';
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
  chaosRouteTrigger?: { route: string; seq: number } | null;
}

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
  chaosRouteTrigger,
}) => {
  const meta = CAMPAIGN_CHAPTERS.find((c) => c.id === 3)!;

  // Phase 1: Recon Optical Slicer on "DRONE"
  const [beginIdx, setBeginIdx] = useState(progress.reconDone ? 1 : 0);
  const [endIdx, setEndIdx] = useState(progress.reconDone ? 4 : 3);
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

  const [mira, setMira] = useState<{ mood: 'neutral' | 'alert' | 'danger' | 'success'; text: string }>({
    mood: 'alert',
    text:
      lang === 'zh-Hant'
        ? '通訊膠帶受損！調整雷射起訖點從 "DRONE" 切出 "RON"，再測試一次越界或不可變實驗。'
        : 'Archive tape corrupted! Calibrate the slicer to extract "RON", then test OOB or immutability.',
  });

  useEffect(() => {
    if (phase === 'recon') {
      setMira({
        mood: progress.reconDone ? 'success' : 'alert',
        text:
          lang === 'zh-Hant'
            ? '從 "DRONE" 切出 "RON"，並測試一次越界錯誤或字串不可變性按鈕！'
            : 'Slice "RON" from "DRONE", then run one OOB or Immutability anomaly test!',
      });
    } else if (phase === 'breach') {
      setMira({
        mood: 'neutral',
        text:
          lang === 'zh-Hant'
            ? 'substring(a, b) 不含終點 b，且 String 永遠不可原地改變。解開三道鎖！'
            : 'substring(a, b) excludes end index b and Strings are immutable. Crack 3 locks!',
      });
    } else if (phase === 'battle') {
      setMira({
        mood: 'alert',
        text:
          lang === 'zh-Hant'
            ? '先過 01 Initials Slicer，再用 indexOf("-") 擊敗 Boss Route Extractor！'
            : 'Clear Initials Slicer first, then use indexOf("-") to defeat Immutable Archivist!',
      });
    } else {
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? 'Act I 全數通關！STRING LASER 晶片已裝備，下一戰進入 Act II！'
            : 'Act I complete! STRING LASER synced. Ready for Act II!',
      });
    }
  }, [phase, lang, progress.reconDone]);

  useEffect(() => {
    if (chaosRouteTrigger) {
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
        onCutIn({ tag: 'GM CHAOS', title: `EXTRACTED "${tr.actual}"`, tone: 'lime' });
      } else {
        sound.hitError();
        setChaosNote(`GM Chaos "${chaosRouteTrigger.route}" FAILED (got "${tr.actual}", need "${tr.expected}")`);
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
      setReconFeedback(run.error?.message ?? 'StringIndexOutOfBoundsException');
      markReconIfReady(slicedOk, true, immutableSeen);
      return;
    }
    const out = run.stdout.trim();
    setSlicedText(out);
    if (out === 'RON') {
      sound.breachSuccess();
      setReconStatus('ok');
      setSlicedOk(true);
      setReconFeedback(
        lang === 'zh-Hant'
          ? '切出 "RON"！substring(1, 4) 取索引 1–3 不含 4。記得也測一次越界或不可變按鈕！'
          : 'Sliced "RON"! substring(1, 4) copies indexes 1–3 and excludes 4.',
      );
      markReconIfReady(true, oobSeen, immutableSeen);
    } else {
      sound.click();
      setReconStatus('idle');
      setReconFeedback(`s.substring(${beginIdx}, ${endIdx}) → "${out}". Target is "RON".`);
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
    setReconFeedback(run.error?.message ?? 'StringIndexOutOfBoundsException');
    markReconIfReady(slicedOk, true, immutableSeen);
    setMira({
      mood: 'danger',
      text:
        lang === 'zh-Hant'
          ? 'end=7 超過長度 5，立刻觸發 StringIndexOutOfBoundsException！'
          : 'end=7 exceeds length 5, throwing StringIndexOutOfBoundsException!',
    });
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
    setReconFeedback(
      lang === 'zh-Hant'
        ? 's.substring(0, 3); 沒存回變數，s 依然維持 "DRONE"！'
        : 's.substring(0, 3); discarded its result, so s remains "DRONE".',
    );
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
      setMira({
        mood: 'danger',
        text: focusTrial?.run.error
          ? `Line ${focusTrial.run.error.line}: ${focusTrial.run.error.message}`
          : `Expected "${focusTrial?.expected}", got "${focusTrial?.actual}".`,
      });
      return;
    }

    sound.shieldBreak();
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
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? `不變檔案官擊破！獲得 ${rank} 級評價與 STRING LASER！`
            : `IMMUTABLE ARCHIVIST neutralized! Earned ${rank}-Rank and STRING LASER.`,
      });
    } else {
      onUpdateProgress((p) => ({ ...p, encounterCleared: nextCleared }));
      onCutIn({
        tag: 'STAGE CLEAR',
        title: encounter === 'initials' ? 'INITIALS SLICER VERIFIED!' : 'ROUTE EXTRACTOR CLEARED!',
        tone: 'cyan',
      });
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
              {lang === 'zh-Hant' ? '從 "DRONE" 切出 "RON"' : 'Slice "RON" from "DRONE"'}
            </h2>
            <span className="deck-hint mono">
              {slicedOk ? '✓ RON' : 'Slice'} · {oobSeen || immutableSeen ? '✓ Bug' : 'Test anomaly'}
            </span>
          </div>

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

          <div className="deck-secondary-row">
            <button type="button" className="tac-btn ghost compact-btn" onClick={handleTestOob}>
              <AlertTriangle size={13} />
              <span>{oobSeen ? '✓ ' : ''}Test OOB (1, 7)</span>
            </button>
            <button type="button" className="tac-btn ghost compact-btn" onClick={handleTestImmutable}>
              <span>{immutableSeen ? '✓ ' : ''}Test Immutable</span>
            </button>
          </div>

          {reconFeedback && (
            <div className={`deck-feedback ${reconStatus === 'error' ? 'err' : 'ok'}`}>
              {reconFeedback}
            </div>
          )}

          <div className="deck-actions">
            <button
              type="button"
              className={`tac-btn ${progress.reconDone ? 'ghost' : 'primary'} deck-primary-cta`}
              onClick={handleFireSlice}
            >
              <Scissors size={14} />
              <span>{slicedOk ? '✓ ' : ''}FIRE: s.substring({beginIdx}, {endIdx})</span>
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
          locks={CH03_LOCKS}
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
              onCutIn({ tag: 'ARCHIVE UNLOCKED', title: 'STRING LOCKS CLEARED', tone: 'lime' });
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
              }}
            >
              {routeCleared && <Check size={12} strokeWidth={2.5} />}
              <span>02 Route Extractor</span>
            </button>
          </div>

          <p className="mission-goal">
            {encounter === 'initials'
              ? lang === 'zh-Hant'
                ? '回傳兩個名字的首字母縮寫 (例："Mira" 與 "Byte" → "MB")。'
                : 'Return the uppercase/first-letter initials of both names (e.g., "Mira", "Byte" → "MB").'
              : lang === 'zh-Hant'
                ? '使用 indexOf("-") 與 substring(...) 抽出 "-" 後方的路線代碼；無 "-" 時回傳 ""。'
                : 'Use indexOf("-") and substring(...) to return everything after "-"; return "" if missing.'}
          </p>

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
    </MissionStageLayout>
  );
};
