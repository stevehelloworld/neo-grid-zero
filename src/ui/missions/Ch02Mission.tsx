import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Flame, ShieldAlert, Zap } from 'lucide-react';
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
import { MissionStageLayout } from '../MissionStageLayout';
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
  const [expandedWave, setExpandedWave] = useState<number | null>(null);
  const [chaosNote, setChaosNote] = useState<string | null>(null);

  // Trace playback
  const [traceFrames, setTraceFrames] = useState<TraceFrame[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [autoPlaySeq, setAutoPlaySeq] = useState(0);

  const [mira, setMira] = useState<{ mood: 'neutral' | 'alert' | 'danger' | 'success'; text: string }>({
    mood: 'alert',
    text:
      lang === 'zh-Hant'
        ? '夜市貨運機器人截斷了零頭！預測整數份額 (/)、餘數 (%) 與小數轉型 (double) 後派送貨物。'
        : 'Market bots are truncating cargo values! Predict /, %, and exact decimal share before dispatching.',
  });

  useEffect(() => {
    if (phase === 'recon') {
      setMira({
        mood: progress.reconDone ? 'success' : 'alert',
        text:
          lang === 'zh-Hant'
            ? '填入這批貨箱的整數商、餘數與精確小數後派送，也可以加減貨箱與小隊數量做實驗。'
            : 'Predict /, %, and exact decimal share for the cargo crates, or adjust units/squads.',
      });
    } else if (phase === 'breach') {
      setMira({
        mood: 'neutral',
        text:
          lang === 'zh-Hant'
            ? '注意 Java 會先做 int 整數除法，才指定給 double！解開三道夜市鎖。'
            : 'Remember int / int runs BEFORE assigning to double. Crack all 3 market locks!',
      });
    } else if (phase === 'battle') {
      setMira({
        mood: 'alert',
        text:
          lang === 'zh-Hant'
            ? '先過 01 Cargo Splitter，再用 (double) 轉型與複合運算子擊破 02 Truncation Titan！'
            : 'Clear Cargo Splitter first, then shatter Truncation Titan across 3 test waves.',
      });
    } else {
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? '霓虹夜市結算精準度 100% 恢復！準備前往第 03 話訊號檔案館。'
            : 'Night Market ledger calibrated! Ready to launch Ch.03 Signal Archive.',
      });
    }
  }, [phase, lang, progress.reconDone]);

  useEffect(() => {
    if (!chaosWaveTrigger) return;
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
      onCutIn({ tag: 'GM CHAOS', title: 'CHAOS ORDER CLEARED!', tone: 'lime' });
    } else {
      sound.hitError();
      setChaosNote('GM Chaos failed. Inspect the wave check below.');
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
          ? `預測有誤：${units} / ${squads} = ${expPer}，餘數 ${expLeft}，精確小數為 ${expExact.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}。`
          : `Check again: ${units} / ${squads} = ${expPer}, ${units} % ${squads} = ${expLeft}, exact = ${expExact.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}.`,
      );
      return;
    }

    sound.shieldBreak();
    setDistributed(true);
    setReconStatus('ok');
    setReconMsg(
      lang === 'zh-Hant'
        ? `貨箱分配正確！每隊 ${expPer} 個、餘數槽 ${expLeft} 個。`
        : `Cargo dispatched: ${expPer} crates per squad, ${expLeft} left over.`,
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
      setMira({
        mood: 'danger',
        text: res.primaryRun.error
          ? `Line ${res.primaryRun.error.line}: ${res.primaryRun.error.message}`
          : lang === 'zh-Hant'
            ? `第 ${res.wavesCleared + 1} 波失敗！確認 (double) 轉型或 += 寫法，並用左側追蹤器對數字。`
            : `Wave ${res.wavesCleared + 1} failed! Check (double) casting and scrub the trace to verify values.`,
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
            ? `截斷泰坦擊破！獲得 ${rank} 級評價與 ALU MODULE！`
            : `TRUNCATION TITAN shattered! Earned ${rank}-Rank and ALU MODULE.`,
      });
    } else {
      onUpdateProgress((p) => ({ ...p, encounterCleared: nextCleared }));
      onCutIn({
        tag: 'STAGE CLEAR',
        title: encounter === 'splitter' ? 'CARGO SPLITTER VERIFIED!' : 'TITAN SHIELDS SHATTERED!',
        tone: 'cyan',
      });
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
            {lang === 'zh-Hant' ? '預測貨物分配 ( / · % · double )' : 'Predict Cargo Split ( / · % · double )'}
          </h2>

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
              className={`tac-btn ${progress.reconDone ? 'ghost' : 'primary'} deck-primary-cta`}
              onClick={handleReconDispatch}
            >
              <Zap size={15} />
              <span>{lang === 'zh-Hant' ? '鎖定預測並分配貨物' : 'DISPATCH CARGO'}</span>
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
          locks={CH02_LOCKS}
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
              onCutIn({ tag: 'LEDGER BREACH', title: 'OPERATOR LOCKS CLEARED', tone: 'lime' });
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
              aria-selected={encounter === 'splitter'}
              className={`encounter-tab ${encounter === 'splitter' ? 'active' : ''} ${splitterCleared ? 'cleared' : ''}`}
              onClick={() => {
                sound.click();
                setEncounter('splitter');
                setBattleResult(null);
                setExpandedWave(null);
                setTraceFrames([]);
                setChaosNote(null);
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
              }}
            >
              {titanCleared && <Check size={12} strokeWidth={2.5} />}
              <span>02 Truncation Titan</span>
            </button>
          </div>

          <p className="mission-goal">
            {encounter === 'splitter'
              ? lang === 'zh-Hant'
                ? '使用 / 、% 與 (double) 轉型印出 perSquad、leftovers 與 exactPerSquad。'
                : 'Compute perSquad (/), leftovers (%), and exactPerSquad using a (double) cast, then print all 3.'
              : lang === 'zh-Hant'
                ? '加上 serviceFee 與 bonusCredit，精準計算整數分與無截斷的平均分帳。'
                : 'Apply compound operators (+=, ++) and cast to double before dividing to prevent cent truncation.'}
          </p>

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
    </MissionStageLayout>
  );
};
