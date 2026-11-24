import React from 'react';
import { Check, Cpu, Lock, X } from 'lucide-react';
import { sound } from '../engine/audio/synth';
import { Lang, t } from '../engine/i18n/text';
import { ACT_META, CAMPAIGN_CHAPTERS } from '../game/campaignData';

export interface ChipBayModalProps {
  open: boolean;
  onClose: () => void;
  unlockedChips: string[];
  lang: Lang;
}

export const ChipBayModal: React.FC<ChipBayModalProps> = ({
  open,
  onClose,
  unlockedChips,
  lang,
}) => {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="BYTE Firmware Chip Bay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel-frame chamfer"
        style={{
          width: 'min(960px, 100%)',
          maxHeight: '88vh',
          overflowY: 'auto',
          padding: 22,
          borderColor: 'rgba(0, 240, 255, 0.45)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src="./assets/byte-unit.png"
              alt="UNIT-01 BYTE"
              style={{
                width: 64,
                height: 64,
                objectFit: 'contain',
                background: '#08121f',
                padding: 3,
                border: '1px solid var(--cyan)',
                borderRadius: 6,
              }}
            />
            <div>
              <span className="tac-tag cyan">UNIT-01 BYTE // FIRMWARE TREE</span>
              <h2 style={{ fontSize: 24, marginTop: 4 }}>
                {lang === 'zh-Hant' ? '機體核心晶片與 AP CSA 技能樹' : 'Mecha Firmware Chips & AP CSA Skill Tree'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            className="tac-btn ghost chamfer-sm"
            onClick={() => {
              sound.click();
              onClose();
            }}
            aria-label="Close chip bay"
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {([1, 2, 3, 4, 5] as const).map((actNum) => {
            const act = ACT_META[actNum];
            const chips = CAMPAIGN_CHAPTERS.filter((c) => c.act === actNum);
            return (
              <div key={actNum} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 700 }}>
                    {act.code} · {t(act.title, lang)}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                    {t(act.unit, lang)}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                  {chips.map((ch) => {
                    const unlocked = unlockedChips.includes(ch.chipId);
                    return (
                      <div
                        key={ch.chipId}
                        style={{
                          padding: '10px 12px',
                          background: unlocked ? 'rgba(184, 255, 60, 0.08)' : 'rgba(6, 11, 18, 0.7)',
                          border: `1px solid ${unlocked ? 'rgba(184, 255, 60, 0.55)' : 'var(--border-subtle)'}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                          <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: unlocked ? 'var(--lime)' : 'var(--ink-primary)' }}>
                            <Cpu size={12} style={{ verticalAlign: '-1px', marginRight: 5 }} />
                            {ch.chipName}
                          </span>
                          {unlocked ? (
                            <span className="tac-tag lime" style={{ padding: '1px 6px' }}>
                              <Check size={10} /> SYNCED
                            </span>
                          ) : (
                            <span className="tac-tag" style={{ padding: '1px 6px' }}>
                              <Lock size={10} /> {ch.code}
                            </span>
                          )}
                        </div>
                        <code style={{ display: 'block', fontSize: 11, color: 'var(--cyan)', marginTop: 6 }}>
                          {ch.chipSyntax}
                        </code>
                        <p style={{ fontSize: 12, color: 'var(--ink-secondary)', marginTop: 6 }}>
                          {t(ch.chipDesc, lang)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
