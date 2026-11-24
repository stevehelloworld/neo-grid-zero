import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Flame, Scissors, ShieldAlert, Zap } from 'lucide-react';
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
import { MemoryHud } from '../MemoryHud';
import { MiraComms } from '../MiraComms';
import { MissionHeader } from '../MissionHeader';
import { ArchiveCanvas } from '../stages/ArchiveCanvas';
import { TimelineBar } from '../TimelineBar';

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
        ? '訊號檔案館字串膠帶損毀！調校雷射切刀精準切出 "RON"，並實測一次「越界錯誤」與「字串不可變性」實驗！'
        : 'Archive tape corrupted! Calibrate the laser slicer to extract "RON", and test both Out-of-Bounds and Immutability!',
  });

  useEffect(() => {
    if (phase === 'recon') {
      setMira({
        mood: progress.reconDone ? 'success' : 'alert',
        text:
          lang === 'zh-Hant'
            ? '訊號檔案館字串膠帶損毀！調校雷射切刀精準切出 "RON"，並實測越界錯誤或字串不可變性！'
            : 'Archive tape corrupted! Calibrate the laser slicer to extract "RON", and test Out-of-Bounds or Immutability!',
      });
    } else if (phase === 'breach') {
      setMira({
        mood: 'neutral',
        text:
          lang === 'zh-Hant'
            ? '解開三道字串與 Math 檔案鎖！記得 substring 不含 end 索引，且字串不可直接原地修改。'
            : 'Crack 3 String & Math locks! Remember substring excludes end and Strings are immutable.',
      });
    } else if (phase === 'battle') {
      setMira({
        mood: 'alert',
        text:
          lang === 'zh-Hant'
            ? '先通過 01 INITIALS SLICER，再使用 indexOf("-") 擊破 BOSS: ROUTE EXTRACTOR！'
            : 'Clear Initials Slicer first, then use indexOf("-") to defeat IMMUTABLE ARCHIVIST!',
      });
    } else {
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? 'Act I 全數修復！STRING LASER 晶片已同步至 BYTE。'
            : 'Act I complete! STRING LASER chip synced to BYTE.',
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
          ? '切出 "RON"！substring(1, 4) 包含索引 1..3 並排除索引 4。記得也測一下越界或不可變按鈕！'
          : 'Sliced "RON"! substring(1, 4) copies indexes 1–3 and excludes 4.',
      );
      markReconIfReady(true, oobSeen, immutableSeen);
    } else {
      sound.click();
      setReconStatus('idle');
      setReconFeedback(`s.substring(${beginIdx}, ${endIdx}) → "${out}". Target is "RON"!`);
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
          ? '警報！end=7 超過字串長度 5，立刻拋出 StringIndexOutOfBoundsException！'
          : 'Alert! end=7 exceeds length 5, triggering StringIndexOutOfBoundsException!',
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
        ? 's.substring(0, 3); 沒有存回變數，所以 s 依然是 "DRONE"（String 不可變性）！'
        : 's.substring(0, 3); discarded its return value, so s remains "DRONE"!',
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
            ? `不變檔案官瓦解！獲得 ${rank} 級評價與 STRING LASER 晶片！`
            : `IMMUTABLE ARCHIVIST neutralized! Earned ${rank}-Rank and STRING LASER!`,
      });
    } else {
      onUpdateProgress((p) => ({ ...p, encounterCleared: nextCleared }));
      onCutIn({
        tag: 'ENCOUNTER CLEAR',
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
            <section className="panel-frame chamfer" style={{ padding: 18, display: 'grid', gap: 12 }}>
              <span className="tac-tag amber">PHASE 01 // OPTICAL STRING SLICER</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--cyan)' }}>begin index: {beginIdx}</span>
                  <input type="range" min={0} max={5} value={beginIdx} onChange={(e) => setBeginIdx(Number(e.target.value))} style={{ accentColor: 'var(--cyan)' }} />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--amber)' }}>end index: {endIdx}</span>
                  <input type="range" min={0} max={5} value={endIdx} onChange={(e) => setEndIdx(Number(e.target.value))} style={{ accentColor: 'var(--amber)' }} />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="tac-btn primary chamfer-sm" onClick={handleFireSlice}>
                  <Scissors size={14} /> {slicedOk ? '✓ ' : ''}FIRE LASER: s.substring({beginIdx}, {endIdx})
                </button>
                <button type="button" className="tac-btn crimson chamfer-sm" onClick={handleTestOob}>
                  <AlertTriangle size={14} /> {oobSeen ? '✓ ' : ''}TEST OOB (1, 7)
                </button>
                <button type="button" className="tac-btn ghost chamfer-sm" onClick={handleTestImmutable}>
                  {immutableSeen ? '✓ ' : ''}TEST IMMUTABLE CALL
                </button>
              </div>

              {reconFeedback && (
                <div className="mono" style={{ padding: 10, fontSize: 12, background: reconStatus === 'error' ? 'var(--crimson-dim)' : 'var(--lime-dim)', border: `1px solid ${reconStatus === 'error' ? 'var(--crimson)' : 'var(--lime)'}` }}>
                  {reconFeedback}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                  {slicedOk ? '✓ "RON" sliced' : 'Slice "RON"'} · {oobSeen || immutableSeen ? '✓ anomaly tested' : 'Test OOB or Immutable'}
                </span>
                <button type="button" className="tac-btn lime chamfer-sm" disabled={!progress.reconDone} onClick={() => { sound.click(); onPhaseChange('breach'); }}>
                  {lang === 'zh-Hant' ? '前往 Phase 02 檔案鎖' : 'PROCEED TO BREACH'} <ArrowRight size={15} />
                </button>
              </div>
            </section>
          )}

          {phase === 'breach' && (
            <BreachPanel
              locks={CH03_LOCKS}
              solvedLocks={solvedLocks}
              lang={lang}
              tagLabel="STRING & MATH API"
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
              onProceedToBattle={() => onPhaseChange('battle')}
            />
          )}

          {phase === 'battle' && (
            <section className="panel-frame chamfer" style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={`tac-btn ${encounter === 'initials' ? 'primary' : initialsCleared ? 'lime' : 'ghost'} chamfer-sm`} style={{ minHeight: 34, fontSize: 11 }} onClick={() => { sound.click(); setEncounter('initials'); setBattleResult(null); setChaosNote(null); }}>
                  {initialsCleared ? '✓ ' : ''}01 INITIALS SLICER
                </button>
                <button type="button" className={`tac-btn ${encounter === 'route' ? 'primary' : routeCleared ? 'lime' : 'ghost'} chamfer-sm`} style={{ minHeight: 34, fontSize: 11 }} onClick={() => { sound.click(); setEncounter('route'); setBattleResult(null); setChaosNote(null); }}>
                  {routeCleared ? '✓ ' : ''}02 BOSS: ROUTE EXTRACTOR
                </button>
              </div>

              {encounter === 'route' && (
                <div className="boss-bar chamfer-sm">
                  <div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--crimson)', fontWeight: 700 }}>SECTOR BOSS // 3-WAVE STRING LASER</div>
                    <strong style={{ fontSize: 15 }}>IMMUTABLE ARCHIVIST</strong>
                  </div>
                  <div className="shield-pips">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className={`shield-pip ${battleResult && i < battleResult.wavesCleared ? 'broken' : ''}`} />
                    ))}
                  </div>
                </div>
              )}

              <CodeTerminal
                value={encounter === 'initials' ? initialsCode : routeCode}
                starterCode={encounter === 'initials' ? CH03_INITIALS_STARTER : CH03_ROUTE_STARTER}
                activeLine={currentFrame?.line ?? null}
                lang={lang}
                onChange={(next) => onUpdateProgress((p) => ({ ...p, codeDrafts: { ...p.codeDrafts, [encounter]: next } }))}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="tac-btn primary chamfer-sm" style={{ minHeight: 42 }} onClick={handleDeployBattle}>
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
                    {battleResult.trials.map((tr, i) => (
                      <button
                        key={i}
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
                        <span>W{tr.waveIndex + 1} · {tr.label}</span>
                        <span>{tr.passed ? `✓ "${tr.actual}"` : `✕ "${tr.actual}"`}</span>
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
                <span className="tac-tag lime">ARCHIVE RESTORED // ACT I COMPLETE</span>
                <span className="tac-tag cyan" style={{ fontSize: 16, padding: '6px 14px' }}>RANK {progress.rank ?? 'S'}</span>
              </div>
              <h2 style={{ fontSize: 28 }}>{lang === 'zh-Hant' ? '訊號檔案館全數復原' : 'Signal Archive Restored'}</h2>
              <p style={{ color: 'var(--ink-secondary)', fontSize: 13.5 }}>
                {lang === 'zh-Hant'
                  ? 'Act I《都市覺醒》全數通關！你已集齊 MEMORY CORE、ALU MODULE 與 STRING LASER 三大基礎晶片。下一站：Act II 第 04 話《哨兵空域閘門》！'
                  : 'Act I Complete! You unlocked MEMORY CORE, ALU MODULE, and STRING LASER. Ready to launch Act II: Ch.04 Sentinel Sky-Gate!'}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="tac-btn primary chamfer-sm" onClick={() => { sound.deploy(); onOpenChapter(4); }}>
                  {lang === 'zh-Hant' ? '前往 Act II：Ch.04 哨兵空域閘門' : 'NEXT: CH.04 SENTINEL SKY-GATE'} →
                </button>
                <button type="button" className="tac-btn ghost chamfer-sm" onClick={() => { sound.click(); onBackToMap(); }}>
                  {t(UI_COPY.backToMap, lang)}
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="cockpit-right">
          <ArchiveCanvas
            mode={phase === 'recon' ? 'recon' : 'battle'}
            tapeText={tapeText}
            beginIdx={beginIdx}
            endIdx={endIdx}
            slicedResult={phase === 'recon' ? slicedText : inspectedTrial?.actual ?? ''}
            activeFrame={currentFrame}
            bossShields={3}
            brokenShields={
              encounter === 'route' && battleResult
                ? battleResult.totalWaves === 1
                  ? progress.rank ? 3 : 0
                  : battleResult.wavesCleared
                : encounter === 'route' && progress.rank ? 3 : 0
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
