import React from 'react';
import { Lang, t, UI_COPY } from '../engine/i18n/text';
import { TraceFrame } from '../engine/vm';

export interface MemoryHudProps {
  frame: TraceFrame | null;
  stdout: string;
  lang: Lang;
}

export const MemoryHud: React.FC<MemoryHudProps> = ({ frame, stdout, lang }) => {
  const locals = frame?.locals ?? {};
  const entries = Object.entries(locals);

  return (
    <div className="panel-frame chamfer-sm" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--cyan)', fontWeight: 700, letterSpacing: '0.08em' }}>
          {t(UI_COPY.memoryTitle, lang)}
        </span>
        {frame?.changedVar && (
          <span className="tac-tag amber">
            {frame.changedVar}: {frame.prevValue !== undefined ? `${frame.prevValue} → ` : ''}
            {frame.newValue}
          </span>
        )}
      </div>

      {entries.length > 0 ? (
        <div className="memory-grid">
          {entries.map(([name, slot]) => {
            const isChanged = frame?.changedVar === name;
            return (
              <div key={name} className={`mem-slot ${isChanged ? 'changed' : ''}`}>
                <div className="mem-slot-name">{name}</div>
                <div className="mem-slot-val">{slot.value}</div>
                <div className="mem-slot-type">{slot.type}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mono" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
          {lang === 'zh-Hant' ? '尚無已宣告變數。部署程式以觀察暫存器。' : 'No registers allocated yet. Deploy code to inspect memory.'}
        </p>
      )}

      <div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-muted)', marginBottom: 4 }}>
          {t(UI_COPY.stdoutTitle, lang)}
        </div>
        <pre className="stdout-box">{stdout || (lang === 'zh-Hant' ? '(無主控台輸出)' : '(no console output)')}</pre>
      </div>
    </div>
  );
};
