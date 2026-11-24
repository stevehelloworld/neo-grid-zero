import React, { useEffect, useRef, useState } from 'react';
import { basicSetup } from 'codemirror';
import { EditorView, Decoration, DecorationSet, keymap } from '@codemirror/view';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { indentWithTab } from '@codemirror/commands';
import { java } from '@codemirror/lang-java';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { BookOpen, RotateCcw } from 'lucide-react';
import { sound } from '../engine/audio/synth';
import { Lang, t, UI_COPY } from '../engine/i18n/text';

export interface CodeTerminalProps {
  value: string;
  onChange: (next: string) => void;
  activeLine?: number | null;
  starterCode?: string;
  lang: Lang;
  readOnly?: boolean;
  quickRefContent?: React.ReactNode;
}

const setActiveLineEffect = StateEffect.define<number | null>();

const activeLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setActiveLineEffect)) {
        const lineNum = effect.value;
        if (!lineNum || lineNum < 1 || lineNum > tr.state.doc.lines) {
          return Decoration.none;
        }
        const line = tr.state.doc.line(lineNum);
        return Decoration.set([
          Decoration.line({ class: 'cm-active-trace-line' }).range(line.from),
        ]);
      }
    }
    return decos.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

const animeSyntax = HighlightStyle.define([
  { tag: tags.keyword, color: '#FF9500', fontWeight: '700' },
  { tag: tags.typeName, color: '#00F0FF', fontWeight: '600' },
  { tag: tags.string, color: '#B8FF3C' },
  { tag: tags.number, color: '#FFD166' },
  { tag: tags.bool, color: '#FF6B90', fontWeight: '700' },
  { tag: tags.comment, color: '#5A788E', fontStyle: 'italic' },
  { tag: tags.operator, color: '#7CE8FF' },
  { tag: tags.variableName, color: '#E8F4F2' },
  { tag: tags.function(tags.variableName), color: '#52F7FF' },
]);

const animeTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#07101a',
      color: '#e8f4f2',
    },
    '.cm-content': {
      caretColor: '#00f0ff',
      padding: '10px 0',
      fontFamily: 'var(--font-mono)',
    },
    '.cm-gutters': {
      backgroundColor: '#050b12',
      color: '#4e6b80',
      borderRight: '1px solid rgba(148, 179, 204, 0.14)',
      fontFamily: 'var(--font-mono)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(0, 240, 255, 0.08)',
      color: '#00f0ff',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(0, 240, 255, 0.04)',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(0, 240, 255, 0.22) !important',
    },
    '.cm-cursor': {
      borderLeftColor: '#00f0ff',
    },
  },
  { dark: true },
);

export const CodeTerminal: React.FC<CodeTerminalProps> = ({
  value,
  onChange,
  activeLine = null,
  starterCode,
  lang,
  readOnly = false,
  quickRefContent,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [showRef, setShowRef] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        java(),
        EditorView.lineWrapping,
        animeTheme,
        syntaxHighlighting(animeSyntax),
        activeLineField,
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setActiveLineEffect.of(activeLine ?? null) });
  }, [activeLine]);

  return (
    <div className="code-terminal-wrap">
      <div className="code-toolbar">
        <span className="code-lang-label mono">Java</span>
        <div className="code-tools">
          <button
            type="button"
            className={`code-tool-btn ${showRef ? 'active' : ''}`}
            onClick={() => {
              sound.click();
              setShowRef((s) => !s);
            }}
          >
            <BookOpen size={12} />
            <span>{t(UI_COPY.quickRef, lang)}</span>
          </button>
          {starterCode !== undefined && !readOnly && (
            <button
              type="button"
              className="code-tool-btn"
              onClick={() => {
                sound.click();
                onChange(starterCode);
              }}
            >
              <RotateCcw size={12} />
              <span>{t(UI_COPY.resetCode, lang)}</span>
            </button>
          )}
        </div>
      </div>

      {showRef && (
        <div className="code-quickref">
          {quickRefContent ?? (
            <div className="mono quickref-lines">
              <div><strong style={{ color: 'var(--cyan)' }}>int</strong> · whole numbers: <code>int energy = 120;</code></div>
              <div><strong style={{ color: 'var(--cyan)' }}>double</strong> · decimals: <code>double eff = 0.85;</code></div>
              <div><strong style={{ color: 'var(--cyan)' }}>boolean</strong> · <code>true</code> or <code>false</code></div>
              <div><strong style={{ color: 'var(--cyan)' }}>String</strong> · double quotes: <code>"CLEAR"</code></div>
              <div><strong style={{ color: 'var(--amber)' }}>if / else if / else</strong> · runs first matching branch only</div>
            </div>
          )}
        </div>
      )}

      <div ref={hostRef} className="cm-wrapper" aria-label="Java code editor" />
    </div>
  );
};
