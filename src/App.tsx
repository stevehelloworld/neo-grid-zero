import React, { useCallback, useEffect, useState } from 'react';
import { sound } from './engine/audio/synth';
import { CAMPAIGN_CHAPTERS } from './game/campaignData';
import { ReactorWaveSpec } from './game/chapters/ch01Reactor';
import { MarketChaosWave } from './game/chapters/ch02Market';
import {
  CampaignState,
  ChapterProgress,
  createInitialState,
  getChapterProgress,
  loadCampaignState,
  saveCampaignState,
} from './game/store';
import { DroneSpec, PhaseId } from './game/types';
import { ChipBayModal } from './ui/ChipBayModal';
import { CutInBanner, CutInData } from './ui/CutInBanner';
import { GmConsole } from './ui/GmConsole';
import { Ch01Mission } from './ui/missions/Ch01Mission';
import { Ch02Mission } from './ui/missions/Ch02Mission';
import { Ch03Mission } from './ui/missions/Ch03Mission';
import { Ch04Mission } from './ui/missions/Ch04Mission';
import { Ch05Mission } from './ui/missions/Ch05Mission';
import { Ch06Mission } from './ui/missions/Ch06Mission';
import { Ch07Mission } from './ui/missions/Ch07Mission';
import { TopBar } from './ui/TopBar';
import { WorldMap } from './ui/WorldMap';

