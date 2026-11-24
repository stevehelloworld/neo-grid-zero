import { BiText } from '../../engine/i18n/text';
import { runMethodCall } from '../../engine/vm';
import { BreachLock, DroneFlightResult, DroneSpec, SentinelBattleResult } from '../types';

export const CH04_RECON_DRONES: DroneSpec[] = [
  { id: 'r1', callsign: 'ACE-16', age: 16, trained: true, mentor: true, expected: 'CLEAR' },
  { id: 'r2', callsign: 'CADET-14', age: 14, trained: false, mentor: true, expected: 'PRACTICE' },
  { id: 'r3', callsign: 'ROOKIE-12', age: 12, trained: true, mentor: true, expected: 'WAIT' },
];

export const CH04_CORRUPTED_AUTOPILOT = `static String access(int age, boolean trained, boolean mentor) {
    if (age >= 13) {
        return "PRACTICE";
    } else if (age >= 16 && trained) {
        return "CLEAR";
    }
    return "WAIT";
}`;

export const CH04_LOCKS: BreachLock[] = [
  {
    id: 'ch04-lock-1',
    title: { en: 'CYBER LOCK 01 // BOUNDARY CHECK', zh: '邏輯鎖 01 // 雙端邊界判定' },
    prompt: {
      en: 'Which Java boolean expression returns true when age is between 16 and 18 inclusive?',
      zh: '哪一個 Java 布林運算式在 age 介於 16 與 18（含兩端邊界）時為 true？',
    },
    options: [
      { en: 'age >= 16 && age <= 18', zh: 'age >= 16 && age <= 18' },
      { en: 'age > 16 && age < 18', zh: 'age > 16 && age < 18' },
      { en: 'age >= 16 || age <= 18', zh: 'age >= 16 || age <= 18' },
      { en: '16 <= age <= 18', zh: '16 <= age <= 18' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'Java does not allow chained inequalities like 16 <= age <= 18, and both bounds must hold simultaneously (&& with >= and <=).',
      zh: 'Java 不支援連續不等式 16 <= age <= 18，且兩個邊界必須同時成立（用 && 連接 >= 與 <=）。',
    },
  },
  {
    id: 'ch04-lock-2',
    title: { en: 'CYBER LOCK 02 // SHADOWED BRANCH', zh: '邏輯鎖 02 // 被搶先的分支' },
    prompt: {
      en: 'Trace the branch order carefully. What is printed when age = 16?',
      zh: '追蹤以下條件鏈順序，當 age = 16 時會印出什麼？',
    },
    code: `int age = 16;
if (age >= 13) {
    System.out.print("PRACTICE");
} else if (age >= 16) {
    System.out.print("CLEAR");
}`,
    options: [
      { en: 'PRACTICE', zh: 'PRACTICE' },
      { en: 'CLEAR', zh: 'CLEAR' },
      { en: 'PRACTICECLEAR', zh: 'PRACTICECLEAR' },
      { en: '(no output)', zh: '(無輸出)' },
    ],
    correctIndex: 0,
    explanation: {
      en: 'Because 16 >= 13 is true first, Java runs the first branch and skips the entire else-if chain—that is the exact bug inside Sentinel Sky-Gate!',
      zh: '因為第一個條件 16 >= 13 率先成立，Java 會直接進入第一個分支並跳過後面的 else if——這正是哨兵閘門裡真正的 Bug！',
    },
    traceSource: `int age = 16;
if (age >= 13) {
    System.out.print("PRACTICE");
} else if (age >= 16) {
    System.out.print("CLEAR");
}`,
  },
  {
    id: 'ch04-lock-3',
    title: { en: 'CYBER LOCK 03 // DE MORGAN OVERRIDE', zh: '邏輯鎖 03 // 笛摩根定律反轉' },
    prompt: {
      en: 'Which expression is logically equivalent to !(trained && mentor)?',
      zh: '哪一個運算式在任何情況下都與 !(trained && mentor) 完全等價？',
    },
    options: [
      { en: '!trained || !mentor', zh: '!trained || !mentor' },
      { en: '!trained && !mentor', zh: '!trained && !mentor' },
      { en: 'trained || mentor', zh: 'trained || mentor' },
      { en: '!(trained || mentor)', zh: '!(trained || mentor)' },
    ],
    correctIndex: 0,
    explanation: {
      en: "By De Morgan's Law, negating an AND switches it to OR while negating both sides: !(A && B) == (!A || !B).",
      zh: '依笛摩根定律，對 AND 取反會把 && 翻轉成 || 並反轉左右條件：!(A && B) == (!A || !B)。',
    },
  },
];

export const CH04_STARTER_CODE = `static String access(int age, boolean trained, boolean mentor) {
    // Rules:
    //   CLEAR    -> trained AND age >= 16 (highest priority!)
    //   PRACTICE -> mentor AND age >= 13
    //   WAIT     -> otherwise
    return "WAIT";
}`;

export const CH04_WAVES: DroneSpec[][] = [
  // Wave 1: Standard Patrol
  [
    { id: 'w1-1', callsign: 'VANGUARD-17', age: 17, trained: true, mentor: false, expected: 'CLEAR' },
    { id: 'w1-2', callsign: 'TRAINEE-14', age: 14, trained: false, mentor: true, expected: 'PRACTICE' },
    { id: 'w1-3', callsign: 'CIVIC-11', age: 11, trained: false, mentor: false, expected: 'WAIT' },
  ],
  // Wave 2: Priority Ambush
  [
    { id: 'w2-1', callsign: 'ACE-16', age: 16, trained: true, mentor: true, expected: 'CLEAR' },
    { id: 'w2-2', callsign: 'ESCORT-16', age: 16, trained: false, mentor: true, expected: 'PRACTICE' },
    { id: 'w2-3', callsign: 'SOLO-15', age: 15, trained: true, mentor: false, expected: 'WAIT' },
  ],
  // Wave 3: Boundary Storm
  [
    { id: 'w3-1', callsign: 'EDGE-13', age: 13, trained: false, mentor: true, expected: 'PRACTICE' },
    { id: 'w3-2', callsign: 'YOUNG-12', age: 12, trained: true, mentor: true, expected: 'WAIT' },
    { id: 'w3-3', callsign: 'EDGE-16', age: 16, trained: true, mentor: false, expected: 'CLEAR' },
  ],
];

export function evaluateSentinelBattle(
  source: string,
  customDrone?: DroneSpec,
): SentinelBattleResult {
  const waves = customDrone ? [[customDrone]] : CH04_WAVES;
  const flights: DroneFlightResult[] = [];
  let wavesCleared = 0;
  let failedFlight: DroneFlightResult | undefined;

  for (let wIdx = 0; wIdx < waves.length; wIdx++) {
    let waveAllOk = true;
    for (const drone of waves[wIdx]) {
      const run = runMethodCall(source, 'access', [drone.age, drone.trained, drone.mentor]);
      const actual =
        run.ok && run.returnValue?.type === 'String'
          ? String(run.returnValue.value)
          : run.error
            ? 'ERROR'
            : 'VOID';
      const passed = run.ok && actual === drone.expected;
      const flight: DroneFlightResult = {
        drone,
        waveIndex: wIdx,
        actual,
        passed,
        run,
      };
      flights.push(flight);
      if (!passed) {
        waveAllOk = false;
        if (!failedFlight) failedFlight = flight;
      }
    }
    if (waveAllOk && !failedFlight) {
      wavesCleared++;
    } else {
      break;
    }
  }

  return {
    passed: !failedFlight && wavesCleared === waves.length,
    wavesCleared,
    totalWaves: waves.length,
    flights,
    failedFlight,
  };
}

export const CH04_TUTOR_PROMPTS: Record<string, BiText[]> = {
  recon: [
    {
      en: 'Fire the Corrupted Autopilot first! Ask why ACE-16 (trained=true, age=16) gets trapped in PRACTICE.',
      zh: '先啟動「故障自動駕駛示範」，讓學生親眼看 ACE-16 撞壁後問他：為什麼 age >= 13 會搶走資格？',
    },
  ],
  breach: [
    {
      en: 'Check if the student recognizes that in if/else-if, order matters whenever two conditions overlap.',
      zh: '確認學生理解：只要兩個條件有重疊，if / else if 的先後順序就會決定優先權。',
    },
  ],
  battle: [
    {
      en: 'Ask the student which single drone in Wave 2 (ACE-16, ESCORT-16, or SOLO-15) catches missing priority vs missing mentor checks.',
      zh: '問學生第 2 波的三台無人機分別測試哪個漏洞？（ACE-16 測優先權、ESCORT-16 測沒受訓但有導師、SOLO-15 測未滿 16 且無導師）',
    },
    {
      en: 'Launch a GM Chaos Drone at age=15, trained=true, mentor=true—what should it return and why?',
      zh: '從 GM 主控台發射一台 (15, trained=true, mentor=true) 的干擾無人機，請學生先推演應該進哪一條航道！',
    },
  ],
  debrief: [
    {
      en: 'Scrub the ACE-16 flight trace step-by-step and have the student read each boolean branch evaluation aloud.',
      zh: '將 ACE-16 的飛行追蹤往回撥，請學生逐行念出每個 if 條件判定為 TRUE 或 FALSE 的過程。',
    },
  ],
};
