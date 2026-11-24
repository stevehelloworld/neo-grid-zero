import React, { useEffect } from 'react';

export interface CutInData {
  id: number;
  tag: string;
  title: string;
  tone: 'cyan' | 'amber' | 'lime' | 'danger';
}

export interface CutInBannerProps {
  cutIn: CutInData | null;
  onDone: () => void;
}

export const CutInBanner: React.FC<CutInBannerProps> = ({ cutIn, onDone }) => {
  useEffect(() => {
    if (!cutIn) return;
    const timer = window.setTimeout(onDone, 900);
    return () => window.clearTimeout(timer);
  }, [cutIn, onDone]);

  if (!cutIn) return null;

  const color =
    cutIn.tone === 'danger'
      ? 'var(--crimson)'
      : cutIn.tone === 'amber'
        ? 'var(--amber)'
        : cutIn.tone === 'lime'
          ? 'var(--lime)'
          : 'var(--cyan)';

  return (
    <div
      className="cutin-overlay"
      role="status"
      aria-live="polite"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className={`cutin-band ${cutIn.tone}`}
        style={{ pointerEvents: 'none' }}
      >
        <span className={`tac-tag ${cutIn.tone === 'danger' ? 'crimson' : cutIn.tone}`}>
          {cutIn.tag}
        </span>
        <span className="cutin-title" style={{ color }}>
          {cutIn.title}
        </span>
      </div>
    </div>
  );
};
