export type TokenKind =
  | 'num'
  | 'str'
  | 'id'
  | 'kw'
  | 'op'
  | 'punc'
  | 'eof';

export interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  col: number;
  isDouble?: boolean;
}

const KEYWORDS = new Set([
  'int',
  'double',
  'boolean',
  'String',
  'void',
  'true',
  'false',
  'null',
  'if',
  'else',
  'while',
  'for',
  'return',
  'break',
  'continue',
  'new',
  'static',
  'public',
  'private',
  'class',
  'this',
  'import',
]);

const MULTI_OPS = ['+=', '-=', '*=', '/=', '%=', '++', '--', '==', '!=', '<=', '>=', '&&', '||'];
const SINGLE_OPS = new Set(['+', '-', '*', '/', '%', '=', '<', '>', '!']);
const PUNCS = new Set(['(', ')', '{', '}', '[', ']', ';', ',', '.', ':']);

export class LexerError extends Error {
  public readonly line: number;
  constructor(message: string, line: number) {
    super(message);
    this.line = line;
  }
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const advance = (count = 1) => {
    for (let k = 0; k < count; k++) {
      if (source[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  while (i < source.length) {
    const ch = source[i];

    // Whitespace
    if (/\s/.test(ch)) {
      advance();
      continue;
    }

    // Line comment
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') advance();
      continue;
    }

    // Block comment
    if (ch === '/' && source[i + 1] === '*') {
      const startLine = line;
      advance(2);
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        advance();
      }
      if (i >= source.length) {
        throw new LexerError('Unclosed block comment /* ... */.', startLine);
      }
      advance(2);
      continue;
    }

    // String literal
    if (ch === '"') {
      const startLine = line;
      const startCol = col;
      advance(); // opening quote
      let val = '';
      let closed = false;
      while (i < source.length) {
        const c = source[i];
        if (c === '\n') {
          throw new LexerError('Unclosed string literal before end of line.', startLine);
        }
        if (c === '"') {
          advance();
          closed = true;
          break;
        }
        if (c === '\\') {
          advance();
          if (i >= source.length) {
            throw new LexerError('Incomplete escape sequence in string.', startLine);
          }
          const esc = source[i];
          if (esc === 'n') val += '\n';
          else if (esc === 't') val += '\t';
          else if (esc === 'r') val += '\r';
          else if (esc === '"') val += '"';
          else if (esc === '\\') val += '\\';
          else val += esc;
          advance();
        } else {
          val += c;
          advance();
        }
      }
      if (!closed) {
        throw new LexerError('Close the string literal with a double quote (").', startLine);
      }
      tokens.push({ kind: 'str', value: val, line: startLine, col: startCol });
      continue;
    }

    // Single-quoted char literal (treated as 1-char String in AP CSA subset)
    if (ch === "'") {
      const startLine = line;
      const startCol = col;
      advance(); // opening single quote
      let val = '';
      if (i >= source.length || source[i] === '\n') {
        throw new LexerError('Unclosed character literal.', startLine);
      }
      if (source[i] === '\\') {
        advance();
        if (i >= source.length) {
          throw new LexerError('Incomplete escape sequence in character literal.', startLine);
        }
        const esc = source[i];
        if (esc === 'n') val = '\n';
        else if (esc === 't') val = '\t';
        else if (esc === 'r') val = '\r';
        else if (esc === "'") val = "'";
        else if (esc === '\\') val = '\\';
        else val = esc;
        advance();
      } else {
        val = source[i];
        advance();
      }
      if (source[i] !== "'") {
        throw new LexerError("Close character literal with a single quote (').", startLine);
      }
      advance(); // closing single quote
      tokens.push({ kind: 'str', value: val, line: startLine, col: startCol });
      continue;
    }

    // Number literal
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const startLine = line;
      const startCol = col;
      let raw = '';
      let seenDot = false;
      while (i < source.length) {
        const c = source[i];
        if (/[0-9]/.test(c)) {
          raw += c;
          advance();
        } else if (c === '.' && !seenDot && /[0-9]/.test(source[i + 1] ?? '')) {
          seenDot = true;
          raw += c;
          advance();
        } else {
          break;
        }
      }
      tokens.push({
        kind: 'num',
        value: raw,
        line: startLine,
        col: startCol,
        isDouble: seenDot,
      });
      continue;
    }

    // Identifier or keyword
    if (/[A-Za-z_$]/.test(ch)) {
      const startLine = line;
      const startCol = col;
      let word = '';
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) {
        word += source[i];
        advance();
      }
      tokens.push({
        kind: KEYWORDS.has(word) ? 'kw' : 'id',
        value: word,
        line: startLine,
        col: startCol,
      });
      continue;
    }

    // Multi-char operator
    const two = source.slice(i, i + 2);
    if (MULTI_OPS.includes(two)) {
      tokens.push({ kind: 'op', value: two, line, col });
      advance(2);
      continue;
    }

    // Single-char operator
    if (SINGLE_OPS.has(ch)) {
      tokens.push({ kind: 'op', value: ch, line, col });
      advance();
      continue;
    }

    // Punctuation
    if (PUNCS.has(ch)) {
      tokens.push({ kind: 'punc', value: ch, line, col });
      advance();
      continue;
    }

    throw new LexerError(`Unexpected character '${ch}'.`, line);
  }

  tokens.push({ kind: 'eof', value: '', line, col });
  return tokens;
}
