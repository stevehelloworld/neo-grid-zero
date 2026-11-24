import { BiText } from '../../engine/i18n/text';
import { RunResult, runStatements } from '../../engine/vm';
import { BreachLock } from '../types';

export const CH02_LOCKS: BreachLock[] = [
  {
    id: 'ch02-lock-1',
    title: { en: 'MARKET LOCK 01 // PRECEDENCE ORDER', zh: '市集鎖 01 // 運算子優先序' },
    prompt: {
      en: 'Evaluate the expression like Java. What value does 8 + 2 * 5 produce?',
      zh: '依照 Java 運算子優先順序計算，8 + 2 * 5 的結果是多少？',
    },
    options: [
      { en: '18', zh: '18' },
      { en: '50', zh: '50' },
      { en: '40', zh: '40' },
      { en: '15', zh: '15' },
    ],
    correctIndex: 0,
    explanation: {
      en: '* has higher precedence than +, so 2 * 5 evaluates to 10 first, then 8 + 10 = 18.',
      zh: '乘法 * 的優先順序高於加法 +，因此先算 2 * 5 = 10，再加上 8 得到 18。',
    },
  },
  {
    id: 'ch02-lock-2',
    title: { en: 'MARKET LOCK 02 // INTEGER QUOTIENT & REMAINDER', zh: '市集鎖 02 // 整數除法與餘數' },
    prompt: {
      en: 'What are 11 / 4 and 11 % 4 when both operands are int?',
      zh: '兩個運算元都是 int 時，11 / 4 與 11 % 4 分別是多少？',
    },
    options: [
      { en: '2 and 3', zh: '2 與 3' },
      { en: '2.75 and 3', zh: '2.75 與 3' },
      { en: '3 and 1', zh: '3 與 1' },
      { en: '2 and 0.75', zh: '2 與 0.75' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'int / int discards the fractional part (11 / 4 == 2). Remainder % gives what stays left over after two full groups of 4 (11 - 8 = 3).',
      zh: 'int / int 會無條件捨去小數部分（11 / 4 == 2），而 % 取出扣除 2 組 4 之後剩下的餘數（11 - 8 = 3）。',
    },
  },
  {
    id: 'ch02-lock-3',
    title: { en: 'MARKET LOCK 03 // CAST BEFORE VS AFTER', zh: '市集鎖 03 // 型別轉換的時機' },
    prompt: {
      en: 'Trace the types carefully. What exact line is printed?',
      zh: '仔細追蹤型別變化，主控台會印出哪一行？',
    },
    code: `int a = 7;
int b = 2;
double x = a / b;
double y = (double) a / b;
System.out.println(x + " " + y);`,
    options: [
      { en: '3.0 3.5', zh: '3.0 3.5' },
      { en: '3.5 3.5', zh: '3.5 3.5' },
      { en: '3 3.5', zh: '3 3.5' },
      { en: '3.0 3.0', zh: '3.0 3.0' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'For x, 7 / 2 runs as int / int = 3 BEFORE widening to double 3.0. For y, (double) casts a first so 7.0 / 2 produces 3.5.',
      zh: '計算 x 時，7 / 2 先執行整數除法變成 3，才存進 double 變成 3.0；計算 y 時，(double) 先將 a 轉成 7.0 再除 2，得到 3.5。',
    },
    traceSource: `int a = 7;
int b = 2;
double x = a / b;
double y = (double) a / b;
System.out.println(x + " " + y);`,
  },
];

export const CH02_SPLITTER_STARTER = `int tokens = 17;
int squads = 5;

// TODO: declare int perSquad using /
// TODO: declare int leftovers using %
// TODO: declare double exactPerSquad using an explicit (double) cast

System.out.println(perSquad);
System.out.println(leftovers);
System.out.println(exactPerSquad);`;

export const CH02_TITAN_STARTER = `int subtotalCents = 5000;
double taxRate = 0.08;
double discountRate = 0.05;
int crewSize = 3;

// TODO: declare int taxCents and int discountCents using explicit (int) casts
// TODO: declare int totalCents = subtotalCents; then use += taxCents and -= discountCents
// TODO: declare int shareCents (/) and int leftoverCents (%)
// TODO: declare double exactShare using (double) cast
// TODO: declare int orders = 2; and increment it with orders++;

System.out.println("Tax cents: " + taxCents);
System.out.println("Discount cents: " + discountCents);
System.out.println("Total cents: " + totalCents);
System.out.println("Each gets: " + shareCents);
System.out.println("Left over: " + leftoverCents);
System.out.println("Exact share: " + exactShare);
System.out.println("Orders: " + orders);`;

export interface Ch02WaveResult {
  waveIndex: number;
  label: BiText;
  passed: boolean;
  checks: Array<{ label: BiText; ok: boolean }>;
  run: RunResult;
}

export interface Ch02EncounterResult {
  encounterId: 'splitter' | 'titan';
  passed: boolean;
  wavesCleared: number;
  totalWaves: number;
  waveDetails: Ch02WaveResult[];
  primaryRun: RunResult;
}

export function evaluateSplitterEncounter(source: string): Ch02EncounterResult {
  const waves = [
    { label: { en: 'Wave 1 · 17 tokens / 5 squads', zh: '第 1 波 · 17 代幣 / 5 小隊' }, tokens: 17, squads: 5, patches: [] },
    {
      label: { en: 'Wave 2 · 29 tokens / 4 squads', zh: '第 2 波 · 29 代幣 / 4 小隊' },
      tokens: 29,
      squads: 4,
      patches: [
        { name: 'tokens', initial: 29 },
        { name: 'squads', initial: 4 },
      ],
    },
  ];

  const waveDetails = waves.map((w, idx) => {
    const run = runStatements(source, { patches: w.patches });
    const env = run.finalLocals;
    const expPer = Math.trunc(w.tokens / w.squads);
    const expLeft = w.tokens % w.squads;
    const expExact = w.tokens / w.squads;
    const exactOk =
      env.exactPerSquad?.type === 'double' &&
      Math.abs(Number(env.exactPerSquad.value) - expExact) < 1e-6;
    const lines = run.stdout.trim().split('\n');
    const outOk =
      lines.length === 3 &&
      lines[0] === String(expPer) &&
      lines[1] === String(expLeft) &&
      Math.abs(Number(lines[2]) - expExact) < 1e-6;

    const checks: Array<{ label: BiText; ok: boolean }> = [
      { label: { en: 'Program runs cleanly', zh: '程式正常執行' }, ok: run.ok },
      {
        label: {
          en: `perSquad = ${expPer} (/) and leftovers = ${expLeft} (%)`,
          zh: `perSquad = ${expPer} (/) 且 leftovers = ${expLeft} (%)`,
        },
        ok: env.perSquad?.value === String(expPer) && env.leftovers?.value === String(expLeft),
      },
      {
        label: {
          en: `exactPerSquad is double ${expExact} via (double) cast`,
          zh: `exactPerSquad 為 double ${expExact}（使用明確轉型）`,
        },
        ok: exactOk,
      },
      {
        label: { en: 'Prints 3 lines in exact order', zh: '依序印出 3 行數值' },
        ok: outOk,
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
    encounterId: 'splitter',
    passed: wavesCleared === waveDetails.length,
    wavesCleared,
    totalWaves: waveDetails.length,
    waveDetails,
    primaryRun: (firstFail ?? waveDetails[waveDetails.length - 1]).run,
  };
}

export interface MarketChaosWave {
  subtotalCents: number;
  crewSize: number;
  taxRate?: number;
  discountRate?: number;
  label?: BiText;
}

const TITAN_WAVES: Array<{
  subtotalCents: number;
  taxRate: number;
  discountRate: number;
  crewSize: number;
  label: BiText;
}> = [
  {
    subtotalCents: 5000,
    taxRate: 0.08,
    discountRate: 0.05,
    crewSize: 3,
    label: { en: 'Wave 1 · 5000¢ / 3 crew', zh: '第 1 波 · 5000 分 / 3 人' },
  },
  {
    subtotalCents: 6000,
    taxRate: 0.08,
    discountRate: 0.05,
    crewSize: 4,
    label: { en: 'Wave 2 · 6000¢ / 4 crew', zh: '第 2 波 · 6000 分 / 4 人' },
  },
  {
    subtotalCents: 4000,
    taxRate: 0.1,
    discountRate: 0.05,
    crewSize: 3,
    label: { en: 'Wave 3 · 4000¢ (10% tax) / 3 crew', zh: '第 3 波 · 4000 分 (10% 稅) / 3 人' },
  },
];

export function evaluateTitanEncounter(
  source: string,
  custom?: MarketChaosWave,
): Ch02EncounterResult {
  const waves = custom
    ? [
        {
          subtotalCents: custom.subtotalCents,
          taxRate: custom.taxRate ?? 0.08,
          discountRate: custom.discountRate ?? 0.05,
          crewSize: custom.crewSize,
          label: custom.label ?? {
            en: `GM Chaos (${custom.subtotalCents}¢ / ${custom.crewSize} crew)`,
            zh: `GM 干擾波 (${custom.subtotalCents} 分 / ${custom.crewSize} 人)`,
          },
        },
      ]
    : TITAN_WAVES;

  const hasCompound = /\+=/.test(source) && /-=\s*/.test(source);
  const hasIncrement = /(\+\+\s*orders|\borders\s*\+\+)/.test(source);

  const waveDetails = waves.map((w, idx) => {
    const patches =
      idx === 0 && !custom
        ? []
        : [
            { name: 'subtotalCents', initial: w.subtotalCents },
            { name: 'taxRate', initial: w.taxRate },
            { name: 'discountRate', initial: w.discountRate },
            { name: 'crewSize', initial: w.crewSize },
          ];
    const run = runStatements(source, { patches });
    const env = run.finalLocals;

    const expTax = Math.trunc(w.subtotalCents * w.taxRate);
    const expDisc = Math.trunc(w.subtotalCents * w.discountRate);
    const expTotal = w.subtotalCents + expTax - expDisc;
    const expShare = Math.trunc(expTotal / w.crewSize);
    const expLeft = expTotal % w.crewSize;
    const expExact = expTotal / w.crewSize;

    const exactOk =
      env.exactShare?.type === 'double' &&
      Math.abs(Number(env.exactShare.value) - expExact) < 1e-5;

    const out = run.stdout;
    const labelsOk =
      out.includes(`Tax cents: ${expTax}`) &&
      out.includes(`Discount cents: ${expDisc}`) &&
      out.includes(`Total cents: ${expTotal}`) &&
      out.includes(`Each gets: ${expShare}`) &&
      out.includes(`Left over: ${expLeft}`) &&
      out.includes('Orders: 3');

    const checks: Array<{ label: BiText; ok: boolean }> = [
      {
        label: {
          en: `Tax ${expTax}¢, discount ${expDisc}¢, total ${expTotal}¢`,
          zh: `稅金 ${expTax} 分、折扣 ${expDisc} 分、總計 ${expTotal} 分`,
        },
        ok:
          run.ok &&
          env.taxCents?.type === 'int' &&
          env.taxCents.value === String(expTax) &&
          env.discountCents?.type === 'int' &&
          env.discountCents.value === String(expDisc) &&
          env.totalCents?.value === String(expTotal),
      },
      {
        label: {
          en: `Share ${expShare}¢ (/), leftover ${expLeft}¢ (%), exactShare double`,
          zh: `每人 ${expShare} 分 (/)、餘數 ${expLeft} 分 (%)、exactShare 為 double`,
        },
        ok:
          env.shareCents?.value === String(expShare) &&
          env.leftoverCents?.value === String(expLeft) &&
          exactOk,
      },
      {
        label: {
          en: 'Uses +=, -=, and ++ with Orders: 3',
          zh: '使用 +=、-= 與 ++，使 Orders 為 3',
        },
        ok: hasCompound && hasIncrement && env.orders?.value === '3',
      },
      {
        label: { en: 'Prints all 7 labeled ledger lines', zh: '印出完整 7 行標籤報表' },
        ok: labelsOk,
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
    encounterId: 'titan',
    passed: wavesCleared === waveDetails.length,
    wavesCleared,
    totalWaves: waveDetails.length,
    waveDetails,
    primaryRun: (firstFail ?? waveDetails[waveDetails.length - 1]).run,
  };
}

export const CH02_TUTOR_PROMPTS: Record<string, BiText[]> = {
  recon: [
    {
      en: 'Why do / and % take the same two integers yet answer completely different logistics questions?',
      zh: '為什麼 / 與 % 接收完全相同的兩個整數，卻能回答「每隊拿多少」與「剩下幾個」兩個不同問題？',
    },
  ],
  breach: [
    {
      en: 'Why does double x = 7 / 2; store 3.0 instead of 3.5? When does casting happen relative to division?',
      zh: '為什麼 double x = 7 / 2; 存到的是 3.0 而不是 3.5？型別轉換與除法的執行先後順序為何？',
    },
  ],
  battle: [
    {
      en: 'Why do we cast (int) (subtotalCents * taxRate) instead of (int) subtotalCents * taxRate?',
      zh: '為什麼是 (int) (subtotalCents * taxRate) 而不是 (int) subtotalCents * taxRate？括號拿掉會發生什麼事？',
    },
  ],
  debrief: [
    {
      en: 'Have the student scrub to the exactShare assignment and explain how widening + (double) prevents truncation.',
      zh: '請學生把時間軸拉到 exactShare 那一行，口述 (double) 轉型如何阻止小數被截斷。',
    },
  ],
};
