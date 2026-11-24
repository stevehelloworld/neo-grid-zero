import { BiText } from '../../engine/i18n/text';
import { RunResult, runMethodCall } from '../../engine/vm';
import { BreachLock } from '../types';

export const CH06_LOCKS: BreachLock[] = [
  {
    id: 'ch06-lock-1',
    title: { en: 'SCANNER LOCK 01 // DIGIT PEELING', zh: '掃描鎖 01 // 拆解末位數字' },
    prompt: {
      en: 'What are digit and n after these statements execute?',
      zh: '以下指令執行完畢後，digit 與 n 分別是什麼？',
    },
    code: `int n = 472;
int digit = n % 10;
n = n / 10;`,
    options: [
      { en: 'digit = 2, n = 47', zh: 'digit = 2, n = 47' },
      { en: 'digit = 47, n = 2', zh: 'digit = 47, n = 2' },
      { en: 'digit = 4, n = 72', zh: 'digit = 4, n = 72' },
      { en: 'digit = 2, n = 47.2', zh: 'digit = 2, n = 47.2' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'n % 10 extracts the ones digit (2), and integer division n / 10 drops that final digit to leave 47.',
      zh: 'n % 10 取出個位數 2，接著整數除法 n / 10 移除最後一位變成 47。',
    },
    traceSource: `int n = 472;
int digit = n % 10;
n = n / 10;`,
  },
  {
    id: 'ch06-lock-2',
    title: { en: 'SCANNER LOCK 02 // DUAL COUNTERS', zh: '掃描鎖 02 // 雙計數器追蹤' },
    prompt: {
      en: 'For the signal stream "OOXOOO", what is the longest consecutive run of O?',
      zh: '訊號串流 "OOXOOO" 中，最長的連續 O 有多長？',
    },
    options: [
      { en: '3', zh: '3' },
      { en: '2', zh: '2' },
      { en: '5', zh: '5' },
      { en: '6', zh: '6' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'X resets the current run back to 0, while best keeps 2 and later updates to 3 on the final triple OOO.',
      zh: '遇到 X 會把當前長度重設為 0，而 best 會保留先前的 2，並在最後一段 OOO 更新為 3。',
    },
  },
  {
    id: 'ch06-lock-3',
    title: { en: 'SCANNER LOCK 03 // NEGATIVE-PROOF MAX', zh: '掃描鎖 03 // 全負數最大值初值' },
    prompt: {
      en: 'What is the safest initial maximum when a non-empty array can hold negative integers?',
      zh: '當非空陣列可能全部都是負數時，最大值最安全的初始值為何？',
    },
    options: [
      { en: 'values[0]', zh: 'values[0]' },
      { en: '0', zh: '0' },
      { en: 'values.length', zh: 'values.length' },
      { en: '1', zh: '1' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'Initializing max = 0 fails when all readings are negative (like {-4, -2, -9}). Starting at values[0] guarantees a valid element.',
      zh: '若把初值設為 0，全負數陣列會誤判最大值為 0；以 values[0] 作為起點才一定有效。',
    },
  },
  {
    id: 'ch06-lock-4',
    title: { en: 'SCANNER LOCK 04 // FLOATING AVERAGE', zh: '掃描鎖 04 // 避免平均截斷' },
    prompt: {
      en: 'sum is 11 and count is 4. Which expression produces 2.75?',
      zh: 'sum 為 11、count 為 4，哪個運算式能算出 2.75？',
    },
    options: [
      { en: '(double) sum / count', zh: '(double) sum / count' },
      { en: '(double) (sum / count)', zh: '(double) (sum / count)' },
      { en: 'sum / count', zh: 'sum / count' },
      { en: '(int) sum / count', zh: '(int) sum / count' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'Cast sum to double BEFORE dividing. Casting (sum / count) afterward turns an already-truncated 2 into 2.0.',
      zh: '除法前先將 sum 轉型為 double；先除再轉型只會把截斷後的 2 變成 2.0。',
    },
  },
];

export const CH06_STARTER_CODE = `static int longestRun(String readings) {
    // readings contains only "O" and "X" (or may be empty "")
    // Return the longest consecutive run of "O" in a single pass
    return 0;
}`;

export interface Ch06TrialSpec {
  id: string;
  stream: string;
  expected: number;
}

export const CH06_WAVES: Ch06TrialSpec[][] = [
  [
    { id: 'c6-w1-1', stream: 'OOXOOO', expected: 3 },
    { id: 'c6-w1-2', stream: 'OOOOXXO', expected: 4 },
    { id: 'c6-w1-3', stream: 'XOXXOOX', expected: 2 },
  ],
  [
    { id: 'c6-w2-1', stream: 'XOOOOO', expected: 5 },
    { id: 'c6-w2-2', stream: 'O', expected: 1 },
    { id: 'c6-w2-3', stream: 'OOOO', expected: 4 },
  ],
  [
    { id: 'c6-w3-1', stream: 'XXX', expected: 0 },
    { id: 'c6-w3-2', stream: '', expected: 0 },
    { id: 'c6-w3-3', stream: 'OXOXOXO', expected: 1 },
  ],
];

export interface Ch06TrialResult {
  spec: Ch06TrialSpec;
  waveIndex: number;
  actual: number | null;
  passed: boolean;
  run: RunResult;
}

export interface Ch06BattleResult {
  passed: boolean;
  wavesCleared: number;
  totalWaves: number;
  trials: Ch06TrialResult[];
  failedTrial?: Ch06TrialResult;
}

export function expectedLongestRun(readings: string): number {
  let cur = 0;
  let best = 0;
  for (const ch of readings) {
    if (ch === 'O') {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return best;
}

export function evaluateScannerBattle(
  source: string,
  custom?: Ch06TrialSpec,
): Ch06BattleResult {
  const waves = custom ? [[custom]] : CH06_WAVES;
  const trials: Ch06TrialResult[] = [];
  let wavesCleared = 0;
  let failedTrial: Ch06TrialResult | undefined;

  for (let w = 0; w < waves.length; w++) {
    let waveOk = true;
    for (const spec of waves[w]) {
      const run = runMethodCall(source, 'longestRun', [spec.stream], { maxSteps: 800 });
      const actual = run.ok && run.returnValue?.type === 'int' ? Number(run.returnValue.value) : null;
      const passed = run.ok && actual === spec.expected;
      const tr: Ch06TrialResult = { spec, waveIndex: w, actual, passed, run };
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

export const CH06_TUTOR_PROMPTS: Record<string, BiText[]> = {
  recon: [
    {
      en: 'Point to where current resets on X and explain why best must remain untouched during that reset.',
      zh: '指出遇到 X 時 current 在哪裡歸零，並說明為什麼 best 不能跟著歸零。',
    },
  ],
  breach: [
    {
      en: 'Why does substring(i, i + 1) never go out of bounds when i < readings.length()?',
      zh: '為什麼當 i < readings.length() 時，readings.substring(i, i + 1) 永遠不會越界？',
    },
  ],
  battle: [
    {
      en: 'What happens to a solution that only updates best inside the else branch when the best streak reaches the very end ("OOXOOO")?',
      zh: '如果只在遇到 X 的 else 分支才更新 best，面對最長區間在結尾的 "OOXOOO" 會發生什麼錯誤？',
    },
  ],
  debrief: [
    {
      en: 'Scrub through "OOXOOO" and track i, current, and best at every step.',
      zh: '用時間軸走訪 "OOXOOO"，觀察每一步 i、current 與 best 的對應值。',
    },
  ],
};
