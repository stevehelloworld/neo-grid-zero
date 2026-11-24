import { Lang } from '../engine/i18n/text';
import { PhaseId } from './types';

export type RankGrade = 'S' | 'A' | 'B';

export interface ChapterProgress {
  rank?: RankGrade;
  completedPhases: PhaseId[];
  reconDone: boolean;
  breachCleared: boolean;
  breachMistakes: number;
  battleMistakes: number;
  codeDrafts: Record<string, string>;
  encounterCleared: Record<string, boolean>;
}

export interface CampaignState {
  version: 1;
  lang: Lang;
  seenWelcome?: boolean;
  skipBriefings?: boolean;
  unlockedChips: string[];
  chapters: Record<number, ChapterProgress>;
}

const STORAGE_KEY = 'neo-grid-zero-v1';

export function defaultChapterProgress(): ChapterProgress {
  return {
    completedPhases: [],
    reconDone: false,
    breachCleared: false,
    breachMistakes: 0,
    battleMistakes: 0,
    codeDrafts: {},
    encounterCleared: {},
  };
}

export function createInitialState(): CampaignState {
  return {
    version: 1,
    lang: 'en',
    seenWelcome: false,
    skipBriefings: false,
    unlockedChips: [],
    chapters: {},
  };
}

export function loadCampaignState(): CampaignState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as Partial<CampaignState>;
    if (!parsed || typeof parsed !== 'object') return createInitialState();
    return {
      version: 1,
      lang: parsed.lang === 'zh-Hant' ? 'zh-Hant' : 'en',
      seenWelcome: Boolean(parsed.seenWelcome),
      skipBriefings: Boolean(parsed.skipBriefings),
      unlockedChips: Array.isArray(parsed.unlockedChips) ? parsed.unlockedChips : [],
      chapters: parsed.chapters && typeof parsed.chapters === 'object' ? parsed.chapters : {},
    };
  } catch {
    return createInitialState();
  }
}

export function saveCampaignState(state: CampaignState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function getChapterProgress(state: CampaignState, chapterId: number): ChapterProgress {
  return {
    ...defaultChapterProgress(),
    ...(state.chapters[chapterId] ?? {}),
  };
}

export function computeRank(breachMistakes: number, battleMistakes: number): RankGrade {
  const total = breachMistakes + battleMistakes;
  if (total === 0) return 'S';
  if (total <= 2) return 'A';
  return 'B';
}
