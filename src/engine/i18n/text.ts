export type Lang = 'en' | 'zh-Hant';

export interface BiText {
  en: string;
  zh: string;
}

export function t(text: BiText | string, lang: Lang): string {
  if (typeof text === 'string') return text;
  return lang === 'zh-Hant' ? text.zh : text.en;
}

export const UI_COPY = {
  brandTitle: { en: 'NEO-GRID ZERO', zh: 'NEO-GRID ZERO' },
  backToMap: { en: 'Map', zh: '地圖' },
  chipBay: { en: 'Chips', zh: '晶片' },
  gmConsole: { en: 'GM', zh: 'GM' },
  sfxOn: { en: 'Sound on', zh: '音效開' },
  sfxOff: { en: 'Sound off', zh: '音效關' },
  playBtn: { en: 'PLAY', zh: '出擊' },
  replayBtn: { en: 'REPLAY', zh: '重玩' },
  upcomingTag: { en: 'LOCKED · ACT III–V', zh: '未開放 · 後續篇章' },
  phaseRecon: { en: '1 Recon', zh: '1 偵查' },
  phaseBreach: { en: '2 Breach', zh: '2 突入' },
  phaseBattle: { en: '3 Boss', zh: '3 實戰' },
  phaseDebrief: { en: '4 Clear', zh: '4 破關' },
  runDeploy: { en: 'DEPLOY CODE', zh: '部署執行' },
  resetCode: { en: 'Reset', zh: '重設' },
  quickRef: { en: 'Java Ref', zh: '速查' },
  timelineTitle: { en: 'EXECUTION TRACE', zh: '執行追蹤' },
  memoryTitle: { en: 'MEMORY', zh: '記憶體' },
  stdoutTitle: { en: 'OUTPUT', zh: '輸出' },
} as const;
