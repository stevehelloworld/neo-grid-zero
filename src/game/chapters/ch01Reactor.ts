import { BiText } from '../../engine/i18n/text';
import { runStatements } from '../../engine/vm';
import { BreachLock, Ch01EncounterResult } from '../types';

export const CH01_LOCKS: BreachLock[] = [
  {
    id: 'ch01-lock-1',
    title: { en: 'SIGNAL LOCK 01 // STALE SNAPSHOT', zh: '訊號鎖 01 // 過期快照追蹤' },
    prompt: {
      en: 'Predict both printed numbers without running. Supply and usage change mid-program.',
      zh: '不執行程式，預測兩行 System.out.println 依序印出的數字。',
    },
    code: `int energy = 120;
int used = 35;
int remaining = energy - used;
energy = 150;
used = used + 10;
System.out.println(remaining);
remaining = energy - used;
System.out.println(remaining);`,
    options: [
      { en: '85 then 105', zh: '先印 85，再印 105' },
      { en: '85 then 85', zh: '先印 85，再印 85' },
      { en: '105 then 105', zh: '先印 105，再印 105' },
      { en: '65 then 105', zh: '先印 65，再印 105' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'Line 3 stores 120 - 35 = 85 in remaining. Updating energy and used does NOT recompute remaining until line 7 executes: 150 - 45 = 105.',
      zh: '第 3 行把 120 - 35 = 85 存進 remaining。之後改動 energy 與 used 並不會自動重算，直到第 7 行再次指定才算出 150 - 45 = 105。',
    },
    traceSource: `int energy = 120;
int used = 35;
int remaining = energy - used;
energy = 150;
used = used + 10;
System.out.println(remaining);
remaining = energy - used;
System.out.println(remaining);`,
  },
  {
    id: 'ch01-lock-2',
    title: { en: 'SIGNAL LOCK 02 // VALUE COPY VS LIVE LINK', zh: '訊號鎖 02 // 值複製與獨立暫存器' },
    prompt: {
      en: 'Trace the values carefully. What exact text appears on the console?',
      zh: '仔細追蹤變數值變化。主控台最後會印出什麼精確文字？',
    },
    code: `int a = 12;
int b = a;
a = a + 8;
int c = a - b;
System.out.println(b + ":" + c);`,
    options: [
      { en: '12:8', zh: '12:8' },
      { en: '20:0', zh: '20:0' },
      { en: '12:12', zh: '12:12' },
      { en: '20:8', zh: '20:8' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'b copies 12 at line 2. Later, a becomes 20, while b keeps 12. So c = 20 - 12 = 8, printing 12:8.',
      zh: '第 2 行把當時的 12 複製進 b。後來 a 變成 20，但 b 仍保留 12。因此 c = 20 - 12 = 8，印出 12:8。',
    },
    traceSource: `int a = 12;
int b = a;
a = a + 8;
int c = a - b;
System.out.println(b + ":" + c);`,
  },
];

export const CH01_SWAP_STARTER = `int left = 7;
int right = 12;

// TODO: declare int temp to preserve one value and swap left & right

System.out.println("Left: " + left);
System.out.println("Right: " + right);`;

export const CH01_REACTOR_STARTER = `// Declare initial readings:
//   int energy = 120;
//   int used = 45;
// Calculate int remaining, and copy it into int initialRemaining
// Reassign energy = 150; used = 65; and recalculate remaining
// Declare boolean online = true;
// Print three lines:
//   Initial: 75
//   Updated: 85
//   Online: true

`;

export function evaluateSwapEncounter(source: string): Ch01EncounterResult {
  const waves = [
    {
      label: { en: 'Wave 1 · Standard Channels (7, 12)', zh: '第 1 波 · 標準頻道 (7, 12)' },
      left: 7,
      right: 12,
      patches: [],
    },
    {
      label: { en: 'Wave 2 · Surge Channels (31, 9)', zh: '第 2 波 · 高壓調換 (31, 9)' },
      left: 31,
      right: 9,
      patches: [
        { name: 'left', initial: 31 },
        { name: 'right', initial: 9 },
      ],
    },
  ];

  const waveDetails = waves.map((w, idx) => {
    const run = runStatements(source, { patches: w.patches });
    const env = run.finalLocals;
    const expectedOut = `Left: ${w.right}\nRight: ${w.left}`;
    const checks: Array<{ label: BiText; ok: boolean }> = [
      {
        label: { en: 'Program runs cleanly', zh: '程式執行無誤' },
        ok: run.ok,
      },
      {
        label: { en: 'Uses int temp buffer', zh: '使用 int temp 暫存緩衝' },
        ok: env.temp?.type === 'int',
      },
      {
        label: {
          en: `Exchanges values (${w.left}, ${w.right} → ${w.right}, ${w.left})`,
          zh: `成功交換數值 (${w.left}, ${w.right} → ${w.right}, ${w.left})`,
        },
        ok: env.left?.value === String(w.right) && env.right?.value === String(w.left),
      },
      {
        label: { en: 'Prints labeled Left/Right report', zh: '印出正確 Left/Right 標籤報表' },
        ok: run.stdout.trim() === expectedOut,
      },
    ];
    return {
      waveIndex: idx,
      label: w.label,
      passed: checks.every((c) => c.ok),
      checks,
      run,
    };
  });

  const firstFail = waveDetails.find((w) => !w.passed);
  const wavesCleared = firstFail ? firstFail.waveIndex : waveDetails.length;
  return {
    encounterId: 'swap',
    passed: wavesCleared === waveDetails.length,
    wavesCleared,
    totalWaves: waveDetails.length,
    waveDetails,
    primaryRun: (firstFail ?? waveDetails[waveDetails.length - 1]).run,
  };
}

export interface ReactorWaveSpec {
  initEnergy: number;
  initUsed: number;
  updEnergy: number;
  updUsed: number;
  label: BiText;
}

export const CH01_DEFAULT_WAVES: ReactorWaveSpec[] = [
  {
    initEnergy: 120,
    initUsed: 45,
    updEnergy: 150,
    updUsed: 65,
    label: { en: 'Wave 1 · Nominal Grid (120/45 → 150/65)', zh: '第 1 波 · 基準供電 (120/45 → 150/65)' },
  },
  {
    initEnergy: 135,
    initUsed: 50,
    updEnergy: 170,
    updUsed: 80,
    label: { en: 'Wave 2 · Peak Load Shift (135/50 → 170/80)', zh: '第 2 波 · 尖峰偏移 (135/50 → 170/80)' },
  },
  {
    initEnergy: 200,
    initUsed: 120,
    updEnergy: 240,
    updUsed: 90,
    label: { en: 'Wave 3 · Storm Recovery (200/120 → 240/90)', zh: '第 3 波 · 風暴搶修 (200/120 → 240/90)' },
  },
];

export function evaluateReactorEncounter(
  source: string,
  customWave?: ReactorWaveSpec,
): Ch01EncounterResult {
  const waves = customWave ? [customWave] : CH01_DEFAULT_WAVES;
  const waveDetails = waves.map((w, idx) => {
    const patches =
      idx === 0 && !customWave
        ? []
        : [
            { name: 'energy', initial: w.initEnergy, reassign: w.updEnergy },
            { name: 'used', initial: w.initUsed, reassign: w.updUsed },
          ];
    const run = runStatements(source, { patches });
    const env = run.finalLocals;
    const expInit = w.initEnergy - w.initUsed;
    const expUpd = w.updEnergy - w.updUsed;
    const expectedOut = `Initial: ${expInit}\nUpdated: ${expUpd}\nOnline: true`;

    const checks: Array<{ label: BiText; ok: boolean }> = [
      {
        label: { en: 'Required int & boolean types', zh: '使用指定 int 與 boolean 型別' },
        ok:
          run.ok &&
          env.energy?.type === 'int' &&
          env.used?.type === 'int' &&
          env.remaining?.type === 'int' &&
          env.initialRemaining?.type === 'int' &&
          env.online?.type === 'boolean',
      },
      {
        label: {
          en: `Updates readings to ${w.updEnergy} / ${w.updUsed}`,
          zh: `更新讀數至 ${w.updEnergy} / ${w.updUsed}`,
        },
        ok:
          env.energy?.value === String(w.updEnergy) &&
          env.used?.value === String(w.updUsed) &&
          env.online?.value === 'true',
      },
      {
        label: {
          en: `Snapshot stays ${expInit}; updated becomes ${expUpd}`,
          zh: `初始快照保留 ${expInit}；更新後為 ${expUpd}`,
        },
        ok:
          env.initialRemaining?.value === String(expInit) &&
          env.remaining?.value === String(expUpd),
      },
      {
        label: {
          en: `Exact 3-line console output`,
          zh: `主控台三行輸出完全吻合`,
        },
        ok: run.stdout.trim() === expectedOut,
      },
    ];

    return {
      waveIndex: idx,
      label: w.label,
      passed: checks.every((c) => c.ok),
      checks,
      run,
    };
  });

  const firstFail = waveDetails.find((w) => !w.passed);
  const wavesCleared = firstFail ? firstFail.waveIndex : waveDetails.length;
  return {
    encounterId: 'reactor',
    passed: wavesCleared === waveDetails.length,
    wavesCleared,
    totalWaves: waveDetails.length,
    waveDetails,
    primaryRun: (firstFail ?? waveDetails[waveDetails.length - 1]).run,
  };
}

export const CH01_TUTOR_PROMPTS: Record<string, BiText[]> = {
  recon: [
    {
      en: 'Ask the student to predict the difference BEFORE clicking Execute. Why does changing the sliders not move Stored Memory?',
      zh: '按 Execute 前先請學生預測差值。為什麼拖動電量拉桿時，Memory Core 的數字卻紋絲不動？',
    },
    {
      en: 'Check type intuition: why use int for energy units, double for efficiency, and boolean for online?',
      zh: '確認型別直覺：為什麼電量適合 int、效率用 double、開關狀態用 boolean？',
    },
  ],
  breach: [
    {
      en: 'Have the student point out which exact line creates the copy in Lock 02 (int b = a;).',
      zh: '請學生指出訊號鎖 02 哪一行發生了值複製，為什麼後續修改 a 不影響 b？',
    },
  ],
  battle: [
    {
      en: 'In Channel Swap, try removing temp once and watch the crimson vaporization on canvas—why did data vanish?',
      zh: '在頻道交換關可刻意拿掉 temp 測試一次，觀察畫布上的能量球蒸發效果，讓學生解釋為何原始值消失。',
    },
    {
      en: 'Use the GM Chaos Wave to inject strange numbers and ask the student to predict Initial & Updated before firing.',
      zh: '用 GM 主控台丟入一組自訂電量干擾波，請學生先口頭預測 Initial 與 Updated 再發射！',
    },
  ],
  debrief: [
    {
      en: 'Scrub the Time-Travel bar to the exact line where remaining is recalculated and have the student narrate memory state.',
      zh: '拖曳時間軸回到重新計算 remaining 的那一行，請學生用自己的話口述當時每個暫存器的變化。',
    },
  ],
};
