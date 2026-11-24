import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Play, Trophy, X } from 'lucide-react';
import { sound } from '../engine/audio/synth';
import { Lang } from '../engine/i18n/text';

export interface MissionPopupProps {
  open: boolean;
  variant: 'welcome' | 'briefing' | 'clear';
  lang: Lang;
  badge?: string;
  title: string;
  subtitle?: string;
  steps?: string[];
  primaryLabel: string;
  secondaryLabel?: string;
  rank?: string;
  skipBriefings?: boolean;
  onToggleSkipBriefings?: (next: boolean) => void;
  onPrimary: () => void;
  onSecondary?: () => void;
}

export const MissionPopup: React.FC<MissionPopupProps> = ({
  open,
  variant,
  lang,
  badge,
  title,
  subtitle,
  steps,
  primaryLabel,
  secondaryLabel,
  rank,
  skipBriefings = false,
  onToggleSkipBriefings,
  onPrimary,
  onSecondary,
}) => {
  const [miraErr, setMiraErr] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sound.click();
        (onSecondary ?? onPrimary)();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onSecondary, onPrimary]);

  if (!open) return null;

  const dismiss = () => {
    sound.click();
    (onSecondary ?? onPrimary)();
  };

  return (
    <div
      className="mission-popup-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        className={`mission-popup ${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-popup-title"
      >
        <button
          type="button"
          className="popup-close-btn"
          aria-label={lang === 'zh-Hant' ? '關閉' : 'Close'}
          onClick={dismiss}
        >
          <X size={16} />
        </button>

        {variant === 'clear' ? (
          <div className="popup-clear-hero">
            <div className={`popup-clear-icon ${rank ? 'gold' : 'lime'}`}>
              {rank ? <Trophy size={26} /> : <CheckCircle2 size={26} />}
            </div>
            <div>
              {badge && <div className="popup-badge mono lime">{badge}</div>}
              <h2 id="mission-popup-title" className="popup-title">
                {title}
              </h2>
            </div>
          </div>
        ) : (
          <div className="popup-header">
            <div className="popup-avatar">
              {!miraErr ? (
                <img
                  src="./assets/mira-neutral.png"
                  alt="Mira"
                  onError={() => setMiraErr(true)}
                />
              ) : (
                <span className="mono">MIRA</span>
              )}
            </div>
            <div className="popup-heading-group">
              {badge && <div className="popup-badge mono cyan">{badge}</div>}
              <h2 id="mission-popup-title" className="popup-title">
                {title}
              </h2>
            </div>
          </div>
        )}

        {subtitle && <p className="popup-subtitle">{subtitle}</p>}

        {steps && steps.length > 0 && (
          <ol className={`popup-steps ${variant === 'welcome' ? 'welcome-pills' : ''}`}>
            {steps.map((step, i) => (
              <li key={i} className="popup-step-item">
                <span className="popup-step-num mono">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="popup-actions">
          <button
            type="button"
            className="tac-btn primary popup-primary-btn"
            onClick={() => {
              sound.deploy();
              onPrimary();
            }}
          >
            {variant === 'welcome' && <Play size={15} fill="currentColor" />}
            <span>{primaryLabel}</span>
            {variant !== 'welcome' && <ArrowRight size={15} />}
          </button>

          {secondaryLabel && onSecondary && (
            <button
              type="button"
              className="popup-secondary-btn"
              onClick={() => {
                sound.click();
                onSecondary();
              }}
            >
              {secondaryLabel}
            </button>
          )}
        </div>

        {variant === 'briefing' && onToggleSkipBriefings && (
          <label className="popup-skip-toggle">
            <input
              type="checkbox"
              checked={skipBriefings}
              onChange={(e) => onToggleSkipBriefings(e.target.checked)}
            />
            <span>
              {lang === 'zh-Hant'
                ? '不要自動彈出階段引導（右上角 ? 可隨時重開）'
                : "Don't auto-show phase guides (reopen anytime via ?)"}
            </span>
          </label>
        )}
      </div>
    </div>
  );
};
