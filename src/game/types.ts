import { BiText } from '../engine/i18n/text';
import { RunResult } from '../engine/vm';

export type PhaseId = 'recon' | 'breach' | 'battle' | 'debrief';

export interface ChapterMeta {
  id: number;
  act: 1 | 2 | 3 | 4 | 5;
  code: string;
  title: BiText;
  topic: BiText;
  summary: BiText;
  chipId: string;
  chipName: string;
  chipSyntax: string;
  chipDesc: BiText;
  bossName: BiText;
  mapPos: { x: number; y: number };
  playable: boolean;
}

export interface BreachLock {
  id: string;
  title: BiText;
  prompt: BiText;
  code?: string;
  options: BiText[];
  correctIndex: number;
  explanation: BiText;
  traceSource?: string;
}

export interface Ch01EncounterResult {
  encounterId: 'swap' | 'reactor';
  passed: boolean;
  wavesCleared: number;
  totalWaves: number;
  waveDetails: Array<{
    waveIndex: number;
    label: BiText;
    passed: boolean;
    checks: Array<{ label: BiText; ok: boolean }>;
    run: RunResult;
  }>;
  primaryRun: RunResult;
}

export interface DroneSpec {
  id: string;
  callsign: string;
  age: number;
  trained: boolean;
  mentor: boolean;
  expected: 'CLEAR' | 'PRACTICE' | 'WAIT';
}

export interface DroneFlightResult {
  drone: DroneSpec;
  waveIndex: number;
  actual: string;
  passed: boolean;
  run: RunResult;
}

export interface SentinelBattleResult {
  passed: boolean;
  wavesCleared: number;
  totalWaves: number;
  flights: DroneFlightResult[];
  failedFlight?: DroneFlightResult;
}
