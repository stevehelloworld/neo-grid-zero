import React, { useEffect, useState } from 'react';
import { sound } from '../engine/audio/synth';
import { Lang } from '../engine/i18n/text';

export interface MiraCommsProps {
  mood?: 'neutral' | 'alert' | 'danger' | 'success';
  message: string;
  lang: Lang;
}

export const MiraComms: React.FC<MiraCommsProps> = ({
  mood = 'neutral',
  message,
  lang,
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
      className={`mira-comms chamfer-sm ${mood}`}
      aria-live="polite"
      aria-label="Mira tactical comms"
    >
      <div className="mira-avatar">
        {!imgErr ? (
          <img
            src={portraitSrc}
            alt="Mira, Tactical Navigator"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: 'var(--cyan)',
            }}
          >
            MIRA
          </div>
        )}
      </div>
      <div className="mira-body">
        <div className="mira-speaker">
          <span>MIRA // {lang === 'zh-Hant' ? '戰術領航員' : 'TACTICAL NAVIGATOR'}</span>
          {mood === 'danger' && <span className="tac-tag crimson">ALERT</span>}
          {mood === 'success' && <span className="tac-tag lime">SYNC</span>}
        </div>
        <p key={message} className="mira-text">{shown || message}</p>
      </div>
    </section>
  );
};
