import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Play } from 'lucide-react';
import { sound } from '../engine/audio/synth';
import { Lang, t, UI_COPY } from '../engine/i18n/text';
import { ACT_META, CAMPAIGN_CHAPTERS } from '../game/campaignData';
import { CampaignState, getChapterProgress } from '../game/store';

export interface WorldMapProps {
  state: CampaignState;
  onDeployChapter: (chapterId: number) => void;
}

export const WorldMap: React.FC<WorldMapProps> = ({ state, onDeployChapter }) => {
  const playableChapters = useMemo(
    () => CAMPAIGN_CHAPTERS.filter((c) => c.playable),
    [],
  );

  const recommendedId = useMemo(() => {
    const firstUnclear = playableChapters.find(
      (c) => !getChapterProgress(state, c.id).rank,
    );
    return firstUnclear?.id ?? 1;
  }, [playableChapters, state]);

  const [selectedId, setSelectedId] = useState<number>(() => recommendedId);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [cityImgErr, setCityImgErr] = useState(false);
  const [miraImgErr, setMiraImgErr] = useState(false);
  const lang: Lang = state.lang;

  const visibleChapters = showArchive ? CAMPAIGN_CHAPTERS : playableChapters;

  const selected =
    visibleChapters.find((c) => c.id === selectedId) ?? visibleChapters[0];
  const progress = getChapterProgress(state, selected.id);
  const isCleared = Boolean(progress.rank);
  const act = ACT_META[selected.act];

  const clearedCount = visibleChapters.filter(
    (c) => Boolean(getChapterProgress(state, c.id).rank),
  ).length;

  const stepSelection = (delta: -1 | 1) => {
    sound.click();
    const idx = visibleChapters.findIndex((c) => c.id === selected.id);
    const nextIdx = (idx + delta + visibleChapters.length) % visibleChapters.length;
    setSelectedId(visibleChapters[nextIdx].id);
  };

  const handleNodeClick = (chapterId: number, playable: boolean) => {
    if (playable && selectedId === chapterId) {
      sound.deploy();
      onDeployChapter(chapterId);
      return;
    }
    sound.click();
    setSelectedId(chapterId);
  };

  const miraSrc =
    selected.playable && !isCleared
      ? './assets/mira-alert.png'
      : './assets/mira-neutral.png';

  const miraLine = selected.playable
    ? isCleared
      ? lang === 'zh-Hant'
        ? `${selected.code} 已通關 (${progress.rank})，可隨時重玩或用 Shift+G 加題。`
        : `${selected.code} cleared (${progress.rank}-Rank). Replay or inject custom waves.`
      : lang === 'zh-Hant'
        ? `偵測到 ${selected.code} 異常，按下「出擊」立刻派 BYTE 切入！`
        : `${selected.code} breach active. Hit PLAY to deploy BYTE!`
    : lang === 'zh-Hant'
      ? `${selected.code} 為 Act III–V 後續章節預覽，先攻克 01–07 吧！`
      : `${selected.code} opens in Act III–V. Sectors 01–07 are ready to play.`;

  return (
    <main className="world-stage">
      {!cityImgErr && (
        <img
          className="world-bg"
          src="./assets/aether-city.png"
          alt="Aether-9 island megacity tactical map"
          onError={() => setCityImgErr(true)}
        />
      )}
      <div className="world-vignette" />

      {/* Power conduit links between visible sectors */}
      <svg
        className="world-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {visibleChapters.slice(0, -1).map((ch, idx) => {
          const next = visibleChapters[idx + 1];
          const chDone = Boolean(getChapterProgress(state, ch.id).rank);
          const activeLink = ch.playable && next.playable;
          return (
            <line
              key={ch.id}
              x1={ch.mapPos.x}
              y1={ch.mapPos.y}
              x2={next.mapPos.x}
              y2={next.mapPos.y}
              stroke={
                chDone
                  ? 'rgba(184, 255, 60, 0.72)'
                  : activeLink
                    ? 'rgba(0, 240, 255, 0.42)'
                    : 'rgba(148, 179, 204, 0.22)'
              }
              strokeWidth={chDone ? 0.5 : 0.32}
              strokeDasharray={chDone ? undefined : '1.3 1.1'}
            />
          );
        })}
      </svg>

      {/* Lightweight corner HUD pills */}
      <div className="world-corners">
        <button
          type="button"
          className={`world-corner-pill toggle ${showArchive ? 'active' : ''}`}
          onClick={() => {
            sound.click();
            const next = !showArchive;
            setShowArchive(next);
            if (!next && !selected.playable) {
              setSelectedId(recommendedId);
            }
          }}
        >
          <Lock size={12} />
          <span>
            {lang === 'zh-Hant' ? 'Act III–V (08–15)' : 'Act III–V (08–15)'}
          </span>
        </button>

        <div className="world-corner-pill mono">
          {clearedCount} / {visibleChapters.length}{' '}
          {lang === 'zh-Hant' ? '已修復' : 'SYNCED'}
        </div>
      </div>

      {/* Interactive Sector Pins */}
      {visibleChapters.map((ch) => {
        const p = getChapterProgress(state, ch.id);
        const cleared = Boolean(p.rank);
        const isSel = ch.id === selected.id;
        const isHover = hoveredId === ch.id;
        const isRec = ch.playable && !cleared && ch.id === recommendedId;
        const labelBelow = ch.mapPos.y < 26;

        const classes = [
          'map-node',
          ch.playable ? 'playable' : 'archived',
          cleared ? 'cleared' : '',
          isRec ? 'recommended' : '',
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
            onClick={() => handleNodeClick(ch.id, ch.playable)}
            onDoubleClick={() => {
              if (ch.playable) {
                sound.deploy();
                onDeployChapter(ch.id);
              }
            }}
            onMouseEnter={() => setHoveredId(ch.id)}
            onMouseLeave={() => setHoveredId((prev) => (prev === ch.id ? null : prev))}
          >
            <div className="node-core">
              <span>{cleared ? p.rank : String(ch.id).padStart(2, '0')}</span>
            </div>
            {(isSel || isHover) && (
              <span className={`node-label ${labelBelow ? 'below' : 'above'}`}>
                {String(ch.id).padStart(2, '0')} · {t(ch.title, lang)}
              </span>
            )}
          </button>
        );
      })}

      {/* Floating Bottom Mission Launch Dock */}
      <section className="map-float-dock" aria-label="Selected sector">
        <div className="dock-left">
          <div className="dock-nav">
            <button
              type="button"
              className="dock-step-btn"
              onClick={() => stepSelection(-1)}
              aria-label="Previous sector"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="dock-step-btn"
              onClick={() => stepSelection(1)}
              aria-label="Next sector"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="dock-meta">
            <div className="dock-title-row">
              <span className="mono dock-code">
                {act.code} · {selected.code}
              </span>
              <h1 className="dock-title">{t(selected.title, lang)}</h1>
              {isCleared && (
                <span className="dock-rank-badge mono">RANK {progress.rank}</span>
              )}
            </div>
            <p className="dock-sub">
              {t(selected.topic, lang)} · Boss: {t(selected.bossName, lang)}
            </p>
          </div>
        </div>

        <div className="dock-mira">
          <div className="dock-mira-avatar">
            {!miraImgErr ? (
              <img
                src={miraSrc}
                alt="Mira"
                onError={() => setMiraImgErr(true)}
              />
            ) : (
              <span className="mono">M</span>
            )}
          </div>
          <p className="dock-mira-line">{miraLine}</p>
        </div>

        <div className="dock-cta">
          {selected.playable ? (
            <button
              type="button"
              className="tac-btn primary dock-play-btn"
              onClick={() => {
                sound.deploy();
                onDeployChapter(selected.id);
              }}
            >
              <Play size={15} fill="currentColor" />
              <span>
                {isCleared ? t(UI_COPY.replayBtn, lang) : t(UI_COPY.playBtn, lang)}
              </span>
            </button>
          ) : (
            <div className="dock-locked-actions">
              <span className="dock-locked-tag mono">
                <Lock size={12} /> {t(UI_COPY.upcomingTag, lang)}
              </span>
              <button
                type="button"
                className="tac-btn ghost dock-jump-btn"
                onClick={() => {
                  sound.click();
                  setSelectedId(recommendedId);
                }}
              >
                {lang === 'zh-Hant'
                  ? `前往 Ch.${String(recommendedId).padStart(2, '0')}`
                  : `Jump to Ch.${String(recommendedId).padStart(2, '0')}`}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
};
