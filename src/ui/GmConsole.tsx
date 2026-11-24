import React, { useRef, useState } from 'react';
import { Download, Flame, RotateCcw, Upload, X } from 'lucide-react';
import { sound } from '../engine/audio/synth';
import { BiText, Lang, t } from '../engine/i18n/text';
import { CAMPAIGN_CHAPTERS } from '../game/campaignData';
import { CH01_TUTOR_PROMPTS, ReactorWaveSpec } from '../game/chapters/ch01Reactor';
import { CH02_TUTOR_PROMPTS, MarketChaosWave } from '../game/chapters/ch02Market';
import { CH03_TUTOR_PROMPTS } from '../game/chapters/ch03Archive';
import { CH04_TUTOR_PROMPTS } from '../game/chapters/ch04Sentinel';
import { CH05_TUTOR_PROMPTS } from '../game/chapters/ch05Surge';
import { CH06_TUTOR_PROMPTS } from '../game/chapters/ch06Scanner';
import { CH07_TUTOR_PROMPTS } from '../game/chapters/ch07Radar';
import { CampaignState } from '../game/store';
import { DroneSpec, PhaseId } from '../game/types';

export interface GmConsoleProps {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  activeChapterId: number | null;
  activePhase: PhaseId;
  state: CampaignState;
  onJump: (chapterId: number, phase: PhaseId) => void;
  onInjectReactorWave: (wave: ReactorWaveSpec) => void;
  onInjectMarketWave: (wave: MarketChaosWave) => void;
  onInjectRouteString: (route: string) => void;
  onInjectSentinelDrone: (drone: DroneSpec) => void;
  onInjectSurgeCharge: (spec: { start: number; gain: number; target: number }) => void;
  onInjectScannerStream: (stream: string) => void;
  onInjectRadarRows: (rows: number) => void;
  onImportState: (next: CampaignState) => void;
  onResetAll: () => void;
}

const PROMPTS_BY_CHAPTER: Record<number, Record<string, BiText[]>> = {
  1: CH01_TUTOR_PROMPTS,
  2: CH02_TUTOR_PROMPTS,
  3: CH03_TUTOR_PROMPTS,
  4: CH04_TUTOR_PROMPTS,
  5: CH05_TUTOR_PROMPTS,
  6: CH06_TUTOR_PROMPTS,
  7: CH07_TUTOR_PROMPTS,
};

