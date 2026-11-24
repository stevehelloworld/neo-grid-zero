import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Flame, ShieldAlert, Zap } from 'lucide-react';
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
import { ChapterProgress, computeRank } from '../../game/store';
import { PhaseId } from '../../game/types';
import { BreachPanel } from '../BreachPanel';
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MemoryHud } from '../MemoryHud';
import { MiraComms } from '../MiraComms';
import { MissionHeader } from '../MissionHeader';
import { MarketCanvas } from '../stages/MarketCanvas';
import { TimelineBar } from '../TimelineBar';

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
  chaosWaveTrigger?: { wave: MarketChaosWave; seq: number } | null;
}

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
  chaosWaveTrigger,
}) => {
  const meta = CAMPAIGN_CHAPTERS.find((c) => c.id === 2)!;

  // Phase 1: Recon state
  const [units, setUnits] = useState(17);
  const [squads, setSquads] = useState(5);
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
  const [chaosNote, setChaosNote] = useState<string | null>(null);

  // Trace playback
  const [traceFrames, setTraceFrames] = useState<TraceFrame[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [autoPlaySeq, setAutoPlaySeq] = useState(0);

  const [mira, setMira] = useState<{ mood: 'neutral' | 'alert' | 'danger' | 'success'; text: string }>({
    mood: 'alert',
    text:
      lang === 'zh-Hant'
        ? '霓虹夜市貨運機器人把零頭都切掉了！先預測每隊整數份額 (/)、餘數 (%) 與小數轉型 (double)，再按 DISPATCH！'
        : 'Market bots are truncating cargo values! Predict integer share (/), remainder (%), and exact cast before dispatching crates!',
  });

  useEffect(() => {
    if (phase === 'recon') {
      setMira({
        mood: progress.reconDone ? 'success' : 'alert',
        text:
          lang === 'zh-Hant'
            ? '先用目前這批貨物預測三個值（整數商、餘數、精確小數），也可自由加減貨箱與小隊數量做實驗！'
            : 'Predict /, %, and exact decimal share for the cargo crate, or adjust units/squads to experiment!',
      });
    } else if (phase === 'breach') {
      setMira({
        mood: 'neutral',
        text:
          lang === 'zh-Hant'
            ? '破解三道夜市計價鎖：注意 Java 先執行整數除法，才指定給 double！'
            : 'Crack 3 market locks! Remember int / int runs BEFORE assignment to double.',
      });
    } else if (phase === 'battle') {
      setMira({
        mood: 'alert',
        text:
          lang === 'zh-Hant'
            ? '先過 01 CARGO SPLITTER，再迎戰 02 BOSS: TRUNCATION TITAN！用 (int) 與 (double) 守護每一分錢！'
            : 'Clear Cargo Splitter first, then shatter TRUNCATION TITAN across 3 changing-input waves!',
      });
    } else {
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? '夜市結算系統恢復 100% 精準！已解鎖 ALU MODULE 晶片。'
            : 'Night Market ledger calibrated! ALU MODULE chip synced to BYTE.',
      });
    }
  }, [phase, lang, progress.reconDone]);

  useEffect(() => {
    if (!chaosWaveTrigger) return;
    setEncounter('titan');
    onPhaseChange('battle');
    const res = evaluateTitanEncounter(titanCode, chaosWaveTrigger.wave);
    setBattleResult(res);
    setTraceFrames(res.primaryRun.frames);
    setStepIdx(0);
    setAutoPlaySeq((s) => s + 1);
    setPulseKey((k) => k + 1);
    if (res.passed) {
      sound.shieldBreak();
      setChaosNote(
        `GM Chaos (${chaosWaveTrigger.wave.subtotalCents}¢ / ${chaosWaveTrigger.wave.crewSize} crew) PASSED!`,
      );
      onCutIn({ tag: 'GM CHAOS', title: 'CHAOS ORDER CLEARED!', tone: 'lime' });
    } else {
      sound.hitError();
      setChaosNote(`GM Chaos failed! Check wave report below.`);
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
      setReconMsg(
        lang === 'zh-Hant'
          ? `預測有誤！${units} / ${squads} 的整數商是 ${expPer}、餘數是 ${expLeft}，精確小數為 ${expExact.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}。`
          : `Check again: ${units} / ${squads} = ${expPer}, ${units} % ${squads} = ${expLeft}, exact = ${expExact.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}.`,
      );
      return;
    }

    sound.shieldBreak();
    setDistributed(true);
    setReconStatus('ok');
    setReconMsg(
      lang === 'zh-Hant'
        ? `貨箱分配精準無誤！${expPer} 個進各小隊、${expLeft} 個進餘數槽。`
        : `Cargo dispatched! ${expPer} crates per squad, ${expLeft} left over.`,
    );
    onUpdateProgress((p) => ({
      ...p,
      reconDone: true,
      completedPhases: p.completedPhases.includes('recon') ? p.completedPhases : [...p.completedPhases, 'recon'],
    }));
  };

  const handleDeployBattle = () => {
    setChaosNote(null);
    sound.deploy();
    const res =
      encounter === 'splitter'
        ? evaluateSplitterEncounter(splitterCode)
        : evaluateTitanEncounter(titanCode);

    setBattleResult(res);
    setTraceFrames(res.primaryRun.frames);
    setStepIdx(0);
    setAutoPlaySeq((s) => s + 1);
    setPulseKey((k) => k + 1);

    if (!res.passed) {
      sound.hitError();
      onUpdateProgress((p) => ({ ...p, battleMistakes: p.battleMistakes + 1 }));
      onCutIn({
        tag: `WAVE ${res.wavesCleared + 1} FAIL`,
        title: res.primaryRun.error ? 'SYNTAX / TYPE FAULT' : 'PRECISION MISMATCH',
        tone: 'danger',
      });
      setMira({
        mood: 'danger',
        text: res.primaryRun.error
          ? `Line ${res.primaryRun.error.line}: ${res.primaryRun.error.message}`
          : lang === 'zh-Hant'
            ? `第 ${res.wavesCleared + 1} 波未通過！檢查是否少了 (double) 或 += / ++，並拉動時間軸確認每一欄數字。`
            : `Wave ${res.wavesCleared + 1} failed! Check casting, compound operators, or scrub the trace bar to verify each variable.`,
      });
      return;
    }

    sound.shieldBreak();
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
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? `截斷泰坦被擊破！獲得 ${rank} 級評價與 ALU MODULE 晶片！`
            : `TRUNCATION TITAN shattered! Earned ${rank}-Rank and unlocked ALU MODULE!`,
      });
    } else {
      onUpdateProgress((p) => ({ ...p, encounterCleared: nextCleared }));
      onCutIn({
        tag: 'ENCOUNTER CLEAR',
        title: encounter === 'splitter' ? 'CARGO SPLITTER VERIFIED!' : 'TITAN SHIELDS SHATTERED!',
        tone: 'cyan',
      });
    }
  };

  const currentFrame = traceFrames[stepIdx] ?? null;
  const splitterCleared = Boolean(progress.encounterCleared.splitter);
  const titanCleared = Boolean(progress.encounterCleared.titan);
  const battleComplete = splitterCleared && titanCleared;

  const canvasMode =
    phase === 'recon'
      ? 'recon'
      : phase === 'breach'
        ? 'trace'
        : encounter === 'splitter'
          ? 'splitter'
          : 'titan';

  const canvasStatus: 'idle' | 'ok' | 'error' =
    phase === 'recon' ? reconStatus : battleResult ? (battleResult.passed ? 'ok' : 'error') : 'idle';

  const stdoutShown = useMemo(
    () => (currentFrame ? currentFrame.stdout : battleResult?.primaryRun.stdout ?? ''),
    [currentFrame, battleResult],
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
              <span className="tac-tag amber">PHASE 01 // CARGO DOCK SIMULATION</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="panel-frame" style={{ padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--cyan)' }}>CRATE UNITS</div>
                    <strong className="mono" style={{ fontSize: 22 }}>{units}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="tac-btn ghost" style={{ minHeight: 32, padding: '2px 10px' }} onClick={() => { setUnits((u) => Math.max(6, u - 1)); setDistributed(false); }}>−</button>
                    <button type="button" className="tac-btn ghost" style={{ minHeight: 32, padding: '2px 10px' }} onClick={() => { setUnits((u) => Math.min(30, u + 1)); setDistributed(false); }}>+</button>
                  </div>
                </div>
                <div className="panel-frame" style={{ padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--amber)' }}>SQUADS</div>
                    <strong className="mono" style={{ fontSize: 22 }}>{squads}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="tac-btn ghost" style={{ minHeight: 32, padding: '2px 10px' }} onClick={() => { setSquads((s) => Math.max(2, s - 1)); setDistributed(false); }}>−</button>
                    <button type="button" className="tac-btn ghost" style={{ minHeight: 32, padding: '2px 10px' }} onClick={() => { setSquads((s) => Math.min(6, s + 1)); setDistributed(false); }}>+</button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--cyan)' }}>perSquad (/)</span>
                  <input type="number" value={shareGuess} onChange={(e) => setShareGuess(e.target.value)} style={{ padding: 8, background: '#050a11', border: '1px solid var(--border-active)', fontFamily: 'var(--font-mono)' }} />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--amber)' }}>leftovers (%)</span>
                  <input type="number" value={leftGuess} onChange={(e) => setLeftGuess(e.target.value)} style={{ padding: 8, background: '#050a11', border: '1px solid var(--border-active)', fontFamily: 'var(--font-mono)' }} />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--lime)' }}>exact (cast)</span>
                  <input type="number" step="0.01" value={exactGuess} onChange={(e) => setExactGuess(e.target.value)} style={{ padding: 8, background: '#050a11', border: '1px solid var(--border-active)', fontFamily: 'var(--font-mono)' }} />
                </label>
              </div>

              <button type="button" className="tac-btn primary chamfer-sm" onClick={handleReconDispatch}>
                <Zap size={15} />
                {lang === 'zh-Hant' ? '鎖定預測並分配貨物' : 'LOCK PREDICTIONS & DISPATCH CARGO'}
              </button>

              {reconMsg && (
                <div className="mono" style={{ padding: 10, fontSize: 12, background: reconStatus === 'ok' ? 'var(--lime-dim)' : 'var(--crimson-dim)', border: `1px solid ${reconStatus === 'ok' ? 'var(--lime)' : 'var(--crimson)'}` }}>
                  {reconMsg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="tac-btn lime chamfer-sm" disabled={!progress.reconDone} onClick={() => { sound.click(); onPhaseChange('breach'); }}>
                  {lang === 'zh-Hant' ? '前往 Phase 02 市集鎖' : 'PROCEED TO BREACH'} <ArrowRight size={15} />
                </button>
              </div>
            </section>
          )}

          {phase === 'breach' && (
            <BreachPanel
              locks={CH02_LOCKS}
              solvedLocks={solvedLocks}
              lang={lang}
              tagLabel="PRECEDENCE & CAST"
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
                  onCutIn({ tag: 'LEDGER BREACH', title: 'OPERATOR LOCKS CLEARED', tone: 'lime' });
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
                <button
                  type="button"
                  className={`tac-btn ${encounter === 'splitter' ? 'primary' : splitterCleared ? 'lime' : 'ghost'} chamfer-sm`}
                  style={{ minHeight: 34, padding: '5px 12px', fontSize: 11 }}
                  onClick={() => { sound.click(); setEncounter('splitter'); setBattleResult(null); setChaosNote(null); }}
                >
                  {splitterCleared ? '✓ ' : ''}01 CARGO SPLITTER
                </button>
                <button
                  type="button"
                  className={`tac-btn ${encounter === 'titan' ? 'primary' : titanCleared ? 'lime' : 'ghost'} chamfer-sm`}
                  style={{ minHeight: 34, padding: '5px 12px', fontSize: 11 }}
                  onClick={() => { sound.click(); setEncounter('titan'); setBattleResult(null); setChaosNote(null); }}
                >
                  {titanCleared ? '✓ ' : ''}02 BOSS: TRUNCATION TITAN
                </button>
              </div>

              {encounter === 'titan' && (
                <div className="boss-bar chamfer-sm">
                  <div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--crimson)', fontWeight: 700 }}>SECTOR BOSS // 3-WAVE LEDGER TEST</div>
                    <strong style={{ fontSize: 15 }}>TRUNCATION TITAN</strong>
                  </div>
                  <div className="shield-pips">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className={`shield-pip ${battleResult && i < battleResult.wavesCleared ? 'broken' : ''}`} />
                    ))}
                  </div>
                </div>
              )}

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
                <div style={{ display: 'grid', gap: 8 }}>
                  {battleResult.waveDetails.map((wd) => (
                    <div
                      key={wd.waveIndex}
                      style={{
                        padding: '9px 11px',
                        border: `1px solid ${wd.passed ? 'rgba(184, 255, 60, 0.45)' : 'rgba(255, 42, 95, 0.55)'}`,
                        background: wd.passed ? 'rgba(184, 255, 60, 0.06)' : 'rgba(255, 42, 95, 0.08)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                        <span>{t(wd.label, lang)}</span>
                        <span className="mono" style={{ color: wd.passed ? 'var(--lime)' : 'var(--crimson)' }}>
                          {wd.passed ? 'WAVE CLEARED' : 'FAILED'}
                        </span>
                      </div>
                      {!wd.passed && wd.run.error && (
                        <div className="mono" style={{ fontSize: 11.5, color: '#ff8ca8', marginTop: 4 }}>
                          <ShieldAlert size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                          Line {wd.run.error.line}: {wd.run.error.message}
                        </div>
                      )}
                      <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                        {wd.checks.map((ck, ci) => (
                          <li key={ci} style={{ color: ck.ok ? 'var(--lime)' : '#ff8ca8' }}>
                            {ck.ok ? '✓' : '✕'} {t(ck.label, lang)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {phase === 'debrief' && (
            <section className="panel-frame chamfer" style={{ padding: 20, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="tac-tag lime">MARKET CALIBRATED // ALU MODULE SYNCED</span>
                <span className="tac-tag cyan" style={{ fontSize: 16, padding: '6px 14px' }}>
                  RANK {progress.rank ?? 'S'}
                </span>
              </div>
              <h2 style={{ fontSize: 28 }}>
                {lang === 'zh-Hant' ? '霓虹夜市計價系統校準完成' : 'Neon Market Ledger Calibrated'}
              </h2>
              <p style={{ color: 'var(--ink-secondary)', fontSize: 13.5 }}>
                {lang === 'zh-Hant'
                  ? '你已掌握 /, % 與 (double)/(int) 明確轉型時機，成功擊破 TRUNCATION TITAN！繼續推進第 03 話《訊號檔案館》！'
                  : 'You mastered /, %, casting order, and compound operators to defeat TRUNCATION TITAN! Advance to Ch.03 Signal Archive.'}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="tac-btn primary chamfer-sm" onClick={() => { sound.deploy(); onOpenChapter(3); }}>
                  {lang === 'zh-Hant' ? '下一關：Ch.03 訊號檔案館' : 'NEXT MISSION: CH.03 SIGNAL ARCHIVE'} →
                </button>
                <button type="button" className="tac-btn ghost chamfer-sm" onClick={() => { sound.click(); onBackToMap(); }}>
                  {t(UI_COPY.backToMap, lang)}
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="cockpit-right">
          <MarketCanvas
            mode={canvasMode}
            units={units}
            squads={squads}
            distributed={distributed}
            activeFrame={currentFrame}
            bossShields={3}
            brokenShields={
              encounter === 'titan' && battleResult
                ? battleResult.totalWaves === 1
                  ? progress.rank ? 3 : 0
                  : battleResult.wavesCleared
                : encounter === 'titan' && progress.rank ? 3 : 0
            }
            status={canvasStatus}
            pulseKey={pulseKey}
          />
          <TimelineBar
            frames={traceFrames}
            stepIndex={stepIdx}
            onStepChange={(idx) => setStepIdx(idx)}
            lang={lang}
            autoPlayTrigger={autoPlaySeq}
          />
          <MemoryHud frame={currentFrame} stdout={stdoutShown} lang={lang} />
        </div>
      </div>
    </div>
  );
};
