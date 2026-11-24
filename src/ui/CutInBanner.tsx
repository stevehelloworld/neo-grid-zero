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
    const timer = window.setTimeout(onDone, 1250);
    return () => window.clearTimeout(timer);
  }, [cutIn, onDone]);

  if (!cutIn) return null;

  const stripeClass =
    cutIn.tone === 'danger' ? 'hazard-stripe-crimson' : 'hazard-stripe';
  const color =
    cutIn.tone === 'danger'
      ? 'var(--crimson)'
      : cutIn.tone === 'amber'
        ? 'var(--amber)'
        : cutIn.tone === 'lime'
          ? 'var(--lime)'
          : 'var(--cyan)';

  return (
    <div className="cutin-overlay" role="status" aria-live="polite">
      <div className={`cutin-band ${cutIn.tone} ${stripeClass}`}>
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
