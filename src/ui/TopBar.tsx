import React from 'react';
import { Cpu, Globe, Map as MapIcon, Sliders, Volume2, VolumeX } from 'lucide-react';
import { sound } from '../engine/audio/synth';
import { Lang, t, UI_COPY } from '../engine/i18n/text';
import { CAMPAIGN_CHAPTERS } from '../game/campaignData';

export interface TopBarProps {
  activeChapterId: number | null;
  lang: Lang;
  onToggleLang: () => void;
  muted: boolean;
  onToggleMute: () => void;
  unlockedChipsCount: number;
  onBackToMap: () => void;
  onOpenChips: () => void;
  onToggleGm: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeChapterId,
  lang,
  onToggleLang,
  muted,
  onToggleMute,
  unlockedChipsCount,
  onBackToMap,
  onOpenChips,
  onToggleGm,
}) => {
  const activeChapter = activeChapterId
    ? CAMPAIGN_CHAPTERS.find((c) => c.id === activeChapterId)
    : null;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="brand-btn chamfer-sm"
          onClick={() => {
            sound.click();
            onBackToMap();
          }}
        >
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path
              d="M4 16L10 6H22L28 16L22 26H10L4 16Z"
              stroke="#00F0FF"
              strokeWidth="2"
            />
            <path d="M11 11H20L14 17H21L13 23" stroke="#B8FF3C" strokeWidth="2.2" />
          </svg>
          <div>
            <div>{t(UI_COPY.brandTitle, lang)}</div>
            <div className="brand-sub">{t(UI_COPY.brandSub, lang)}</div>
          </div>
        </button>

        {activeChapter ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="tac-btn ghost chamfer-sm"
              style={{ minHeight: 34, padding: '5px 11px', fontSize: 12 }}
              onClick={() => {
                sound.click();
                onBackToMap();
              }}
            >
              <MapIcon size={14} />
              {t(UI_COPY.backToMap, lang)}
            </button>
            <span className="tac-tag cyan">
              {activeChapter.code} · {t(activeChapter.title, lang)}
            </span>
          </div>
        ) : (
          <span className="tac-tag cyan">AETHER-9 OVERWORLD</span>
        )}
      </div>

      <div className="topbar-right">
        <button
          type="button"
          className="tac-btn ghost chamfer-sm"
          style={{ minHeight: 34, padding: '5px 12px', fontSize: 12 }}
          onClick={() => {
            sound.click();
            onOpenChips();
          }}
        >
          <Cpu size={14} color="#00F0FF" />
          {t(UI_COPY.chipBay, lang)}
          <span className="tac-tag lime" style={{ padding: '1px 6px' }}>
            {unlockedChipsCount} / 15
          </span>
        </button>

        <button
          type="button"
          className="tac-btn ghost chamfer-sm"
          style={{ minHeight: 34, padding: '5px 11px', fontSize: 12 }}
          onClick={() => {
            sound.click();
            onToggleLang();
          }}
          aria-label="Toggle language"
        >
          <Globe size={14} />
          {lang === 'en' ? 'EN / 繁中' : '繁中 / EN'}
        </button>

        <button
          type="button"
          className="tac-btn ghost chamfer-sm"
          style={{ minHeight: 34, padding: '5px 11px', fontSize: 12 }}
          onClick={onToggleMute}
          aria-label="Toggle sound effects"
        >
          {muted ? <VolumeX size={14} color="#FF2A5F" /> : <Volume2 size={14} color="#B8FF3C" />}
          {muted ? t(UI_COPY.sfxOff, lang) : t(UI_COPY.sfxOn, lang)}
        </button>

        <button
          type="button"
          className="tac-btn ghost chamfer-sm"
          style={{ minHeight: 34, padding: '5px 11px', fontSize: 12, borderColor: 'rgba(255, 149, 0, 0.45)', color: '#ffb84d' }}
          onClick={() => {
            sound.click();
            onToggleGm();
          }}
          title="Shift + G"
        >
          <Sliders size={14} />
          {t(UI_COPY.gmConsole, lang)}
        </button>
      </div>
    </header>
  );
};
