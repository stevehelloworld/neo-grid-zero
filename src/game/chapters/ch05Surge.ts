import { BiText } from '../../engine/i18n/text';
import { RunResult, runMethodCall } from '../../engine/vm';
import { BreachLock } from '../types';

export const CH05_INFINITE_DEMO = `int charge = 0;
while (charge < 12) {
    charge -= 3;
}`;

export const CH05_LOCKS: BreachLock[] = [
  {
    id: 'ch05-lock-1',
    title: { en: 'SURGE LOCK 01 // LOOP COUNT', zh: '電塔鎖 01 // 迴圈執行次數' },
    prompt: {
      en: 'How many times does the loop body execute?',
      zh: '以下迴圈本體總共會執行幾次？',
    },
    code: `for (int i = 1; i <= 5; i += 2) {
    System.out.print(i);
}`,
    options: [
      { en: '3', zh: '3 次' },
      { en: '2', zh: '2 次' },
      { en: '5', zh: '5 次' },
      { en: '6', zh: '6 次' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'i takes values 1, 3, and 5 (all <= 5). Next update sets i = 7, making 7 <= 5 false and stopping the loop after 3 iterations.',
      zh: 'i 依序為 1、3、5，皆符合 <= 5。下一次更新 i 變成 7，條件為 false 停止，共執行 3 次。',
    },
    traceSource: `for (int i = 1; i <= 5; i += 2) {
    System.out.print(i);
}`,
  },
  {
    id: 'ch05-lock-2',
    title: { en: 'SURGE LOCK 02 // SENTINEL STOP', zh: '電塔鎖 02 // 哨兵結束訊號' },
    prompt: {
      en: 'A loop adds sensor readings until the sentinel -1 appears. What total is returned for 4, 7, -1, 20?',
      zh: '迴圈累加讀值直到遇到哨兵值 -1 才停止。輸入 4, 7, -1, 20 時應加總出多少？',
    },
    options: [
      { en: '11', zh: '11' },
      { en: '10', zh: '10' },
      { en: '30', zh: '30' },
      { en: '31', zh: '31' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'A sentinel signals end-of-input: it stops the loop immediately, so -1 and anything after it (20) are never added.',
      zh: '哨兵值用來通知結束讀取，因此 -1 本身與後方的 20 都不會計入總和（4 + 7 = 11）。',
    },
  },
  {
    id: 'ch05-lock-3',
    title: { en: 'SURGE LOCK 03 // FIX NONTERMINATING LOOP', zh: '電塔鎖 03 // 修復無窮迴圈' },
    prompt: {
      en: 'Which replacement inside the loop makes charge reach the target instead of running forever?',
      zh: '將迴圈內的指令換成哪一行，才能讓 charge 正常達標並結束迴圈？',
    },
    code: `int charge = 0;
while (charge < 12) {
    charge -= 3;
}`,
    options: [
      { en: 'charge += 3;', zh: 'charge += 3;' },
      { en: 'charge = 3;', zh: 'charge = 3;' },
      { en: 'charge -= 6;', zh: 'charge -= 6;' },
      { en: 'charge = charge;', zh: 'charge = charge;' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'charge must move toward the termination condition (charge >= 12). Increasing by 3 each step guarantees termination at 12.',
      zh: '迴圈更新必須朝終止條件前進。每次增加 3 會讓 charge 在 12 時使 charge < 12 變成 false。',
    },
  },
];

export const CH05_STARTER_CODE = `static int rounds(int start, int gain, int target) {
    // start >= 0, gain > 0. Return 0 if start already >= target.
    return 0;
}`;

export interface Ch05TrialSpec {
  id: string;
  start: number;
  gain: number;
  target: number;
  expected: number;
}

export const CH05_WAVES: Ch05TrialSpec[][] = [
  [
    { id: 'c5-w1-1', start: 3, gain: 4, target: 15, expected: 3 },
    { id: 'c5-w1-2', start: 0, gain: 5, target: 20, expected: 4 },
    { id: 'c5-w1-3', start: 10, gain: 2, target: 16, expected: 3 },
  ],
  [
    { id: 'c5-w2-1', start: 3, gain: 4, target: 14, expected: 3 },
    { id: 'c5-w2-2', start: 1, gain: 6, target: 15, expected: 3 },
    { id: 'c5-w2-3', start: 2, gain: 10, target: 5, expected: 1 },
  ],
  [
    { id: 'c5-w3-1', start: 15, gain: 4, target: 15, expected: 0 },
    { id: 'c5-w3-2', start: 20, gain: 4, target: 15, expected: 0 },
    { id: 'c5-w3-3', start: 0, gain: 1, target: 7, expected: 7 },
  ],
];

export interface Ch05TrialResult {
  spec: Ch05TrialSpec;
  waveIndex: number;
  actual: number | null;
  passed: boolean;
  run: RunResult;
}

export interface Ch05BattleResult {
  passed: boolean;
  wavesCleared: number;
  totalWaves: number;
  trials: Ch05TrialResult[];
  failedTrial?: Ch05TrialResult;
}

export function expectedRounds(start: number, gain: number, target: number): number {
  if (start >= target || gain <= 0) return 0;
  return Math.ceil((target - start) / gain);
}

export function evaluateSurgeBattle(
  source: string,
  custom?: Ch05TrialSpec,
): Ch05BattleResult {
  const waves = custom ? [[custom]] : CH05_WAVES;
  const trials: Ch05TrialResult[] = [];
  let wavesCleared = 0;
  let failedTrial: Ch05TrialResult | undefined;

  for (let w = 0; w < waves.length; w++) {
    let waveOk = true;
    for (const spec of waves[w]) {
      const run = runMethodCall(source, 'rounds', [spec.start, spec.gain, spec.target], {
        maxSteps: 600,
      });
      const actual = run.ok && run.returnValue?.type === 'int' ? Number(run.returnValue.value) : null;
      const passed = run.ok && actual === spec.expected;
      const tr: Ch05TrialResult = { spec, waveIndex: w, actual, passed, run };
      trials.push(tr);
      if (!passed) {
        waveOk = false;
        if (!failedTrial) failedTrial = tr;
      }
    }
    if (waveOk && !failedTrial) wavesCleared++;
    else break;
  }

  return {
    passed: !failedTrial && wavesCleared === waves.length,
    wavesCleared,
    totalWaves: waves.length,
    trials,
    failedTrial,
  };
}

export const CH05_TUTOR_PROMPTS: Record<string, BiText[]> = {
  recon: [
    {
      en: 'Why does the while loop stop at 15 instead of exactly 14 when charging from 3 by +4?',
      zh: '從 3 每次加 4 到目標 14 時，為什麼會在 15 停下來而不是停在 14？',
    },
  ],
  breach: [
    {
      en: 'Why do we check a sentinel value before adding it into the accumulator?',
      zh: '為什麼必須在加總進 accumulator 之前先檢查是不是哨兵值 -1？',
    },
  ],
  battle: [
    {
      en: 'Why does Wave 3 test start == target and start > target? What should rounds() return without entering the loop?',
      zh: '第 3 波為什麼要測 start == target 與 start > target？while 迴圈零次都不進去時應該回傳什麼？',
    },
  ],
  debrief: [
    {
      en: 'Scrub a trial in Time-Travel Trace and ask the student to count how many times the while condition evaluates to TRUE vs FALSE.',
      zh: '用時間軸追蹤任一輪充電測試，請學生數一數 while 條件總共判定了幾次 TRUE、幾次 FALSE。',
    },
  ],
};