export const App: React.FC = () => {
  const [state, setState] = useState<CampaignState>(() => loadCampaignState());
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
  const [activePhase, setActivePhase] = useState<PhaseId>('recon');
  const [muted, setMuted] = useState(() => sound.isMuted());
  const [chipsOpen, setChipsOpen] = useState(false);
  const [gmOpen, setGmOpen] = useState(false);
  const [cutIn, setCutIn] = useState<CutInData | null>(null);

  const [chaosWaveTrigger, setChaosWaveTrigger] = useState<{ wave: ReactorWaveSpec; seq: number } | null>(null);
  const [chaosMarketTrigger, setChaosMarketTrigger] = useState<{ wave: MarketChaosWave; seq: number } | null>(null);
  const [chaosRouteTrigger, setChaosRouteTrigger] = useState<{ route: string; seq: number } | null>(null);
  const [chaosDroneTrigger, setChaosDroneTrigger] = useState<{ drone: DroneSpec; seq: number } | null>(null);
  const [chaosChargeTrigger, setChaosChargeTrigger] = useState<{ start: number; gain: number; target: number; seq: number } | null>(null);
  const [chaosSignalTrigger, setChaosSignalTrigger] = useState<{ stream: string; seq: number } | null>(null);
  const [chaosRowsTrigger, setChaosRowsTrigger] = useState<{ rows: number; seq: number } | null>(null);

  useEffect(() => {
    saveCampaignState(state);
    document.documentElement.lang = state.lang;
  }, [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === 'G' || e.key === 'g')) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('.cm-editor'))) {
          return;
        }
        e.preventDefault();
        setGmOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const triggerCutIn = useCallback((data: Omit<CutInData, 'id'>) => {
    setCutIn({ ...data, id: Date.now() });
  }, []);

  const updateChapterProgress = useCallback(
    (chapterId: number, updater: (prev: ChapterProgress) => ChapterProgress) => {
      setState((prev) => {
        const current = getChapterProgress(prev, chapterId);
        return {
          ...prev,
          chapters: {
            ...prev.chapters,
            [chapterId]: updater(current),
          },
        };
      });
    },
    [],
  );

  const unlockChip = useCallback((chipId: string) => {
    setState((prev) => {
      if (prev.unlockedChips.includes(chipId)) return prev;
      return {
        ...prev,
        unlockedChips: [...prev.unlockedChips, chipId],
      };
    });
  }, []);

  const handlePhaseChange = useCallback((nextPhase: PhaseId) => {
    setActivePhase(nextPhase);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openChapter = (chapterId: number, forcedPhase?: PhaseId) => {
    const ch = CAMPAIGN_CHAPTERS.find((c) => c.id === chapterId);
    setActiveChapterId(chapterId);
    setActivePhase(forcedPhase ?? 'recon');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    triggerCutIn({
      tag: ch?.code ?? `SEC-${String(chapterId).padStart(2, '0')}`,
      title: `${(ch?.title.en ?? 'SECTOR').toUpperCase()} // ENGAGED`,
      tone: 'cyan',
    });
  };

  return (
    <div className="app-shell">
      <TopBar
        activeChapterId={activeChapterId}
        lang={state.lang}
        onToggleLang={() =>
          setState((p) => ({ ...p, lang: p.lang === 'en' ? 'zh-Hant' : 'en' }))
        }
        muted={muted}
        onToggleMute={() => {
          const next = !muted;
          sound.setMuted(next);
          setMuted(next);
          if (!next) sound.click();
        }}
        unlockedChipsCount={state.unlockedChips.length}
        onBackToMap={() => setActiveChapterId(null)}
        onOpenChips={() => setChipsOpen(true)}
        onToggleGm={() => setGmOpen((v) => !v)}
      />

      {activeChapterId === null && (
        <WorldMap state={state} onDeployChapter={(id) => openChapter(id)} />
      )}

      {activeChapterId === 1 && (
        <Ch01Mission
          lang={state.lang}
          phase={activePhase}
          onPhaseChange={handlePhaseChange}
          progress={getChapterProgress(state, 1)}
          onUpdateProgress={(up) => updateChapterProgress(1, up)}
          onUnlockChip={unlockChip}
          onCutIn={triggerCutIn}
          onOpenChapter={(id) => openChapter(id)}
          onBackToMap={() => setActiveChapterId(null)}
          chaosWaveTrigger={chaosWaveTrigger}
        />
      )}

      {activeChapterId === 2 && (
        <Ch02Mission
          lang={state.lang}
          phase={activePhase}
          onPhaseChange={handlePhaseChange}
          progress={getChapterProgress(state, 2)}
          onUpdateProgress={(up) => updateChapterProgress(2, up)}
          onUnlockChip={unlockChip}
          onCutIn={triggerCutIn}
          onOpenChapter={(id) => openChapter(id)}
          onBackToMap={() => setActiveChapterId(null)}
          chaosWaveTrigger={chaosMarketTrigger}
        />
      )}

      {activeChapterId === 3 && (
        <Ch03Mission
          lang={state.lang}
          phase={activePhase}
          onPhaseChange={handlePhaseChange}
          progress={getChapterProgress(state, 3)}
          onUpdateProgress={(up) => updateChapterProgress(3, up)}
          onUnlockChip={unlockChip}
          onCutIn={triggerCutIn}
          onOpenChapter={(id) => openChapter(id)}
          onBackToMap={() => setActiveChapterId(null)}
          chaosRouteTrigger={chaosRouteTrigger}
        />
      )}

      {activeChapterId === 4 && (
        <Ch04Mission
          lang={state.lang}
          phase={activePhase}
          onPhaseChange={handlePhaseChange}
          progress={getChapterProgress(state, 4)}
          onUpdateProgress={(up) => updateChapterProgress(4, up)}
          onUnlockChip={unlockChip}
          onCutIn={triggerCutIn}
          onOpenChapter={(id) => openChapter(id)}
          onBackToMap={() => setActiveChapterId(null)}
          chaosDroneTrigger={chaosDroneTrigger}
        />
      )}

      {activeChapterId === 5 && (
        <Ch05Mission
          lang={state.lang}
          phase={activePhase}
          onPhaseChange={handlePhaseChange}
          progress={getChapterProgress(state, 5)}
          onUpdateProgress={(up) => updateChapterProgress(5, up)}
          onUnlockChip={unlockChip}
          onCutIn={triggerCutIn}
          onOpenChapter={(id) => openChapter(id)}
          onBackToMap={() => setActiveChapterId(null)}
          chaosChargeTrigger={chaosChargeTrigger}
        />
      )}

      {activeChapterId === 6 && (
        <Ch06Mission
          lang={state.lang}
          phase={activePhase}
          onPhaseChange={handlePhaseChange}
          progress={getChapterProgress(state, 6)}
          onUpdateProgress={(up) => updateChapterProgress(6, up)}
          onUnlockChip={unlockChip}
          onCutIn={triggerCutIn}
          onOpenChapter={(id) => openChapter(id)}
          onBackToMap={() => setActiveChapterId(null)}
          chaosSignalTrigger={chaosSignalTrigger}
        />
      )}

      {activeChapterId === 7 && (
        <Ch07Mission
          lang={state.lang}
          phase={activePhase}
          onPhaseChange={handlePhaseChange}
          progress={getChapterProgress(state, 7)}
          onUpdateProgress={(up) => updateChapterProgress(7, up)}
          onUnlockChip={unlockChip}
          onCutIn={triggerCutIn}
          onBackToMap={() => setActiveChapterId(null)}
          chaosRowsTrigger={chaosRowsTrigger}
        />
      )}

      <ChipBayModal
        open={chipsOpen}
        onClose={() => setChipsOpen(false)}
        unlockedChips={state.unlockedChips}
        lang={state.lang}
      />

      <GmConsole
        open={gmOpen}
        onClose={() => setGmOpen(false)}
        lang={state.lang}
        activeChapterId={activeChapterId}
        activePhase={activePhase}
        state={state}
        onJump={(cid, ph) => {
          openChapter(cid, ph);
          setGmOpen(false);
        }}
        onInjectReactorWave={(wave) =>
          setChaosWaveTrigger((prev) => ({ wave, seq: (prev?.seq ?? 0) + 1 }))
        }
        onInjectMarketWave={(wave) =>
          setChaosMarketTrigger((prev) => ({ wave, seq: (prev?.seq ?? 0) + 1 }))
        }
        onInjectRouteString={(route) =>
          setChaosRouteTrigger((prev) => ({ route, seq: (prev?.seq ?? 0) + 1 }))
        }
        onInjectSentinelDrone={(drone) =>
          setChaosDroneTrigger((prev) => ({ drone, seq: (prev?.seq ?? 0) + 1 }))
        }
        onInjectSurgeCharge={(spec) =>
          setChaosChargeTrigger((prev) => ({ ...spec, seq: (prev?.seq ?? 0) + 1 }))
        }
        onInjectScannerStream={(stream) =>
          setChaosSignalTrigger((prev) => ({ stream, seq: (prev?.seq ?? 0) + 1 }))
        }
        onInjectRadarRows={(rows) =>
          setChaosRowsTrigger((prev) => ({ rows, seq: (prev?.seq ?? 0) + 1 }))
        }
        onImportState={(next) => {
          setState(next);
          setGmOpen(false);
        }}
        onResetAll={() => {
          setState(createInitialState());
          setActiveChapterId(null);
          setGmOpen(false);
        }}
      />

      <CutInBanner cutIn={cutIn} onDone={() => setCutIn(null)} />
    </div>
  );
};

export default App;