export const GmConsole: React.FC<GmConsoleProps> = ({
  open,
  onClose,
  lang,
  activeChapterId,
  activePhase,
  state,
  onJump,
  onInjectReactorWave,
  onInjectMarketWave,
  onInjectRouteString,
  onInjectSentinelDrone,
  onInjectSurgeCharge,
  onInjectScannerStream,
  onInjectRadarRows,
  onImportState,
  onResetAll,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Ch.01 Chaos
  const [initE, setInitE] = useState(140);
  const [initU, setInitU] = useState(55);
  const [updE, setUpdE] = useState(190);
  const [updU, setUpdU] = useState(75);

  // Ch.02 Chaos
  const [subCents, setSubCents] = useState(8000);
  const [crewSize, setCrewSize] = useState(5);

  // Ch.03 Chaos
  const [chaosRoute, setChaosRoute] = useState('dock-99');

  // Ch.04 Chaos
  const [dAge, setDAge] = useState(15);
  const [dTrained, setDTrained] = useState(true);
  const [dMentor, setDMentor] = useState(true);

  // Ch.05 Chaos
  const [cStart, setCStart] = useState(5);
  const [cGain, setCGain] = useState(3);
  const [cTarget, setCTarget] = useState(16);

  // Ch.06 Chaos
  const [cStream, setCStream] = useState('OXOOOOXO');

  // Ch.07 Chaos
  const [cRows, setCRows] = useState(6);

  if (!open) return null;

  const prompts: BiText[] =
    (activeChapterId ? PROMPTS_BY_CHAPTER[activeChapterId]?.[activePhase] : undefined) ?? [];

  const computeExpectedDrone = (age: number, trained: boolean, mentor: boolean): 'CLEAR' | 'PRACTICE' | 'WAIT' => {
    if (trained && age >= 16) return 'CLEAR';
    if (mentor && age >= 13) return 'PRACTICE';
    return 'WAIT';
  };

  const handleExport = () => {
    sound.click();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neo-grid-zero-session-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as CampaignState;
        if (parsed && parsed.version === 1) onImportState(parsed);
      } catch {
        // ignore invalid json
      }
    };
    reader.readAsText(file);
  };

  const playableChapters = CAMPAIGN_CHAPTERS.filter((c) => c.playable);

  return (
    <div
      className="drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Tutor GM Copilot Console"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="gm-drawer">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="tac-tag amber">TUTOR COPILOT // SHIFT+G</span>
            <h2 style={{ fontSize: 22, marginTop: 4 }}>
              {lang === 'zh-Hant' ? '一對一教師 GM 主控台' : '1-on-1 Tutor GM Console'}
            </h2>
          </div>
          <button
            type="button"
            className="tac-btn ghost chamfer-sm"
            onClick={() => { sound.click(); onClose(); }}
            aria-label="Close GM Console"
          >
            <X size={16} />
          </button>
        </div>

        {/* Direct Jump Matrix for Ch.01-07 */}
        <section className="panel-frame chamfer-sm" style={{ padding: 12 }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--cyan)', fontWeight: 700, marginBottom: 8 }}>
            {lang === 'zh-Hant' ? '快速跳關（Ch.01–Ch.07 不鎖進度）' : 'DIRECT SECTOR JUMP (CH.01–CH.07)'}
          </div>
          {playableChapters.map((ch) => (
            <div key={ch.id} style={{ marginBottom: 8 }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-secondary)', marginBottom: 3 }}>
                {ch.code} · {t(ch.title, lang)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                {(['recon', 'breach', 'battle', 'debrief'] as PhaseId[]).map((ph) => (
                  <button
                    key={ph}
                    type="button"
                    className={`tac-btn ${activeChapterId === ch.id && activePhase === ph ? 'primary' : 'ghost'}`}
                    style={{ minHeight: 28, padding: '3px 5px', fontSize: 10 }}
                    onClick={() => { sound.click(); onJump(ch.id, ph); }}
                  >
                    {ph}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Live Chaos Injectors per active chapter */}
        {activeChapterId === 1 && (
          <section className="panel-frame chamfer-sm" style={{ padding: 12, borderColor: 'rgba(255, 149, 0, 0.45)' }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700, marginBottom: 8 }}>
              <Flame size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              GM CHAOS WAVE (CH.01 REACTOR)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
              <label><span className="mono" style={{ fontSize: 10 }}>Init Energy</span><input type="number" value={initE} onChange={(e) => setInitE(Number(e.target.value))} style={{ width: '100%', padding: 6, background: '#050a11', border: '1px solid var(--border-subtle)' }} /></label>
              <label><span className="mono" style={{ fontSize: 10 }}>Init Used</span><input type="number" value={initU} onChange={(e) => setInitU(Number(e.target.value))} style={{ width: '100%', padding: 6, background: '#050a11', border: '1px solid var(--border-subtle)' }} /></label>
              <label><span className="mono" style={{ fontSize: 10 }}>Upd Energy</span><input type="number" value={updE} onChange={(e) => setUpdE(Number(e.target.value))} style={{ width: '100%', padding: 6, background: '#050a11', border: '1px solid var(--border-subtle)' }} /></label>
              <label><span className="mono" style={{ fontSize: 10 }}>Upd Used</span><input type="number" value={updU} onChange={(e) => setUpdU(Number(e.target.value))} style={{ width: '100%', padding: 6, background: '#050a11', border: '1px solid var(--border-subtle)' }} /></label>
            </div>
            <button type="button" className="tac-btn amber chamfer-sm" style={{ width: '100%', marginTop: 10, fontSize: 12 }} onClick={() => { sound.deploy(); onInjectReactorWave({ initEnergy: initE, initUsed: initU, updEnergy: updE, updUsed: updU, label: { en: `GM Chaos (${initE}/${initU} → ${updE}/${updU})`, zh: `GM 干擾波 (${initE}/${initU} → ${updE}/${updU})` } }); onClose(); }}>
              FIRE CHAOS WAVE
            </button>
          </section>
        )}

        {activeChapterId === 2 && (
          <section className="panel-frame chamfer-sm" style={{ padding: 12, borderColor: 'rgba(255, 149, 0, 0.45)' }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700, marginBottom: 8 }}>
              <Flame size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              GM CHAOS ORDER (CH.02 MARKET)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
              <label><span className="mono" style={{ fontSize: 10 }}>subtotalCents</span><input type="number" value={subCents} onChange={(e) => setSubCents(Number(e.target.value))} style={{ width: '100%', padding: 6, background: '#050a11', border: '1px solid var(--border-subtle)' }} /></label>
              <label><span className="mono" style={{ fontSize: 10 }}>crewSize</span><input type="number" min={1} value={crewSize} onChange={(e) => setCrewSize(Math.max(1, Number(e.target.value)))} style={{ width: '100%', padding: 6, background: '#050a11', border: '1px solid var(--border-subtle)' }} /></label>
            </div>
            <button type="button" className="tac-btn amber chamfer-sm" style={{ width: '100%', marginTop: 10, fontSize: 12 }} onClick={() => { sound.deploy(); onInjectMarketWave({ subtotalCents: subCents, crewSize }); onClose(); }}>
              INJECT CHAOS ORDER
            </button>
          </section>
        )}

        {activeChapterId === 3 && (
          <section className="panel-frame chamfer-sm" style={{ padding: 12, borderColor: 'rgba(255, 149, 0, 0.45)' }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700, marginBottom: 8 }}>
              <Flame size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              GM CHAOS ROUTE (CH.03 ARCHIVE)
            </div>
            <label><span className="mono" style={{ fontSize: 10 }}>route string (contains one "-")</span><input type="text" value={chaosRoute} onChange={(e) => setChaosRoute(e.target.value)} style={{ width: '100%', padding: 6, background: '#050a11', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)' }} /></label>
            <button type="button" className="tac-btn amber chamfer-sm" style={{ width: '100%', marginTop: 10, fontSize: 12 }} onClick={() => { sound.deploy(); onInjectRouteString(chaosRoute.includes('-') ? chaosRoute : `${chaosRoute}-1`); onClose(); }}>
              SLICE CHAOS ROUTE
            </button>
          </section>
        )}

        {activeChapterId === 4 && (
          <section className="panel-frame chamfer-sm" style={{ padding: 12, borderColor: 'rgba(255, 149, 0, 0.45)' }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700, marginBottom: 8 }}>
              <Flame size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              GM CHAOS DRONE (CH.04 SKY-GATE)
            </div>
            <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="mono">age</span><input type="number" value={dAge} onChange={(e) => setDAge(Number(e.target.value))} style={{ width: 90, padding: 6, background: '#050a11', border: '1px solid var(--border-subtle)' }} /></label>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="mono">trained</span><input type="checkbox" checked={dTrained} onChange={(e) => setDTrained(e.target.checked)} /></label>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="mono">mentor</span><input type="checkbox" checked={dMentor} onChange={(e) => setDMentor(e.target.checked)} /></label>
              <div className="mono" style={{ fontSize: 11, color: 'var(--lime)' }}>Expected: {computeExpectedDrone(dAge, dTrained, dMentor)}</div>
            </div>
            <button type="button" className="tac-btn amber chamfer-sm" style={{ width: '100%', marginTop: 10, fontSize: 12 }} onClick={() => { sound.deploy(); onInjectSentinelDrone({ id: `gm-${Date.now()}`, callsign: `GM-${dAge}`, age: dAge, trained: dTrained, mentor: dMentor, expected: computeExpectedDrone(dAge, dTrained, dMentor) }); onClose(); }}>
              LAUNCH CHAOS DRONE
            </button>
          </section>
        )}

        {activeChapterId === 5 && (
          <section className="panel-frame chamfer-sm" style={{ padding: 12, borderColor: 'rgba(255, 149, 0, 0.45)' }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700, marginBottom: 8 }}>
              <Flame size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              GM CHAOS CHARGE (CH.05 SURGE)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 12 }}>
              <label><span className="mono" style={{ fontSize: 10 }}>start</span><input type="number" value={cStart} onChange={(e) => setCStart(Number(e.target.value))} style={{ width: '100%', padding: 6, background: '#050a11', border: '1px solid var(--border-subtle)' }} /></label>
              <label><span className="mono" style={{ fontSize: 10 }}>gain</span><input type="number" min={1} value={cGain} onChange={(e) => setCGain(Math.max(1, Number(e.target.value)))} style={{ width: '100%', padding: 6, background: '#050a11', border: '1px solid var(--border-subtle)' }} /></label>
              <label><span className="mono" style={{ fontSize: 10 }}>target</span><input type="number" value={cTarget} onChange={(e) => setCTarget(Number(e.target.value))} style={{ width: '100%', padding: 6, background: '#050a11', border: '1px solid var(--border-subtle)' }} /></label>
            </div>
            <button type="button" className="tac-btn amber chamfer-sm" style={{ width: '100%', marginTop: 10, fontSize: 12 }} onClick={() => { sound.deploy(); onInjectSurgeCharge({ start: cStart, gain: cGain, target: cTarget }); onClose(); }}>
              FIRE SURGE TEST
            </button>
          </section>
        )}

        {activeChapterId === 6 && (
          <section className="panel-frame chamfer-sm" style={{ padding: 12, borderColor: 'rgba(255, 149, 0, 0.45)' }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700, marginBottom: 8 }}>
              <Flame size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              GM CHAOS SIGNAL (CH.06 SCANNER)
            </div>
            <label><span className="mono" style={{ fontSize: 10 }}>O / X stream</span><input type="text" value={cStream} onChange={(e) => setCStream(e.target.value)} style={{ width: '100%', padding: 6, background: '#050a11', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)' }} /></label>
            <button type="button" className="tac-btn amber chamfer-sm" style={{ width: '100%', marginTop: 10, fontSize: 12 }} onClick={() => { sound.deploy(); onInjectScannerStream(cStream); onClose(); }}>
              SCAN CHAOS STREAM
            </button>
          </section>
        )}

        {activeChapterId === 7 && (
          <section className="panel-frame chamfer-sm" style={{ padding: 12, borderColor: 'rgba(255, 149, 0, 0.45)' }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700, marginBottom: 8 }}>
              <Flame size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              GM CHAOS MATRIX (CH.07 RADAR)
            </div>
            <label><span className="mono" style={{ fontSize: 10 }}>rows (0..8)</span><input type="number" min={0} max={8} value={cRows} onChange={(e) => setCRows(Math.max(0, Math.min(8, Number(e.target.value))))} style={{ width: '100%', padding: 6, background: '#050a11', border: '1px solid var(--border-subtle)' }} /></label>
            <button type="button" className="tac-btn amber chamfer-sm" style={{ width: '100%', marginTop: 10, fontSize: 12 }} onClick={() => { sound.deploy(); onInjectRadarRows(cRows); onClose(); }}>
              SWEEP CHAOS MATRIX
            </button>
          </section>
        )}

        {/* Tutor Oral Discussion Prompts */}
        <section className="panel-frame chamfer-sm" style={{ padding: 12 }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--cyan)', fontWeight: 700, marginBottom: 8 }}>
            {lang === 'zh-Hant' ? '現場口頭引導提問卡' : 'LIVE 1-ON-1 ORAL PROMPTS'}
          </div>
          {prompts.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, fontSize: 13, color: 'var(--ink-secondary)' }}>
              {prompts.map((pr, idx) => <li key={idx}>{t(pr, lang)}</li>)}
            </ul>
          ) : (
            <p style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>
              {lang === 'zh-Hant'
                ? '進入 Ch.01–Ch.07 任一任務後，這裡會顯示該階段的教學提問卡。'
                : 'Enter any Ch.01–Ch.07 mission to view phase-specific oral questioning prompts.'}
            </p>
          )}
        </section>

        {/* Session Snapshot Export / Import */}
        <section className="panel-frame chamfer-sm" style={{ padding: 12, display: 'grid', gap: 8 }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)', fontWeight: 700 }}>
            {lang === 'zh-Hant' ? '學習進度快照 (.JSON)' : 'SESSION SNAPSHOT (.JSON)'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="tac-btn ghost chamfer-sm" style={{ flex: 1, fontSize: 11 }} onClick={handleExport}><Download size={13} /> Export</button>
            <button type="button" className="tac-btn ghost chamfer-sm" style={{ flex: 1, fontSize: 11 }} onClick={() => fileRef.current?.click()}><Upload size={13} /> Import</button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={handleImportFile} />
          </div>
          <button type="button" className="tac-btn crimson chamfer-sm" style={{ fontSize: 11 }} onClick={() => { sound.click(); onResetAll(); }}>
            <RotateCcw size={13} />
            {lang === 'zh-Hant' ? '重置全部通關紀錄' : 'RESET ALL CAMPAIGN DATA'}
          </button>
        </section>
      </aside>
    </div>
  );
};
