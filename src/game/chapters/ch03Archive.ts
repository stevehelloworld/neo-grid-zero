import { BiText } from '../../engine/i18n/text';
import { RunResult, runMethodCall } from '../../engine/vm';
import { BreachLock } from '../types';

export const CH03_LOCKS: BreachLock[] = [
  {
    id: 'ch03-lock-1',
    title: { en: 'ARCHIVE LOCK 01 // ZERO-INDEXED SUBSTRING', zh: '檔案鎖 01 // 零起始子字串切片' },
    prompt: {
      en: 'Remember substring(begin, end) includes begin and excludes end. What is printed?',
      zh: '記得 substring(begin, end) 包含 begin 但不包含 end。程式會印出什麼？',
    },
    code: `String s = "DRONE";
String part = s.substring(1, 4);
System.out.println(part);`,
    options: [
      { en: 'RON', zh: 'RON' },
      { en: 'RONE', zh: 'RONE' },
      { en: 'DRO', zh: 'DRO' },
      { en: 'DRON', zh: 'DRON' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'Indexes in "DRONE": D=0, R=1, O=2, N=3, E=4. substring(1, 4) copies indexes 1, 2, and 3 ("RON") and stops before index 4.',
      zh: '"DRONE" 索引為 D=0, R=1, O=2, N=3, E=4。substring(1, 4) 只取索引 1, 2, 3（即 "RON"），不含索引 4。',
    },
    traceSource: `String s = "DRONE";
String part = s.substring(1, 4);
System.out.println(part);`,
  },
  {
    id: 'ch03-lock-2',
    title: { en: 'ARCHIVE LOCK 02 // IMMUTABLE STRING', zh: '檔案鎖 02 // 字串不可變性' },
    prompt: {
      en: 'String objects cannot be modified in place. Which line keeps the shortened text in label?',
      zh: 'String 物件不可直接原地修改。哪一行才能真正把縮短後的文字存回 label？',
    },
    code: `String label = "dockyard";
// keep "dock" inside label`,
    options: [
      { en: 'label = label.substring(0, 4);', zh: 'label = label.substring(0, 4);' },
      { en: 'label.substring(0, 4);', zh: 'label.substring(0, 4);' },
      { en: 'label[0] = "d";', zh: 'label[0] = "d";' },
      { en: 'label = label.length();', zh: 'label = label.length();' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'Calling label.substring(0, 4); alone discards the returned String. Assigning it back to label stores the new value.',
      zh: '只呼叫 label.substring(0, 4); 而不接回傳值會讓原字串保持不變；必須寫 label = ... 才會更新變數。',
    },
  },
  {
    id: 'ch03-lock-3',
    title: { en: 'ARCHIVE LOCK 03 // MATH.RANDOM RANGE', zh: '檔案鎖 03 // Math.random 範圍換算' },
    prompt: {
      en: 'Which values can roll produce?',
      zh: '以下程式碼執行後，roll 可能是哪個範圍的值？',
    },
    code: `int roll = (int) (Math.random() * 6) + 1;`,
    options: [
      { en: '1 through 6, inclusive', zh: '1 到 6（含 1 與 6）' },
      { en: '0 through 5, inclusive', zh: '0 到 5（含 0 與 5）' },
      { en: '1 through 7, inclusive', zh: '1 到 7（含 1 與 7）' },
      { en: '0 through 6, inclusive', zh: '0 到 6（含 0 與 6）' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'Math.random() returns [0.0, 1.0). Multiplying by 6 gives [0.0, 6.0), (int) truncates to 0..5, and + 1 shifts to 1..6.',
      zh: 'Math.random() 範圍是 [0.0, 1.0)，乘以 6 得 [0.0, 6.0)，轉為 (int) 後為 0..5，加 1 後即為 1..6。',
    },
  },
];

export const CH03_INITIALS_STARTER = `static String initials(String first, String last) {
    // Return "F.L." preserving original case (both inputs non-empty)
    return "";
}`;

export const CH03_ROUTE_STARTER = `static String routeSuffix(String route) {
    // route contains exactly one "-" and at least one character after it
    // Return the substring after the hyphen
    return "";
}`;

export interface Ch03TrialResult {
  label: string;
  waveIndex: number;
  passed: boolean;
  actual: string;
  expected: string;
  run: RunResult;
}

export interface Ch03EncounterResult {
  encounterId: 'initials' | 'route';
  passed: boolean;
  wavesCleared: number;
  totalWaves: number;
  trials: Ch03TrialResult[];
  failedTrial?: Ch03TrialResult;
}

export function evaluateInitialsEncounter(source: string): Ch03EncounterResult {
  const waves = [
    [
      { args: ['Ada', 'Lovelace'], expected: 'A.L.', label: 'Ada + Lovelace' },
      { args: ['q', 'z'], expected: 'q.z.', label: 'q + z' },
    ],
    [
      { args: ['grace', 'Hopper'], expected: 'g.H.', label: 'grace + Hopper' },
      { args: ['Neo', 'Grid'], expected: 'N.G.', label: 'Neo + Grid' },
    ],
  ];

  const trials: Ch03TrialResult[] = [];
  let wavesCleared = 0;
  let failedTrial: Ch03TrialResult | undefined;

  for (let w = 0; w < waves.length; w++) {
    let waveOk = true;
    for (const item of waves[w]) {
      const run = runMethodCall(source, 'initials', item.args);
      const actual = run.ok && run.returnValue?.type === 'String' ? String(run.returnValue.value) : 'ERROR';
      const passed = run.ok && actual === item.expected;
      const tr: Ch03TrialResult = { label: item.label, waveIndex: w, passed, actual, expected: item.expected, run };
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
    encounterId: 'initials',
    passed: !failedTrial && wavesCleared === waves.length,
    wavesCleared,
    totalWaves: waves.length,
    trials,
    failedTrial,
  };
}

export function evaluateRouteEncounter(source: string, customRoute?: string): Ch03EncounterResult {
  const waves = customRoute
    ? [[{ route: customRoute, expected: customRoute.slice(customRoute.indexOf('-') + 1) }]]
    : [
        [
          { route: 'west-42', expected: '42' },
          { route: 'north-9', expected: '9' },
        ],
        [
          { route: 'A-7', expected: '7' },
          { route: 'sector-alpha', expected: 'alpha' },
        ],
        [
          { route: 'core-001', expected: '001' },
          { route: 'x-Z', expected: 'Z' },
        ],
      ];

  const trials: Ch03TrialResult[] = [];
  let wavesCleared = 0;
  let failedTrial: Ch03TrialResult | undefined;

  for (let w = 0; w < waves.length; w++) {
    let waveOk = true;
    for (const item of waves[w]) {
      const run = runMethodCall(source, 'routeSuffix', [item.route]);
      const actual = run.ok && run.returnValue?.type === 'String' ? String(run.returnValue.value) : 'ERROR';
      const passed = run.ok && actual === item.expected;
      const tr: Ch03TrialResult = { label: item.route, waveIndex: w, passed, actual, expected: item.expected, run };
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
    encounterId: 'route',
    passed: !failedTrial && wavesCleared === waves.length,
    wavesCleared,
    totalWaves: waves.length,
    trials,
    failedTrial,
  };
}

export const CH03_TUTOR_PROMPTS: Record<string, BiText[]> = {
  recon: [
    {
      en: 'Why does substring(1, 4) return 3 characters instead of 4? How does end - begin give the slice length?',
      zh: '為什麼 substring(1, 4) 回傳 3 個字元而不是 4 個？end - begin 和切片長度有什麼關係？',
    },
  ],
  breach: [
    {
      en: 'Ask the student why s.substring(0, 3); alone does not modify s.',
      zh: '請學生解釋為什麼單獨寫 s.substring(0, 3); 不會改變原來的 s。',
    },
  ],
  battle: [
    {
      en: 'In routeSuffix, why is indexOf("-") + 1 better than hardcoding substring(5)?',
      zh: '在 routeSuffix 中，為什麼 indexOf("-") + 1 比寫死 substring(5) 更泛用？',
    },
  ],
  debrief: [
    {
      en: 'Have the student test a one-character prefix like "A-7" and trace dash index + 1.',
      zh: '請學生用 "A-7" 這類單字元前綴追蹤一次 dash 的位置與 dash + 1 的結果。',
    },
  ],
};
