import React, { useEffect, useState } from 'react';
import { sound } from '../engine/audio/synth';
import { Lang } from '../engine/i18n/text';

export interface MiraCommsProps {
  mood?: 'neutral' | 'alert' | 'danger' | 'success';
  message: string;
  lang: Lang;
  docked?: boolean;
}

export const MiraComms: React.FC<MiraCommsProps> = ({
  mood = 'neutral',
  message,
  lang: _lang,
  docked = false,
}) => {
  const [shown, setShown] = useState(message);
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    setShown('');
    let idx = 0;
    const stepSize = Math.max(2, Math.ceil(message.length / 18));
    const timer = window.setInterval(() => {
      idx = Math.min(message.length, idx + stepSize);
      setShown(message.slice(0, idx));
      if (idx < message.length) {
        sound.radioBlip();
      } else {
        window.clearInterval(timer);
      }
    }, 16);
    return () => window.clearInterval(timer);
  }, [message]);

  const portraitSrc =
    mood === 'alert' || mood === 'danger'
      ? './assets/mira-alert.png'
      : './assets/mira-neutral.png';

  return (
    <section
      className={`mira-comms ${docked ? 'docked' : ''} ${mood}`}
      aria-live="polite"
      aria-label="Mira comms"
    >
      <div className="mira-avatar">
        {!imgErr ? (
          <img
            src={portraitSrc}
            alt="Mira"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="mira-fallback mono">MIRA</div>
        )}
      </div>
      <div className="mira-body">
        <p key={message} className="mira-text">
          <span className="mira-badge mono">MIRA</span>
          {shown || message}
        </p>
      </div>
    </section>
  );
};
