import { BiText } from '../../engine/i18n/text';
import { RunResult, runMethodCall } from '../../engine/vm';
import { BreachLock } from '../types';

export const CH07_LOCKS: BreachLock[] = [
  {
    id: 'ch07-lock-1',
    title: { en: 'RADAR LOCK 01 // RECTANGULAR GRID', zh: '雷達鎖 01 // 矩形巢狀次數' },
    prompt: {
      en: 'How many total times does System.out.print("#") execute?',
      zh: '以下巢狀迴圈總共會印出幾個 # 符號？',
    },
    code: `for (int r = 0; r < 3; r++) {
    for (int c = 0; c < 4; c++) {
        System.out.print("#");
    }
}`,
    options: [
      { en: '12', zh: '12' },
      { en: '7', zh: '7' },
      { en: '9', zh: '9' },
      { en: '16', zh: '16' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'Each of the 3 outer rows runs the independent inner loop 4 times: 3 × 4 = 12 prints.',
      zh: '外層執行 3 列，每一列都獨立執行 4 次內層迴圈，總計 3 × 4 = 12 次。',
    },
    traceSource: `for (int r = 0; r < 3; r++) {
    for (int c = 0; c < 4; c++) {
        System.out.print("#");
    }
}`,
  },
  {
    id: 'ch07-lock-2',
    title: { en: 'RADAR LOCK 02 // TRIANGULAR TRACE', zh: '雷達鎖 02 // 三角形遞增次數' },
    prompt: {
      en: 'How many # symbols print in total when the inner bound depends on r?',
      zh: '當內層迴圈上限與外層 r 連動時，總共會印出幾個 #？',
    },
    code: `for (int r = 1; r <= 4; r++) {
    for (int c = 1; c <= r; c++) {
        System.out.print("#");
    }
}`,
    options: [
      { en: '10', zh: '10' },
      { en: '4', zh: '4' },
      { en: '8', zh: '8' },
      { en: '16', zh: '16' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'Row 1 prints 1, row 2 prints 2, row 3 prints 3, row 4 prints 4: 1 + 2 + 3 + 4 = 10.',
      zh: '每列執行次數依序為 1 + 2 + 3 + 4 = 10。',
    },
    traceSource: `for (int r = 1; r <= 4; r++) {
    for (int c = 1; c <= r; c++) {
        System.out.print("#");
    }
}`,
  },
  {
    id: 'ch07-lock-3',
    title: { en: 'RADAR LOCK 03 // QUADRATIC SCALING', zh: '雷達鎖 03 // 平方級工作量成長' },
    prompt: {
      en: 'When n doubles in an n by n nested traversal, about how many times as many cell visits occur?',
      zh: '在 n × n 雙層走訪中，當 n 變成原本的 2 倍時，走訪格數約會變成幾倍？',
    },
    options: [
      { en: '4×', zh: '4 倍' },
      { en: '2×', zh: '2 倍' },
      { en: '3×', zh: '3 倍' },
      { en: '8×', zh: '8 倍' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'Both rows and columns double, so total work scales by (2n) × (2n) = 4n² — four times as many steps.',
      zh: '列數與欄數同時加倍，總運算次數變成 (2n) × (2n) = 4n²，也就是 4 倍。',
    },
  },
];

export const CH07_STARTER_CODE = `static String sweep(int rows) {
    // Return rows lines: line r (from 1..rows) has r "#" characters.
    // Join lines with "\\n" and omit any trailing newline.
    // sweep(0) should return ""
    return "";
}`;

export function expectedSweep(rows: number): string {
  const lines: string[] = [];
  for (let r = 1; r <= rows; r++) {
    lines.push('#'.repeat(r));
  }
  return lines.join('\n');
}

export interface Ch07TrialSpec {
  id: string;
  rows: number;
  expected: string;
}

export const CH07_WAVES: Ch07TrialSpec[][] = [
  [
    { id: 'c7-w1-1', rows: 3, expected: expectedSweep(3) },
    { id: 'c7-w1-2', rows: 2, expected: expectedSweep(2) },
  ],
  [
    { id: 'c7-w2-1', rows: 4, expected: expectedSweep(4) },
    { id: 'c7-w2-2', rows: 5, expected: expectedSweep(5) },
  ],
  [
    { id: 'c7-w3-1', rows: 1, expected: expectedSweep(1) },
    { id: 'c7-w3-2', rows: 0, expected: expectedSweep(0) },
  ],
];

export interface Ch07TrialResult {
  spec: Ch07TrialSpec;
  waveIndex: number;
  actual: string | null;
  passed: boolean;
  run: RunResult;
}

export interface Ch07BattleResult {
  passed: boolean;
  wavesCleared: number;
  totalWaves: number;
  trials: Ch07TrialResult[];
  failedTrial?: Ch07TrialResult;
}

export function evaluateRadarBattle(
  source: string,
  customRows?: number,
): Ch07BattleResult {
  const waves: Ch07TrialSpec[][] =
    customRows !== undefined
      ? [[{ id: `gm-${customRows}`, rows: customRows, expected: expectedSweep(customRows) }]]
      : CH07_WAVES;
  const trials: Ch07TrialResult[] = [];
  let wavesCleared = 0;
  let failedTrial: Ch07TrialResult | undefined;

  for (let w = 0; w < waves.length; w++) {
    let waveOk = true;
    for (const spec of waves[w]) {
      const run = runMethodCall(source, 'sweep', [spec.rows], { maxSteps: 1200 });
      const actual = run.ok && run.returnValue?.type === 'String' ? String(run.returnValue.value) : null;
      const passed = run.ok && actual === spec.expected;
      const tr: Ch07TrialResult = { spec, waveIndex: w, actual, passed, run };
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

export const CH07_TUTOR_PROMPTS: Record<string, BiText[]> = {
  recon: [
    {
      en: 'Compare Rectangular (n × n) vs Triangular (c <= r) visits as n grows from 3 to 6.',
      zh: '比較矩形 (n × n) 與三角形 (c <= r) 在 n 從 3 變 6 時，走訪次數如何成長。',
    },
  ],
  breach: [
    {
      en: 'Why does changing c < 4 to c <= r transform the output shape AND total print count?',
      zh: '把內層上限從固定常數 c < 4 改成與外層連動的 c <= r，會如何同時改變圖形與執行次數？',
    },
  ],
  battle: [
    {
      en: 'Why does AP CSA often require omitting the final trailing newline? How can an if (r < rows) check prevent it?',
      zh: '為什麼許多字串圖形題禁止最後一行多出換行？除了 if (r < rows) 還有什麼寫法？',
    },
  ],
  debrief: [
    {
      en: 'Have the student trace sweep(3) line-by-line and explain the inner loop restart at each outer iteration.',
      zh: '請學生逐步追蹤 sweep(3)，說明外層每進下一列時，內層變數 c 如何重新初始化。',
    },
  ],
};
