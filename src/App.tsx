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
  const [guideSeq, setGuideSeq] = useState(0);
  const [suppressAutoBriefing, setSuppressAutoBriefing] = useState(false);

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
    setSuppressAutoBriefing(false);
    setActivePhase(nextPhase);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openChapter = (chapterId: number, forcedPhase?: PhaseId, fromGm = false) => {
    const ch = CAMPAIGN_CHAPTERS.find((c) => c.id === chapterId);
    setSuppressAutoBriefing(fromGm);
    setActiveChapterId(chapterId);
    setActivePhase(forcedPhase ?? 'recon');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    triggerCutIn({
      tag: ch?.code ?? `SEC-${String(chapterId).padStart(2, '0')}`,
      title: `${(ch?.title.en ?? 'SECTOR').toUpperCase()} // ENGAGED`,
      tone: 'cyan',
    });
  };

  const activeProgress =
    activeChapterId !== null ? getChapterProgress(state, activeChapterId) : null;
  const activeBattleComplete = activeProgress
    ? Boolean(activeProgress.rank || activeProgress.completedPhases.includes('battle'))
    : false;

  const sharedMissionProps = {
    lang: state.lang,
    phase: activePhase,
    onPhaseChange: handlePhaseChange,
    onUnlockChip: unlockChip,
    onCutIn: triggerCutIn,
    onBackToMap: () => setActiveChapterId(null),
    skipBriefings: Boolean(state.skipBriefings),
    onToggleSkipBriefings: (next: boolean) =>
      setState((p) => ({ ...p, skipBriefings: next })),
    guideRequestSeq: guideSeq,
    suppressAutoBriefing,
  };

  return (
    <div className="app-shell">
      <TopBar
        activeChapterId={activeChapterId}
        activePhase={activePhase}
        activeProgress={activeProgress}
        battleComplete={activeBattleComplete}
        onPhaseChange={handlePhaseChange}
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
        onOpenGuide={() => setGuideSeq((s) => s + 1)}
        onToggleGm={() => setGmOpen((v) => !v)}
      />

      {activeChapterId === null && (
        <WorldMap
          state={state}
          guideRequestSeq={guideSeq}
          onMarkWelcomeSeen={() =>
            setState((p) => (p.seenWelcome ? p : { ...p, seenWelcome: true }))
          }
          onDeployChapter={(id) => openChapter(id)}
        />
      )}

      {activeChapterId === 1 && (
        <Ch01Mission
          {...sharedMissionProps}
          progress={getChapterProgress(state, 1)}
          onUpdateProgress={(up) => updateChapterProgress(1, up)}
          onOpenChapter={(id) => openChapter(id)}
          chaosWaveTrigger={chaosWaveTrigger}
        />
      )}

      {activeChapterId === 2 && (
        <Ch02Mission
          {...sharedMissionProps}
          progress={getChapterProgress(state, 2)}
          onUpdateProgress={(up) => updateChapterProgress(2, up)}
          onOpenChapter={(id) => openChapter(id)}
          chaosWaveTrigger={chaosMarketTrigger}
        />
      )}

      {activeChapterId === 3 && (
        <Ch03Mission
          {...sharedMissionProps}
          progress={getChapterProgress(state, 3)}
          onUpdateProgress={(up) => updateChapterProgress(3, up)}
          onOpenChapter={(id) => openChapter(id)}
          chaosRouteTrigger={chaosRouteTrigger}
        />
      )}

      {activeChapterId === 4 && (
        <Ch04Mission
          {...sharedMissionProps}
          progress={getChapterProgress(state, 4)}
          onUpdateProgress={(up) => updateChapterProgress(4, up)}
          onOpenChapter={(id) => openChapter(id)}
          chaosDroneTrigger={chaosDroneTrigger}
        />
      )}

      {activeChapterId === 5 && (
        <Ch05Mission
          {...sharedMissionProps}
          progress={getChapterProgress(state, 5)}
          onUpdateProgress={(up) => updateChapterProgress(5, up)}
          onOpenChapter={(id) => openChapter(id)}
          chaosChargeTrigger={chaosChargeTrigger}
        />
      )}

      {activeChapterId === 6 && (
        <Ch06Mission
          {...sharedMissionProps}
          progress={getChapterProgress(state, 6)}
          onUpdateProgress={(up) => updateChapterProgress(6, up)}
          onOpenChapter={(id) => openChapter(id)}
          chaosSignalTrigger={chaosSignalTrigger}
        />
      )}

      {activeChapterId === 7 && (
        <Ch07Mission
          {...sharedMissionProps}
          progress={getChapterProgress(state, 7)}
          onUpdateProgress={(up) => updateChapterProgress(7, up)}
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
          openChapter(cid, ph, true);
          setGmOpen(false);
        }}
        onInjectReactorWave={(wave) => {
          setSuppressAutoBriefing(true);
          setChaosWaveTrigger((prev) => ({ wave, seq: (prev?.seq ?? 0) + 1 }));
        }}
        onInjectMarketWave={(wave) => {
          setSuppressAutoBriefing(true);
          setChaosMarketTrigger((prev) => ({ wave, seq: (prev?.seq ?? 0) + 1 }));
        }}
        onInjectRouteString={(route) => {
          setSuppressAutoBriefing(true);
          setChaosRouteTrigger((prev) => ({ route, seq: (prev?.seq ?? 0) + 1 }));
        }}
        onInjectSentinelDrone={(drone) => {
          setSuppressAutoBriefing(true);
          setChaosDroneTrigger((prev) => ({ drone, seq: (prev?.seq ?? 0) + 1 }));
        }}
        onInjectSurgeCharge={(spec) => {
          setSuppressAutoBriefing(true);
          setChaosChargeTrigger((prev) => ({ ...spec, seq: (prev?.seq ?? 0) + 1 }));
        }}
        onInjectScannerStream={(stream) => {
          setSuppressAutoBriefing(true);
          setChaosSignalTrigger((prev) => ({ stream, seq: (prev?.seq ?? 0) + 1 }));
        }}
        onInjectRadarRows={(rows) => {
          setSuppressAutoBriefing(true);
          setChaosRowsTrigger((prev) => ({ rows, seq: (prev?.seq ?? 0) + 1 }));
        }}
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
