import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Flame, ShieldAlert, Zap } from 'lucide-react';
import { sound } from '../../engine/audio/synth';
import { Lang, t, UI_COPY } from '../../engine/i18n/text';
import { runStatements, TraceFrame } from '../../engine/vm';
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
import { CodeTerminal } from '../CodeTerminal';
import { CutInData } from '../CutInBanner';
import { MemoryHud } from '../MemoryHud';
import { MiraComms } from '../MiraComms';
import { ReactorCanvas } from '../stages/ReactorCanvas';
import { TimelineBar } from '../TimelineBar';

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
  const [lockIdx, setLockIdx] = useState(0);
  const [solvedLocks, setSolvedLocks] = useState<boolean[]>(
    progress.breachCleared ? [true, true] : [false, false],
  );
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
  const [breachMsg, setBreachMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Phase 3: Battle state
  const [encounter, setEncounter] = useState<'swap' | 'reactor'>('swap');
  const swapCode = progress.codeDrafts.swap ?? CH01_SWAP_STARTER;
  const reactorCode = progress.codeDrafts.reactor ?? CH01_REACTOR_STARTER;
  const [battleResult, setBattleResult] = useState<Ch01EncounterResult | null>(null);
  const [chaosNote, setChaosNote] = useState<string | null>(null);

  // Shared Trace Playback state
  const [traceFrames, setTraceFrames] = useState<TraceFrame[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [autoPlaySeq, setAutoPlaySeq] = useState(0);

  const [mira, setMira] = useState<{ mood: 'neutral' | 'alert' | 'danger' | 'success'; text: string }>({
    mood: 'alert',
    text:
      lang === 'zh-Hant'
        ? '反應爐儀表顯示剩餘 65 MW，但實體感測器卻不斷漂移！先用下方拉桿製造「讀數不同步」現場！'
        : 'Reactor dashboard claims 65 MW remaining, even while live supply and usage shift. Tune the sensors to trigger a stale-memory mismatch!',
  });

  // Update Mira hint cleanly on phase change
  useEffect(() => {
    if (phase === 'recon') {
      setMira({
        mood: progress.reconDone ? 'success' : 'alert',
        text:
          lang === 'zh-Hant'
            ? '把 Supply 調成 120、Usage 調成 45（也可用鍵盤 A/D、W/S），觀察右邊 Memory Core 有沒有跟著動？然後預測並執行！'
            : 'Set Supply to 120 and Usage to 45 (or press A/D & W/S). Watch if Memory Core updates on its own, then predict and execute!',
      });
    } else if (phase === 'breach') {
      setMira({
        mood: 'neutral',
        text:
          lang === 'zh-Hant'
            ? '突破防火牆鎖！先用腦袋追蹤每一次指定運算子 = 發生時的暫存器狀態。'
            : 'Two signal locks guard the control bus. Trace each assignment mentally before firing!',
      });
    } else if (phase === 'battle') {
      setMira({
        mood: 'alert',
        text:
          lang === 'zh-Hant'
            ? '先打通 01 頻道交換暖身，再迎戰 OVERLOAD CORE！注意 Wave 2 與 Wave 3 會抽換電量輸入喔！'
            : 'Clear Channel Swap first, then take down OVERLOAD CORE! Waves 2 & 3 shift input values to expose hardcoded prints.',
      });
    } else {
      setMira({
        mood: 'success',
        text:
          lang === 'zh-Hant'
            ? 'Aether-9 中央電網重新上線！可以用時間軸倒帶複習剛剛每一步的記憶體變化。'
            : 'Aether-9 main reactor stabilized! Use the Time-Travel scrubber to review your memory state line by line.',
      });
    }
  }, [phase, lang, progress.reconDone]);

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

  // Listen for GM Chaos Wave injections
  useEffect(() => {
    if (!chaosWaveTrigger) return;
    setEncounter('reactor');
    onPhaseChange('battle');
    const res = evaluateReactorEncounter(reactorCode, chaosWaveTrigger.wave);
    setBattleResult(res);
    setTraceFrames(res.primaryRun.frames);
    setStepIdx(0);
    setAutoPlaySeq((s) => s + 1);
    setPulseKey((k) => k + 1);
    if (res.passed) {
      sound.shieldBreak();
      setChaosNote(
        lang === 'zh-Hant'
          ? `GM 干擾波通過！(${chaosWaveTrigger.wave.initEnergy}/${chaosWaveTrigger.wave.initUsed} → ${chaosWaveTrigger.wave.updEnergy}/${chaosWaveTrigger.wave.updUsed})`
          : `GM Chaos Wave survived! (${chaosWaveTrigger.wave.initEnergy}/${chaosWaveTrigger.wave.initUsed} → ${chaosWaveTrigger.wave.updEnergy}/${chaosWaveTrigger.wave.updUsed})`,
      );
      onCutIn({ tag: 'GM CHAOS', title: 'CHAOS WAVE DEFLECTED!', tone: 'lime' });
    } else {
      sound.hitError();
      setChaosNote(
        lang === 'zh-Hant'
          ? `GM 干擾波擊穿防線！請檢視下方的波動測試結果。`
          : `GM Chaos Wave breached your code! Inspect the wave check below.`,
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
          ? '請先將 Supply 設為 120、Usage 設為 45，觀察物理餘額與記憶體的落差。'
          : 'First calibrate Supply = 120 and Usage = 45 to observe the physical vs stored mismatch.',
      );
      return;
    }
    if (!predOk) {
      sound.hitError();
      setReconStatus('error');
      setReconFeedback(
        lang === 'zh-Hant'
          ? '預測值不正確。當執行 remaining = energy - used; 時，120 - 45 會是多少？'
          : 'Prediction mismatch. When remaining = energy - used; executes, what is 120 - 45?',
      );
      return;
    }

    sound.shieldBreak();
    setStored(75);
    setReconStatus('ok');
    setReconFeedback(
      lang === 'zh-Hant'
        ? '同步成功！指定運算子會立即計算右側並覆寫記憶體。更改前面變數並不會回頭重算。'
        : 'SYNC RESTORED! Assignment evaluates 120 - 45 now and overwrites remaining with 75.',
    );
    setMira({
      mood: 'success',
      text:
        lang === 'zh-Hant'
          ? '漂亮！記住這個鐵則：變數儲存的是「當下計算出的值」，不是即時公式。準備進入防火牆突入！'
          : 'Clean diagnosis! Variables store snapshots, not live formulas. Ready to breach the reactor firewall!',
    });
    onUpdateProgress((prev) => ({
      ...prev,
      reconDone: true,
      completedPhases: prev.completedPhases.includes('recon')
        ? prev.completedPhases
        : [...prev.completedPhases, 'recon'],
    }));
  };

  const handleCrackLock = () => {
    const lock = CH01_LOCKS[lockIdx];
    if (selectedOpt === null) return;
    if (selectedOpt !== lock.correctIndex) {
      sound.hitError();
      onUpdateProgress((p) => ({ ...p, breachMistakes: p.breachMistakes + 1 }));
      setBreachMsg({
        ok: false,
        text:
          lang === 'zh-Hant'
            ? '訊號不符！仔細看哪一行才真正把新值存回變數裡。'
            : 'Signal mismatch! Check which exact statement reassigns the target variable.',
      });
      setMira({
        mood: 'danger',
        text:
          lang === 'zh-Hant'
            ? '小心陷阱！變更左邊以外的變數，並不會自動更新已經算好的結果喔。'
            : 'Watch out—modifying energy or used never retroactively changes an already-stored snapshot.',
      });
      return;
    }

    sound.breachSuccess();
    setBreachMsg({ ok: true, text: t(lock.explanation, lang) });
    if (lock.traceSource) {
      const trace = runStatements(lock.traceSource);
      setTraceFrames(trace.frames);
      setStepIdx(0);
      setAutoPlaySeq((s) => s + 1);
    }

    const nextSolved = [...solvedLocks];
    nextSolved[lockIdx] = true;
    setSolvedLocks(nextSolved);
    const allCleared = nextSolved.every(Boolean);
    if (allCleared) {
      onCutIn({ tag: 'FIREWALL', title: 'ALL SIGNAL LOCKS CRACKED', tone: 'lime' });
      onUpdateProgress((prev) => ({
        ...prev,
        breachCleared: true,
        completedPhases: prev.completedPhases.includes('breach')
          ? prev.completedPhases
          : [...prev.completedPhases, 'breach'],
      }));
    }
  };

  const handleDeployBattle = () => {
    setChaosNote(null);
    sound.deploy();
    const res =
      encounter === 'swap'
        ? evaluateSwapEncounter(swapCode)
        : evaluateReactorEncounter(reactorCode);

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
        title: res.primaryRun.error ? 'COMPILATION / TYPE FAULT' : 'HARDCODE / LOGIC BREACH',
        tone: 'danger',
      });
      setMira({
        mood: 'danger',
        text: res.primaryRun.error
          ? `Line ${res.primaryRun.error.line}: ${res.primaryRun.error.message}`
          : lang === 'zh-Hant'
            ? `第 ${res.wavesCleared + 1} 波測試未通過！拖動時間軸檢查暫存器哪一步跟預期不同。`
            : `Wave ${res.wavesCleared + 1} failed! Scrub the Time-Travel bar to spot where memory diverged.`,
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
            ? `太神啦！兩個關卡與三波壓力測試全數擊破，獲得 ${rank} 級評價！快進戰報復盤吧！`
            : `All waves shattered! Earned ${rank}-Rank and synced MEMORY CORE v1. Advance to Debrief!`,
      });
    } else {
      onUpdateProgress((prev) => ({
        ...prev,
        encounterCleared: nextEncounterCleared,
      }));
      onCutIn({
        tag: 'ENCOUNTER CLEAR',
        title: encounter === 'swap' ? 'CHANNELS SWAPPED! BOSS UNLOCKED' : 'OVERLOAD CORE SHATTERED!',
        tone: 'cyan',
      });
      setMira({
        mood: 'success',
        text:
          encounter === 'swap'
            ? lang === 'zh-Hant'
              ? '雙頻道交換完成！現在切換到「02 BOSS: OVERLOAD CORE」正面對決反應爐！'
              : 'Channel Swap complete! Switch to "02 BOSS: OVERLOAD CORE" to stabilize the main reactor!'
            : lang === 'zh-Hant'
              ? 'Boss 已擊敗！別忘了把暖身任務「01 CHANNEL SWAP」也清掉即可領取總評！'
              : 'Boss defeated! Clear "01 CHANNEL SWAP" as well to finalize your sector rank!',
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

  return (
    <div className="mission-shell">
      {/* Top Phase Stepper */}
      <div className="mission-header-bar chamfer-sm">
        <div>
          <span className="mono" style={{ fontSize: 11, color: 'var(--cyan)' }}>
            {meta.code} // {t(meta.topic, lang)}
          </span>
          <h1 style={{ fontSize: 22 }}>{t(meta.title, lang)}</h1>
        </div>

        <nav className="phase-stepper" aria-label="Mission phases">
          {(
            [
              ['recon', UI_COPY.phaseRecon, true],
              ['breach', UI_COPY.phaseBreach, progress.reconDone],
              ['battle', UI_COPY.phaseBattle, progress.breachCleared],
              ['debrief', UI_COPY.phaseDebrief, battleComplete],
            ] as const
          ).map(([id, label, unlocked]) => {
            const done = progress.completedPhases.includes(id);
            return (
              <button
                key={id}
                type="button"
                className={`phase-pill chamfer-sm ${phase === id ? 'current' : ''} ${done ? 'done' : ''}`}
                disabled={!unlocked}
                onClick={() => {
                  sound.click();
                  onPhaseChange(id);
                }}
              >
                {done && <CheckCircle2 size={13} />}
                {t(label, lang)}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Split Cockpit */}
      <div className="cockpit-grid">
        {/* Left Column: Mission Controls / Code Terminal */}
        <div className="cockpit-left">
          <MiraComms mood={mira.mood} message={mira.text} lang={lang} />

          {phase === 'recon' && (
            <section className="panel-frame chamfer" style={{ padding: 18, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="tac-tag amber">PHASE 01 // SANDBOX DIAGNOSIS</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                  KEYS: A/D · W/S
                </span>
              </div>
              <h2 style={{ fontSize: 22 }}>
                {lang === 'zh-Hant' ? '製造並修復「記憶體不同步」' : 'Make Memory Disagree — Then Sync'}
              </h2>
              <p style={{ color: 'var(--ink-secondary)', fontSize: 13.5 }}>
                {lang === 'zh-Hant'
                  ? '目標：將 Supply 調至 120、Usage 調至 45（此時餘額為 75 MW），但尚未執行賦值時 Memory Core 仍停在 65。輸入預測值後觸發指令！'
                  : 'Objective: Tune Supply to 120 and Usage to 45 while Memory Core stays stuck at 65. Enter your prediction and execute the assignment!'}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span className="mono" style={{ color: 'var(--cyan)' }}>Supply (energy)</span>
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

                <label style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span className="mono" style={{ color: 'var(--amber)' }}>Usage (used)</span>
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

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: '#050a11',
                  border: `1px solid ${stored !== energy - used ? 'var(--amber)' : 'var(--lime)'}`,
                }}
              >
                <span className="mono" style={{ fontSize: 12 }}>
                  Physical: <strong style={{ color: 'var(--cyan)' }}>{energy - used} MW</strong> · Memory:{' '}
                  <strong style={{ color: stored !== energy - used ? 'var(--amber)' : 'var(--lime)' }}>{stored}</strong>
                </span>
                <span className={`tac-tag ${stored !== energy - used ? 'amber' : 'lime'}`}>
                  {stored !== energy - used ? 'DESYNC // STALE' : 'SYNCED'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={{ flex: 1, minWidth: 160, display: 'grid', gap: 5 }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>
                    {lang === 'zh-Hant' ? '預測執行 remaining = energy - used; 後的值：' : 'Predict remaining after assignment executes:'}
                  </span>
                  <input
                    type="number"
                    value={predictInput}
                    placeholder="?"
                    onChange={(e) => setPredictInput(e.target.value)}
                    style={{
                      padding: '9px 12px',
                      background: '#050a11',
                      border: '1px solid var(--border-active)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="tac-btn primary chamfer-sm"
                  style={{ minHeight: 44 }}
                  onClick={handleReconExecute}
                >
                  <Zap size={15} />
                  EXECUTE: remaining = energy - used;
                </button>
              </div>

              {reconFeedback && (
                <div
                  className="mono"
                  style={{
                    padding: '10px 12px',
                    fontSize: 12.5,
                    background: reconStatus === 'ok' ? 'var(--lime-dim)' : 'var(--crimson-dim)',
                    border: `1px solid ${reconStatus === 'ok' ? 'var(--lime)' : 'var(--crimson)'}`,
                  }}
                >
                  {reconFeedback}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="tac-btn lime chamfer-sm"
                  disabled={!progress.reconDone}
                  onClick={() => {
                    sound.click();
                    onPhaseChange('breach');
                  }}
                >
                  {lang === 'zh-Hant' ? '前往 Phase 02 防火牆突入' : 'PROCEED TO BREACH'}
                  <ArrowRight size={15} />
                </button>
              </div>
            </section>
          )}

          {phase === 'breach' && (
            <section className="panel-frame chamfer" style={{ padding: 18, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {CH01_LOCKS.map((lk, idx) => (
                    <button
                      key={lk.id}
                      type="button"
                      className={`tac-btn ${idx === lockIdx ? 'primary' : solvedLocks[idx] ? 'lime' : 'ghost'} chamfer-sm`}
                      style={{ minHeight: 32, padding: '4px 10px', fontSize: 11 }}
                      onClick={() => {
                        sound.click();
                        setLockIdx(idx);
                        setSelectedOpt(null);
                        setBreachMsg(null);
                      }}
                    >
                      {solvedLocks[idx] ? '✓ ' : ''}LOCK 0{idx + 1}
                    </button>
                  ))}
                </div>
                <span className="tac-tag cyan">TRACE BEFORE CLICKING</span>
              </div>

              <div>
                <h2 style={{ fontSize: 20 }}>{t(CH01_LOCKS[lockIdx].title, lang)}</h2>
                <p style={{ color: 'var(--ink-secondary)', fontSize: 13.5, marginTop: 4 }}>
                  {t(CH01_LOCKS[lockIdx].prompt, lang)}
                </p>
              </div>

              {CH01_LOCKS[lockIdx].code && (
                <pre
                  className="mono"
                  style={{
                    margin: 0,
                    padding: '12px 14px',
                    background: '#050a11',
                    border: '1px solid rgba(0, 240, 255, 0.25)',
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    overflowX: 'auto',
                  }}
                >
                  {CH01_LOCKS[lockIdx].code}
                </pre>
              )}

              <div style={{ display: 'grid', gap: 8 }}>
                {CH01_LOCKS[lockIdx].options.map((opt, idx) => {
                  const isSel = selectedOpt === idx;
                  const stateCls =
                    breachMsg && isSel ? (breachMsg.ok ? 'correct' : 'wrong') : isSel ? 'selected' : '';
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`breach-option chamfer-sm ${stateCls}`}
                      onClick={() => {
                        sound.click();
                        setSelectedOpt(idx);
                        setBreachMsg(null);
                      }}
                    >
                      <span className="tac-tag cyan">{String.fromCharCode(65 + idx)}</span>
                      <code style={{ fontSize: 13 }}>{t(opt, lang)}</code>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className="tac-btn primary chamfer-sm"
                  disabled={selectedOpt === null}
                  onClick={handleCrackLock}
                >
                  {lang === 'zh-Hant' ? '破解訊號鎖' : 'CRACK SIGNAL LOCK'}
                </button>
                {lockIdx === 0 && solvedLocks[0] && !solvedLocks[1] && (
                  <button
                    type="button"
                    className="tac-btn amber chamfer-sm"
                    onClick={() => {
                      sound.click();
                      setLockIdx(1);
                      setSelectedOpt(null);
                      setBreachMsg(null);
                    }}
                  >
                    NEXT LOCK →
                  </button>
                )}
                {solvedLocks.every(Boolean) && (
                  <button
                    type="button"
                    className="tac-btn lime chamfer-sm"
                    onClick={() => {
                      sound.click();
                      onPhaseChange('battle');
                    }}
                  >
                    {lang === 'zh-Hant' ? '進入 Phase 03 Boss 戰' : 'ENGAGE BOSS BATTLE'} →
                  </button>
                )}
              </div>

              {breachMsg && (
                <div
                  style={{
                    padding: '10px 12px',
                    fontSize: 12.5,
                    background: breachMsg.ok ? 'var(--lime-dim)' : 'var(--crimson-dim)',
                    border: `1px solid ${breachMsg.ok ? 'var(--lime)' : 'var(--crimson)'}`,
                  }}
                >
                  {breachMsg.text}
                </div>
              )}
            </section>
          )}

          {phase === 'battle' && (
            <section className="panel-frame chamfer" style={{ padding: 16, display: 'grid', gap: 12 }}>
              {/* Encounter Switcher + Boss HP */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className={`tac-btn ${encounter === 'swap' ? 'primary' : swapCleared ? 'lime' : 'ghost'} chamfer-sm`}
                    style={{ minHeight: 34, padding: '5px 12px', fontSize: 11 }}
                    onClick={() => {
                      sound.click();
                      setEncounter('swap');
                      setBattleResult(null);
                      setChaosNote(null);
                    }}
                  >
                    {swapCleared ? '✓ ' : ''}01 CHANNEL SWAP
                  </button>
                  <button
                    type="button"
                    className={`tac-btn ${encounter === 'reactor' ? 'primary' : reactorCleared ? 'lime' : 'ghost'} chamfer-sm`}
                    style={{ minHeight: 34, padding: '5px 12px', fontSize: 11 }}
                    onClick={() => {
                      sound.click();
                      setEncounter('reactor');
                      setBattleResult(null);
                      setChaosNote(null);
                    }}
                  >
                    {reactorCleared ? '✓ ' : ''}02 BOSS: OVERLOAD CORE
                  </button>
                </div>
              </div>

              {encounter === 'reactor' && (
                <div className="boss-bar chamfer-sm">
                  <div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--crimson)', fontWeight: 700 }}>
                      SECTOR BOSS // 3-WAVE SHIELD TEST
                    </div>
                    <strong style={{ fontSize: 15 }}>OVERLOAD CORE</strong>
                  </div>
                  <div className="shield-pips" aria-label="Boss shields">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className={`shield-pip ${i < brokenShields ? 'broken' : ''}`} />
                    ))}
                  </div>
                </div>
              )}

              <div
                style={{
                  padding: '10px 12px',
                  background: 'rgba(6, 11, 18, 0.72)',
                  borderLeft: '3px solid var(--cyan)',
                  fontSize: 12.5,
                  color: 'var(--ink-secondary)',
                }}
              >
                {encounter === 'swap'
                  ? lang === 'zh-Hant'
                    ? '任務：使用 int temp 交換 left 與 right 的值，並印出 "Left: 12" 與 "Right: 7"（第 2 波會注入 31 與 9）。'
                    : 'Mission: Use an int temp variable to swap left and right, then print "Left: <val>" and "Right: <val>". Wave 2 swaps (31, 9).'
                  : lang === 'zh-Hant'
                    ? 'Boss 規格：宣告 int energy = 120; int used = 45;，算出 remaining 並備份至 initialRemaining；再更新為 150 / 65 並重算 remaining；宣告 boolean online = true; 並印出 Initial / Updated / Online 三行。'
                    : 'Boss Spec: Declare energy=120, used=45, compute remaining, copy to initialRemaining, reassign energy=150, used=65, recalculate remaining, declare boolean online=true, print Initial:, Updated:, Online:.'}
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

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="tac-btn primary chamfer-sm"
                  style={{ minHeight: 42, fontSize: 13 }}
                  onClick={handleDeployBattle}
                >
                  <Zap size={15} />
                  {t(UI_COPY.runDeploy, lang)}
                </button>

                {battleComplete && (
                  <button
                    type="button"
                    className="tac-btn lime chamfer-sm"
                    onClick={() => {
                      sound.click();
                      onPhaseChange('debrief');
                    }}
                  >
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
                      <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--ink-secondary)' }}>
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
                <span className="tac-tag lime">SECTOR RESTORED // UNIT 1 COMPLETE</span>
                <span className="tac-tag cyan" style={{ fontSize: 16, padding: '6px 14px' }}>
                  RANK {progress.rank ?? 'S'}
                </span>
              </div>
              <h2 style={{ fontSize: 28 }}>
                {lang === 'zh-Hant' ? '中央反應爐完全穩定' : 'Aether-9 Reactor Online'}
              </h2>
              <p style={{ color: 'var(--ink-secondary)', fontSize: 13.5 }}>
                {lang === 'zh-Hant'
                  ? '你已掌握 Java 基本型別、值快照與變數交換機制，並成功裝備機體晶片 MEMORY CORE v1！試著拖曳右側的時間軸，向老師口頭說明每一行如何改寫記憶體。'
                  : 'You diagnosed stale memory, mastered variable snapshots, and unlocked MEMORY CORE v1! Scrub the Time-Travel bar on the right to narrate your winning run.'}
              </p>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="tac-btn primary chamfer-sm"
                  onClick={() => {
                    sound.deploy();
                    onOpenChapter(2);
                  }}
                >
                  {lang === 'zh-Hant' ? '出擊下一關：Ch.02 霓虹夜市精密計價' : 'NEXT MISSION: CH.02 NEON MARKET'} →
                </button>
                <button
                  type="button"
                  className="tac-btn ghost chamfer-sm"
                  onClick={() => {
                    sound.click();
                    onBackToMap();
                  }}
                >
                  {t(UI_COPY.backToMap, lang)}
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Live 2D Arena + Time-Travel Debugger + Memory HUD */}
        <div className="cockpit-right">
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
