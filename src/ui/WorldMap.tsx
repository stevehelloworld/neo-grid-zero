import React, { useState } from 'react';
import { CheckCircle2, Lock, ShieldAlert, Zap } from 'lucide-react';
import { sound } from '../engine/audio/synth';
import { Lang, t, UI_COPY } from '../engine/i18n/text';
import { ACT_META, CAMPAIGN_CHAPTERS } from '../game/campaignData';
import { CampaignState, getChapterProgress } from '../game/store';
import { MiraComms } from './MiraComms';

export interface WorldMapProps {
  state: CampaignState;
  onDeployChapter: (chapterId: number) => void;
}

export const WorldMap: React.FC<WorldMapProps> = ({ state, onDeployChapter }) => {
  const [selectedId, setSelectedId] = useState<number>(1);
  const [cityImgErr, setCityImgErr] = useState(false);
  const lang: Lang = state.lang;

  const selected =
    CAMPAIGN_CHAPTERS.find((c) => c.id === selectedId) ?? CAMPAIGN_CHAPTERS[0];
  const progress = getChapterProgress(state, selected.id);
  const isCleared = Boolean(progress.rank);
  const act = ACT_META[selected.act];

  const clearedCount = CAMPAIGN_CHAPTERS.filter(
    (c) => Boolean(getChapterProgress(state, c.id).rank),
  ).length;

  return (
    <main className="world-wrap">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="map-viewport chamfer">
          {!cityImgErr && (
            <img
              className="map-bg"
              src="./assets/aether-city.png"
              alt="Aether-9 island megacity tactical map"
              onError={() => setCityImgErr(true)}
            />
          )}
          <div className="map-vignette" />

          {/* SVG power conduit links connecting chapters 1..15 */}
          <svg className="map-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {CAMPAIGN_CHAPTERS.slice(0, -1).map((ch, idx) => {
              const next = CAMPAIGN_CHAPTERS[idx + 1];
              const chDone = Boolean(getChapterProgress(state, ch.id).rank);
              const activeLink = ch.playable || next.playable;
              return (
                <line
                  key={ch.id}
                  x1={ch.mapPos.x}
                  y1={ch.mapPos.y}
                  x2={next.mapPos.x}
                  y2={next.mapPos.y}
                  stroke={
                    chDone
                      ? '#B8FF3C'
                      : activeLink
                        ? 'rgba(0, 240, 255, 0.5)'
                        : 'rgba(124, 155, 176, 0.25)'
                  }
                  strokeWidth={chDone ? 0.55 : 0.35}
                  strokeDasharray={chDone ? undefined : '1.4 1.2'}
                />
              );
            })}
          </svg>

          <div className="map-hud-top">
            <div className="map-hud-title">
              <h1>{t(UI_COPY.mapTitle, lang)}</h1>
              <p>{t(UI_COPY.mapSub, lang)}</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="tac-tag lime">
                GRID SYNC: {clearedCount} / 15
              </span>
            </div>
          </div>

          {CAMPAIGN_CHAPTERS.map((ch) => {
            const p = getChapterProgress(state, ch.id);
            const cleared = Boolean(p.rank);
            const isSel = ch.id === selected.id;
            const classes = [
              'map-node',
              ch.playable ? 'playable' : 'archived',
              cleared ? 'cleared' : '',
              isSel ? 'selected' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={ch.id}
                type="button"
                className={classes}
                style={{ left: `${ch.mapPos.x}%`, top: `${ch.mapPos.y}%` }}
                aria-label={`${ch.code} ${t(ch.title, lang)}`}
                onClick={() => {
                  sound.click();
                  setSelectedId(ch.id);
                }}
              >
                <div className="node-core">
                  <span>{cleared ? p.rank : String(ch.id).padStart(2, '0')}</span>
                </div>
                {(ch.playable || isSel || cleared) && (
                  <span className="node-label">
                    {ch.code} · {t(ch.title, lang)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quick 15-Chapter Campaign Matrix below map */}
        <div className="panel-frame chamfer-sm" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--cyan)', fontWeight: 700 }}>
              15-SECTOR AP CSA CAMPAIGN MATRIX
            </span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
              {lang === 'zh-Hant' ? '橘框 = 可出擊關卡 (Ch.01–Ch.07)' : 'AMBER = LIVE PLAYABLE (CH.01–CH.07)'}
            </span>
          </div>
          <div className="chapter-roster">
            {CAMPAIGN_CHAPTERS.map((ch) => {
              const p = getChapterProgress(state, ch.id);
              const cleared = Boolean(p.rank);
              return (
                <button
                  key={ch.id}
                  type="button"
                  className={`roster-pill ${ch.playable ? 'playable' : ''} ${cleared ? 'cleared' : ''} ${ch.id === selected.id ? 'active' : ''}`}
                  onClick={() => {
                    sound.click();
                    setSelectedId(ch.id);
                  }}
                >
                  <div>{ch.code}</div>
                  <div style={{ fontSize: 10, opacity: 0.85 }}>
                    {cleared ? `RANK ${p.rank}` : ch.playable ? 'LIVE' : 'ARCH'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Tactical Sector Intel Panel */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="panel-frame sector-intel chamfer">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className="tac-tag cyan">
              {act.code} · {t(act.title, lang)}
            </span>
            {isCleared ? (
              <span className="tac-tag lime">
                <CheckCircle2 size={12} /> RANK {progress.rank}
              </span>
            ) : selected.playable ? (
              <span className="tac-tag amber">
                <ShieldAlert size={12} /> {lang === 'zh-Hant' ? '系統異常' : 'BREACH ACTIVE'}
              </span>
            ) : (
              <span className="tac-tag">
                <Lock size={12} /> {t(UI_COPY.upcomingTag, lang)}
              </span>
            )}
          </div>

          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
              {selected.code} // {t(act.unit, lang)}
            </div>
            <h2 style={{ fontSize: 28, marginTop: 4, color: 'var(--ink-primary)' }}>
              {t(selected.title, lang)}
            </h2>
            <div style={{ fontSize: 13, color: 'var(--cyan)', marginTop: 4, fontWeight: 600 }}>
              {t(selected.topic, lang)}
            </div>
          </div>

          <p style={{ fontSize: 13.5, color: 'var(--ink-secondary)' }}>
            {t(selected.summary, lang)}
          </p>

          <div
            style={{
              display: 'grid',
              gap: 8,
              padding: '10px 12px',
              background: 'rgba(6, 11, 18, 0.72)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--ink-muted)' }}>
                {lang === 'zh-Hant' ? '解鎖機體晶片' : 'FIRMWARE CHIP'}
              </span>
              <span className="mono" style={{ color: 'var(--lime)', fontWeight: 700 }}>
                {selected.chipName}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--ink-muted)' }}>
                {lang === 'zh-Hant' ? '核心語法' : 'SYNTAX'}
              </span>
              <code style={{ color: 'var(--cyan)' }}>{selected.chipSyntax}</code>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--ink-muted)' }}>
                {lang === 'zh-Hant' ? '區域頭目' : 'SECTOR BOSS'}
              </span>
              <span className="mono" style={{ color: 'var(--crimson)', fontWeight: 700 }}>
                {t(selected.bossName, lang)}
              </span>
            </div>
          </div>

          {selected.playable ? (
            <button
              type="button"
              className="tac-btn primary chamfer-sm"
              style={{ width: '100%', minHeight: 46, fontSize: 14 }}
              onClick={() => {
                sound.deploy();
                onDeployChapter(selected.id);
              }}
            >
              <Zap size={16} />
              {isCleared ? t(UI_COPY.replayBtn, lang) : t(UI_COPY.deployBtn, lang)}
            </button>
          ) : (
            <div
              style={{
                padding: '12px 14px',
                border: '1px dashed rgba(124, 155, 176, 0.45)',
                background: 'rgba(6, 11, 18, 0.6)',
                fontSize: 12.5,
                color: 'var(--ink-secondary)',
              }}
            >
              {t(UI_COPY.upcomingNote, lang)}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="tac-btn amber chamfer-sm"
                  style={{ flex: 1, fontSize: 11 }}
                  onClick={() => {
                    sound.click();
                    setSelectedId(2);
                  }}
                >
                  Ch.02 Market
                </button>
                <button
                  type="button"
                  className="tac-btn amber chamfer-sm"
                  style={{ flex: 1, fontSize: 11 }}
                  onClick={() => {
                    sound.click();
                    setSelectedId(5);
                  }}
                >
                  Ch.05 Surge
                </button>
                <button
                  type="button"
                  className="tac-btn amber chamfer-sm"
                  style={{ flex: 1, fontSize: 11 }}
                  onClick={() => {
                    sound.click();
                    setSelectedId(7);
                  }}
                >
                  Ch.07 Radar
                </button>
              </div>
            </div>
          )}
        </div>

        <MiraComms
          lang={lang}
          mood={selected.playable && !isCleared ? 'alert' : 'neutral'}
          message={
            selected.playable
              ? lang === 'zh-Hant'
                ? `已鎖定 ${selected.code} 異常訊號。準備好就啟動 DEPLOY，讓 UNIT-01 BYTE 切入系統！`
                : `${selected.code} anomaly locked on radar. Hit DEPLOY when you and your pilot are ready to send BYTE in!`
              : lang === 'zh-Hant'
                ? `${selected.code} 屬於後續戰役篇章。Act I & II（Ch.01–Ch.07）全部都已開放出擊！`
                : `${selected.code} is queued in the campaign archive. All 7 missions in Act I & II (Ch.01–Ch.07) are ready for deployment!`
          }
        />
      </aside>
    </main>
  );
};
