import React from 'react';
import { ArrowLeft, Check, Cpu, Globe, Sliders, Volume2, VolumeX } from 'lucide-react';
import { sound } from '../engine/audio/synth';
import { Lang, t, UI_COPY } from '../engine/i18n/text';
import { CAMPAIGN_CHAPTERS } from '../game/campaignData';
import { ChapterProgress } from '../game/store';
import { PhaseId } from '../game/types';

export interface TopBarProps {
  activeChapterId: number | null;
  activePhase: PhaseId;
  activeProgress: ChapterProgress | null;
  battleComplete: boolean;
  onPhaseChange: (phase: PhaseId) => void;
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
  activePhase,
  activeProgress,
  battleComplete,
  onPhaseChange,
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

  const phases: Array<[PhaseId, { en: string; zh: string }, boolean]> = activeProgress
    ? [
        ['recon', UI_COPY.phaseRecon, true],
        ['breach', UI_COPY.phaseBreach, activeProgress.reconDone],
        ['battle', UI_COPY.phaseBattle, activeProgress.breachCleared],
        ['debrief', UI_COPY.phaseDebrief, battleComplete],
      ]
    : [];

  return (
    <header className="topbar">
      <div className="topbar-left">
        {activeChapter ? (
          <>
            <button
              type="button"
              className="hud-btn hud-back-btn"
              onClick={() => {
                sound.click();
                onBackToMap();
              }}
              aria-label={t(UI_COPY.backToMap, lang)}
            >
              <ArrowLeft size={14} />
              <span className="hud-label-desktop">{t(UI_COPY.backToMap, lang)}</span>
            </button>
            <div className="topbar-mission-title">
              <span className="topbar-ch-num mono">
                {String(activeChapter.id).padStart(2, '0')}
              </span>
              <span className="topbar-ch-name">{t(activeChapter.title, lang)}</span>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="brand-btn"
            onClick={() => {
              sound.click();
              onBackToMap();
            }}
          >
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path
                d="M4 16L10 6H22L28 16L22 26H10L4 16Z"
                stroke="#00F0FF"
                strokeWidth="2.2"
              />
              <path d="M11 11H20L14 17H21L13 23" stroke="#B8FF3C" strokeWidth="2.4" />
            </svg>
            <span className="brand-title">{t(UI_COPY.brandTitle, lang)}</span>
          </button>
        )}
      </div>

      {activeChapter && (
        <nav className="topbar-steps" aria-label="Mission phases">
          {phases.map(([id, label, unlocked]) => {
            const done = Boolean(activeProgress?.completedPhases.includes(id));
            const current = activePhase === id;
            return (
              <button
                key={id}
                type="button"
                className={`hud-step ${current ? 'current' : ''} ${done ? 'done' : ''}`}
                disabled={!unlocked}
                onClick={() => {
                  sound.click();
                  onPhaseChange(id);
                }}
              >
                {done && <Check size={12} strokeWidth={2.5} />}
                <span>{t(label, lang)}</span>
              </button>
            );
          })}
        </nav>
      )}

      <div className="topbar-right">
        <button
          type="button"
          className="hud-btn"
          onClick={() => {
            sound.click();
            onOpenChips();
          }}
          aria-label="BYTE Chip Bay"
          title="BYTE Chip Bay"
        >
          <Cpu size={14} />
          <span className="mono">{unlockedChipsCount}/15</span>
        </button>

        <button
          type="button"
          className="hud-btn"
          onClick={() => {
            sound.click();
            onToggleLang();
          }}
          aria-label="Toggle language"
          title={lang === 'en' ? '切換繁體中文' : 'Switch to English'}
        >
          <Globe size={14} />
          <span>{lang === 'en' ? 'EN / 繁' : '繁 / EN'}</span>
        </button>

        <button
          type="button"
          className="hud-btn hud-icon-only"
          onClick={onToggleMute}
          aria-label="Toggle sound effects"
          title={muted ? t(UI_COPY.sfxOff, lang) : t(UI_COPY.sfxOn, lang)}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>

        <button
          type="button"
          className="hud-btn hud-gm-btn"
          onClick={() => {
            sound.click();
            onToggleGm();
          }}
          title="Teacher GM Console (Shift+G)"
          aria-label="Teacher GM Console"
        >
          <Sliders size={13} />
          <span>{t(UI_COPY.gmConsole, lang)}</span>
        </button>
      </div>
    </header>
  );
};
