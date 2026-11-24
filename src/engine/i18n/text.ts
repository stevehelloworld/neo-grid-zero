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
  brandSub: { en: 'AP CSA TACTICAL JAVA OS', zh: 'AP CSA 戰術 JAVA 作業系統' },
  backToMap: { en: 'Aether-9 Map', zh: 'Aether-9 地圖' },
  chipBay: { en: 'BYTE Chip Bay', zh: 'BYTE 晶片庫' },
  gmConsole: { en: 'GM Copilot', zh: '教師 GM 主控台' },
  sfxOn: { en: 'SFX ON', zh: '音效 開' },
  sfxOff: { en: 'SFX OFF', zh: '音效 關' },
  mapTitle: { en: 'AETHER-9 // DISTRICT GRID', zh: 'AETHER-9 // 都市全域戰術圖' },
  mapSub: {
    en: 'Select a sector node to deploy UNIT-01 BYTE. Clear sectors to restore the city power grid.',
    zh: '選擇區域節點派遣 UNIT-01 BYTE 出擊。修復核心節點以點亮整座都市電網。',
  },
  deployBtn: { en: 'DEPLOY TO SECTOR', zh: '派遣機體出擊' },
  replayBtn: { en: 'REPLAY SECTOR', zh: '重玩本關戰役' },
  upcomingTag: { en: 'UPCOMING MILESTONE', zh: '後續篇章預覽' },
  upcomingNote: {
    en: 'Act I & II (Ch.01–Ch.07) are fully playable live missions. Ch.08–Ch.15 are queued for upcoming Act III–V milestones.',
    zh: 'Act I 與 Act II（Ch.01–Ch.07）現已全面開放實戰遊玩！Ch.08–Ch.15 為後續 Act III–V 更新篇章的情報預覽。',
  },
  phaseRecon: { en: '01 Recon', zh: '01 現場偵查' },
  phaseBreach: { en: '02 Breach', zh: '02 防火牆突入' },
  phaseBattle: { en: '03 Boss Battle', zh: '03 編程實戰' },
  phaseDebrief: { en: '04 Debrief', zh: '04 戰報復盤' },
  runDeploy: { en: 'DEPLOY CODE', zh: '部署執行' },
  resetCode: { en: 'Reset Starter', zh: '重設起始碼' },
  quickRef: { en: 'Java Quick Ref', zh: 'Java 速查卡' },
  timelineTitle: { en: 'TIME-TRAVEL TRACE', zh: '時間軸執行追蹤器' },
  memoryTitle: { en: 'LIVE MEMORY REGISTERS', zh: '即時記憶體暫存器' },
  stdoutTitle: { en: 'TERMINAL STDOUT', zh: '終端輸出' },
} as const;
