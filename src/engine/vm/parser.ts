import { Token } from './lexer';

export interface TypeRef {
  base: string;
  dims: number;
  generic?: string;
}

export type Expr =
  | { kind: 'Literal'; value: number | string | boolean | null; litType: 'int' | 'double' | 'String' | 'boolean' | 'null'; line: number }
  | { kind: 'Id'; name: string; line: number }
  | { kind: 'This'; line: number }
  | { kind: 'Unary'; op: '-' | '+' | '!'; arg: Expr; line: number }
  | { kind: 'Cast'; targetType: 'int' | 'double'; arg: Expr; line: number }
  | { kind: 'Update'; op: '++' | '--'; prefix: boolean; arg: Expr; line: number }
  | { kind: 'Binary'; op: string; left: Expr; right: Expr; line: number }
  | { kind: 'AssignExpr'; op: string; target: Expr; value: Expr; line: number }
  | { kind: 'Member'; object: Expr; property: string; line: number }
  | { kind: 'Index'; object: Expr; index: Expr; line: number }
  | { kind: 'Call'; callee: Expr; args: Expr[]; line: number }
  | { kind: 'NewObject'; className: string; generic?: string; args: Expr[]; line: number }
  | { kind: 'NewArray'; elemType: string; dims: Expr[]; line: number }
  | { kind: 'ArrayInit'; elements: Expr[]; line: number };

export interface VarDeclarator {
  name: string;
  init?: Expr;
}

export interface ParamDecl {
  typeRef: TypeRef;
  name: string;
}

export type Stmt =
  | { kind: 'VarDecl'; typeRef: TypeRef; declarators: VarDeclarator[]; line: number }
  | { kind: 'ExprStmt'; expr: Expr; line: number }
  | { kind: 'Block'; body: Stmt[]; line: number }
  | { kind: 'IfStmt'; test: Expr; testText: string; consequent: Stmt; alternate?: Stmt; line: number }
  | { kind: 'WhileStmt'; test: Expr; testText: string; body: Stmt; line: number }
  | { kind: 'ForStmt'; init?: Stmt; test?: Expr; testText: string; update?: Expr; body: Stmt; line: number }
  | { kind: 'ForEachStmt'; typeRef: TypeRef; varName: string; iterable: Expr; body: Stmt; line: number }
  | { kind: 'ReturnStmt'; argument?: Expr; line: number }
  | { kind: 'BreakStmt'; line: number }
  | { kind: 'ContinueStmt'; line: number }
  | { kind: 'MethodDecl'; name: string; returnType: TypeRef; params: ParamDecl[]; body: Stmt[]; isStatic: boolean; line: number }
  | { kind: 'ConstructorDecl'; name: string; params: ParamDecl[]; body: Stmt[]; line: number }
  | { kind: 'FieldDecl'; typeRef: TypeRef; declarators: VarDeclarator[]; isStatic: boolean; isPrivate: boolean; line: number }
  | { kind: 'ClassDecl'; name: string; members: Stmt[]; line: number };

export class ParseError extends Error {
  public readonly line: number;
  constructor(message: string, line: number) {
    super(message);
    this.line = line;
  }
}

export class Parser {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private advance(): Token {
    const t = this.peek();
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  private check(kind: Token['kind'], value?: string): boolean {
    const t = this.peek();
    return t.kind === kind && (value === undefined || t.value === value);
  }

  private match(kind: Token['kind'], value?: string): Token | null {
    if (this.check(kind, value)) return this.advance();
    return null;
  }

  private expect(kind: Token['kind'], value: string, message?: string): Token {
    const t = this.peek();
    if (t.kind === kind && t.value === value) return this.advance();
    throw new ParseError(message ?? `Expected '${value}' near '${t.value || 'end of file'}'.`, t.line);
  }

  private expectId(message?: string): Token {
    const t = this.peek();
    if (t.kind === 'id') return this.advance();
    throw new ParseError(message ?? `Expected an identifier near '${t.value || 'end of file'}'.`, t.line);
  }

  public parseProgram(): Stmt[] {
    const stmts: Stmt[] = [];
    while (!this.check('eof')) {
      if (this.check('kw', 'import')) {
        while (!this.check('eof') && !this.check('punc', ';')) this.advance();
        this.match('punc', ';');
        continue;
      }
      stmts.push(this.parseTopLevelItem());
    }
    return stmts;
  }

  private parseTopLevelItem(): Stmt {
    const saved = this.pos;
    // Skip optional modifiers to check if this is a class or method declaration
    while (this.check('kw', 'public') || this.check('kw', 'private') || this.check('kw', 'static')) {
      this.advance();
    }
    if (this.check('kw', 'class')) {
      this.pos = saved;
      return this.parseClassDecl();
    }
    // Check if method declaration: Type name(...) {
    if (this.looksLikeType()) {
      this.parseTypeRef();
      if (this.check('id') && this.peek(1).value === '(') {
        this.pos = saved;
        return this.parseMethodOrField(false);
      }
    }
    this.pos = saved;
    return this.parseStmt();
  }

  private parseClassDecl(): Stmt {
    const startLine = this.peek().line;
    while (this.check('kw', 'public') || this.check('kw', 'private') || this.check('kw', 'static')) {
      this.advance();
    }
    this.expect('kw', 'class');
    const nameTok = this.expectId('Expected class name.');
    this.expect('punc', '{', `Expected '{' after class ${nameTok.value}.`);
    const members: Stmt[] = [];
    while (!this.check('punc', '}') && !this.check('eof')) {
      members.push(this.parseMethodOrField(true, nameTok.value));
    }
    this.expect('punc', '}', `Expected '}' to close class ${nameTok.value}.`);
    return { kind: 'ClassDecl', name: nameTok.value, members, line: startLine };
  }

  private parseMethodOrField(insideClass: boolean, className?: string): Stmt {
    const startLine = this.peek().line;
    let isStatic = false;
    let isPrivate = false;
    while (this.check('kw', 'public') || this.check('kw', 'private') || this.check('kw', 'static')) {
      const mod = this.advance().value;
      if (mod === 'static') isStatic = true;
      if (mod === 'private') isPrivate = true;
    }

    // Constructor: ClassName(...) { ... }
    if (insideClass && className && this.check('id', className) && this.peek(1).value === '(') {
      this.advance();
      const params = this.parseParamList();
      const body = this.parseBlock();
      return { kind: 'ConstructorDecl', name: className, params, body: body.kind === 'Block' ? body.body : [body], line: startLine };
    }

    const typeRef = this.parseTypeRef();
    const nameTok = this.expectId('Expected method or variable name.');

    if (this.check('punc', '(')) {
      const params = this.parseParamList();
      const body = this.parseBlock();
      return {
        kind: 'MethodDecl',
        name: nameTok.value,
        returnType: typeRef,
        params,
        body: body.kind === 'Block' ? body.body : [body],
        isStatic,
        line: startLine,
      };
    }

    // Field declaration
    const declarators: VarDeclarator[] = [];
    while (true) {
      const vName = declarators.length === 0 ? nameTok.value : this.expectId('Expected field name.').value;
      let init: Expr | undefined;
      if (this.match('op', '=')) {
        init = this.parseExprOrArrayInit();
      }
      declarators.push({ name: vName, init });
      if (!this.match('punc', ',')) break;
    }
    this.expect('punc', ';', 'Expected ";" after declaration.');
    if (insideClass) {
      return { kind: 'FieldDecl', typeRef, declarators, isStatic, isPrivate, line: startLine };
    }
    return { kind: 'VarDecl', typeRef, declarators, line: startLine };
  }

  private parseParamList(): ParamDecl[] {
    this.expect('punc', '(');
    const params: ParamDecl[] = [];
    if (!this.check('punc', ')')) {
      while (true) {
        const typeRef = this.parseTypeRef();
        const name = this.expectId('Expected parameter name.').value;
        params.push({ typeRef, name });
        if (!this.match('punc', ',')) break;
      }
    }
    this.expect('punc', ')');
    return params;
  }

  private looksLikeType(): boolean {
    const t = this.peek();
    if (
      t.kind === 'kw' &&
      (t.value === 'int' || t.value === 'double' || t.value === 'boolean' || t.value === 'String' || t.value === 'void')
    ) {
      return true;
    }
    if (t.kind === 'id') {
      // Type followed by id, '<', or '[' ']'
      const next = this.peek(1);
      if (next.kind === 'id') return true;
      if (next.kind === 'op' && next.value === '<') return true;
      if (next.kind === 'punc' && next.value === '[' && this.peek(2).value === ']') return true;
    }
    return false;
  }

  private parseTypeRef(): TypeRef {
    const t = this.peek();
    if (
      t.kind === 'kw' &&
      (t.value === 'int' || t.value === 'double' || t.value === 'boolean' || t.value === 'String' || t.value === 'void')
    ) {
      this.advance();
    } else if (t.kind === 'id') {
      this.advance();
    } else {
      throw new ParseError(`Expected a Java type near '${t.value}'.`, t.line);
    }

    let generic: string | undefined;
    if (this.match('op', '<')) {
      const g = this.peek();
      if (g.kind === 'id' || g.kind === 'kw') {
        generic = this.advance().value;
      } else {
        throw new ParseError('Expected generic type parameter inside <...>.', g.line);
      }
      this.expect('op', '>', 'Expected ">" after generic type.');
    }

    let dims = 0;
    while (this.check('punc', '[') && this.peek(1).value === ']') {
      this.advance();
      this.advance();
      dims++;
    }

    return { base: t.value, dims, generic };
  }

  private isVarDeclStart(): boolean {
    const saved = this.pos;
    if (!this.looksLikeType()) return false;
    try {
      this.parseTypeRef();
      const isDecl = this.check('id');
      this.pos = saved;
      return isDecl;
    } catch {
      this.pos = saved;
      return false;
    }
  }

  private parseStmt(): Stmt {
    const t = this.peek();
    if (this.check('punc', ';')) {
      this.advance();
      return { kind: 'Block', body: [], line: t.line };
    }
    if (this.check('punc', '{')) return this.parseBlock();
    if (this.check('kw', 'if')) return this.parseIf();
    if (this.check('kw', 'while')) return this.parseWhile();
    if (this.check('kw', 'for')) return this.parseFor();
    if (this.check('kw', 'return')) return this.parseReturn();
    if (this.check('kw', 'break')) {
      this.advance();
      this.expect('punc', ';', 'Expected ";" after break.');
      return { kind: 'BreakStmt', line: t.line };
    }
    if (this.check('kw', 'continue')) {
      this.advance();
      this.expect('punc', ';', 'Expected ";" after continue.');
      return { kind: 'ContinueStmt', line: t.line };
    }
    if (this.isVarDeclStart()) return this.parseVarDecl();

    const expr = this.parseExpr();
    this.expect('punc', ';', 'End every statement with a semicolon (;).');
    return { kind: 'ExprStmt', expr, line: t.line };
  }

  private parseBlock(): Stmt {
    const startLine = this.peek().line;
    this.expect('punc', '{');
    const body: Stmt[] = [];
    while (!this.check('punc', '}') && !this.check('eof')) {
      body.push(this.parseStmt());
    }
    this.expect('punc', '}', 'Expected "}" to close block.');
    return { kind: 'Block', body, line: startLine };
  }

  private parseVarDecl(): Stmt {
    const startLine = this.peek().line;
    const typeRef = this.parseTypeRef();
    const declarators: VarDeclarator[] = [];
    while (true) {
      const name = this.expectId('Expected variable name.').value;
      let init: Expr | undefined;
      if (this.match('op', '=')) {
        init = this.parseExprOrArrayInit();
      }
      declarators.push({ name, init });
      if (!this.match('punc', ',')) break;
    }
    this.expect('punc', ';', 'End variable declaration with a semicolon (;).');
    return { kind: 'VarDecl', typeRef, declarators, line: startLine };
  }

  private formatTokensSlice(startPos: number, endPos: number): string {
    return this.tokens
      .slice(startPos, endPos)
      .map((tk) => (tk.kind === 'str' ? `"${tk.value}"` : tk.value))
      .join(' ')
      .replace(/\s+\(/g, '(')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\s+\./g, '.')
      .replace(/\.\s+/g, '.')
      .replace(/\s+;/g, ';')
      .trim();
  }

  private parseIf(): Stmt {
    const startLine = this.peek().line;
    this.expect('kw', 'if');
    this.expect('punc', '(', 'Expected "(" after if.');
    const exprStart = this.pos;
    const test = this.parseExpr();
    const exprEnd = this.pos;
    this.expect('punc', ')', 'Expected ")" after if condition.');
    const consequent = this.parseStmt();
    let alternate: Stmt | undefined;
    if (this.match('kw', 'else')) {
      alternate = this.parseStmt();
    }
    return {
      kind: 'IfStmt',
      test,
      testText: this.formatTokensSlice(exprStart, exprEnd),
      consequent,
      alternate,
      line: startLine,
    };
  }

  private parseWhile(): Stmt {
    const startLine = this.peek().line;
    this.expect('kw', 'while');
    this.expect('punc', '(', 'Expected "(" after while.');
    const exprStart = this.pos;
    const test = this.parseExpr();
    const exprEnd = this.pos;
    this.expect('punc', ')', 'Expected ")" after while condition.');
    const body = this.parseStmt();
    return {
      kind: 'WhileStmt',
      test,
      testText: this.formatTokensSlice(exprStart, exprEnd),
      body,
      line: startLine,
    };
  }

  private parseFor(): Stmt {
    const startLine = this.peek().line;
    this.expect('kw', 'for');
    this.expect('punc', '(', 'Expected "(" after for.');

    // Check for enhanced for-each: for (Type name : iterable)
    const saved = this.pos;
    if (this.looksLikeType()) {
      try {
        const typeRef = this.parseTypeRef();
        if (this.check('id') && this.peek(1).value === ':') {
          const varName = this.advance().value;
          this.advance(); // ':'
          const iterable = this.parseExpr();
          this.expect('punc', ')');
          const body = this.parseStmt();
          return { kind: 'ForEachStmt', typeRef, varName, iterable, body, line: startLine };
        }
      } catch {
        // Fall back to standard for
      }
    }
    this.pos = saved;

    let init: Stmt | undefined;
    if (!this.match('punc', ';')) {
      if (this.isVarDeclStart()) {
        init = this.parseVarDecl();
      } else {
        const expr = this.parseExpr();
        this.expect('punc', ';');
        init = { kind: 'ExprStmt', expr, line: startLine };
      }
    }

    let test: Expr | undefined;
    const testStart = this.pos;
    if (!this.check('punc', ';')) {
      test = this.parseExpr();
    }
    const testEnd = this.pos;
    this.expect('punc', ';');

    let update: Expr | undefined;
    if (!this.check('punc', ')')) {
      update = this.parseExpr();
    }
    this.expect('punc', ')');
    const body = this.parseStmt();
    return {
      kind: 'ForStmt',
      init,
      test,
      testText: test ? this.formatTokensSlice(testStart, testEnd) : 'true',
      update,
      body,
      line: startLine,
    };
  }

  private parseReturn(): Stmt {
    const startLine = this.peek().line;
    this.expect('kw', 'return');
    let argument: Expr | undefined;
    if (!this.check('punc', ';')) {
      argument = this.parseExpr();
    }
    this.expect('punc', ';', 'Expected ";" after return statement.');
    return { kind: 'ReturnStmt', argument, line: startLine };
  }

  private parseExprOrArrayInit(): Expr {
    if (this.check('punc', '{')) {
      return this.parseArrayInit();
    }
    return this.parseExpr();
  }

  private parseArrayInit(): Expr {
    const line = this.peek().line;
    this.expect('punc', '{');
    const elements: Expr[] = [];
    if (!this.check('punc', '}')) {
      while (true) {
        elements.push(this.parseExprOrArrayInit());
        if (!this.match('punc', ',')) break;
      }
    }
    this.expect('punc', '}');
    return { kind: 'ArrayInit', elements, line };
  }

  public parseExpr(): Expr {
    return this.parseAssign();
  }

  private parseAssign(): Expr {
    const left = this.parseOr();
    const t = this.peek();
    if (
      t.kind === 'op' &&
      ['=', '+=', '-=', '*=', '/=', '%='].includes(t.value)
    ) {
      this.advance();
      const value = this.parseAssign();
      return { kind: 'AssignExpr', op: t.value, target: left, value, line: t.line };
    }
    return left;
  }

  private parseOr(): Expr {
    let expr = this.parseAnd();
    while (this.check('op', '||')) {
      const op = this.advance();
      const right = this.parseAnd();
      expr = { kind: 'Binary', op: '||', left: expr, right, line: op.line };
    }
    return expr;
  }

  private parseAnd(): Expr {
    let expr = this.parseEquality();
    while (this.check('op', '&&')) {
      const op = this.advance();
      const right = this.parseEquality();
      expr = { kind: 'Binary', op: '&&', left: expr, right, line: op.line };
    }
    return expr;
  }

  private parseEquality(): Expr {
    let expr = this.parseComparison();
    while (this.check('op', '==') || this.check('op', '!=')) {
      const op = this.advance();
      const right = this.parseComparison();
      expr = { kind: 'Binary', op: op.value, left: expr, right, line: op.line };
    }
    return expr;
  }

  private parseComparison(): Expr {
    let expr = this.parseAdditive();
    while (
      this.check('op', '<') ||
      this.check('op', '<=') ||
      this.check('op', '>') ||
      this.check('op', '>=')
    ) {
      const op = this.advance();
      const right = this.parseAdditive();
      expr = { kind: 'Binary', op: op.value, left: expr, right, line: op.line };
    }
    return expr;
  }

  private parseAdditive(): Expr {
    let expr = this.parseMultiplicative();
    while (this.check('op', '+') || this.check('op', '-')) {
      const op = this.advance();
      const right = this.parseMultiplicative();
      expr = { kind: 'Binary', op: op.value, left: expr, right, line: op.line };
    }
    return expr;
  }

  private parseMultiplicative(): Expr {
    let expr = this.parseUnary();
    while (this.check('op', '*') || this.check('op', '/') || this.check('op', '%')) {
      const op = this.advance();
      const right = this.parseUnary();
      expr = { kind: 'Binary', op: op.value, left: expr, right, line: op.line };
    }
    return expr;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    // Cast expression: (int) x or (double) x
    if (
      this.check('punc', '(') &&
      (this.peek(1).value === 'int' || this.peek(1).value === 'double') &&
      this.peek(2).value === ')'
    ) {
      this.advance(); // (
      const targetType = this.advance().value as 'int' | 'double';
      this.advance(); // )
      const arg = this.parseUnary();
      return { kind: 'Cast', targetType, arg, line: t.line };
    }

    if (this.check('op', '!') || this.check('op', '-') || this.check('op', '+')) {
      const op = this.advance().value as '!' | '-' | '+';
      const arg = this.parseUnary();
      return { kind: 'Unary', op, arg, line: t.line };
    }

    if (this.check('op', '++') || this.check('op', '--')) {
      const op = this.advance().value as '++' | '--';
      const arg = this.parseUnary();
      return { kind: 'Update', op, prefix: true, arg, line: t.line };
    }

    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();
    while (true) {
      const t = this.peek();
      if (this.match('punc', '.')) {
        const prop = this.expectId('Expected member name after ".".');
        expr = { kind: 'Member', object: expr, property: prop.value, line: t.line };
      } else if (this.match('punc', '[')) {
        const index = this.parseExpr();
        this.expect('punc', ']', 'Expected "]" after array index.');
        expr = { kind: 'Index', object: expr, index, line: t.line };
      } else if (this.match('punc', '(')) {
        const args: Expr[] = [];
        if (!this.check('punc', ')')) {
          while (true) {
            args.push(this.parseExpr());
            if (!this.match('punc', ',')) break;
          }
        }
        this.expect('punc', ')', 'Expected ")" after method arguments.');
        expr = { kind: 'Call', callee: expr, args, line: t.line };
      } else if (this.check('op', '++') || this.check('op', '--')) {
        const op = this.advance().value as '++' | '--';
        expr = { kind: 'Update', op, prefix: false, arg: expr, line: t.line };
      } else {
        break;
      }
    }
    return expr;
  }

  private parsePrimary(): Expr {
    const t = this.peek();

    if (t.kind === 'num') {
      this.advance();
      return {
        kind: 'Literal',
        value: Number(t.value),
        litType: t.isDouble ? 'double' : 'int',
        line: t.line,
      };
    }

    if (t.kind === 'str') {
      this.advance();
      return { kind: 'Literal', value: t.value, litType: 'String', line: t.line };
    }

    if (t.kind === 'kw' && (t.value === 'true' || t.value === 'false')) {
      this.advance();
      return { kind: 'Literal', value: t.value === 'true', litType: 'boolean', line: t.line };
    }

    if (t.kind === 'kw' && t.value === 'null') {
      this.advance();
      return { kind: 'Literal', value: null, litType: 'null', line: t.line };
    }

    if (t.kind === 'kw' && t.value === 'this') {
      this.advance();
      return { kind: 'This', line: t.line };
    }

    if (t.kind === 'kw' && t.value === 'new') {
      return this.parseNewExpr();
    }

    if (t.kind === 'id') {
      this.advance();
      return { kind: 'Id', name: t.value, line: t.line };
    }

    if (this.match('punc', '(')) {
      const inner = this.parseExpr();
      this.expect('punc', ')', 'Expected closing ")".');
      return inner;
    }

    throw new ParseError(`Unexpected token '${t.value || 'end of input'}'.`, t.line);
  }

  private parseNewExpr(): Expr {
    const line = this.peek().line;
    this.expect('kw', 'new');
    const typeTok = this.peek();
    if (typeTok.kind !== 'id' && typeTok.kind !== 'kw') {
      throw new ParseError('Expected type name after "new".', line);
    }
    const baseName = this.advance().value;

    // new int[5] or new int[2][3] or new int[]{1, 2}
    if (this.check('punc', '[')) {
      const dims: Expr[] = [];
      let emptyDims = 0;
      while (this.match('punc', '[')) {
        if (this.check('punc', ']')) {
          this.advance();
          emptyDims++;
        } else {
          dims.push(this.parseExpr());
          this.expect('punc', ']');
        }
      }
      if (emptyDims > 0 && this.check('punc', '{')) {
        return this.parseArrayInit();
      }
      return { kind: 'NewArray', elemType: baseName, dims, line };
    }

    // Generic <> or <Integer>
    let generic: string | undefined;
    if (this.match('op', '<')) {
      if (!this.check('op', '>')) {
        generic = this.advance().value;
      }
      this.expect('op', '>');
    }

    this.expect('punc', '(', `Expected "(" after new ${baseName}.`);
    const args: Expr[] = [];
    if (!this.check('punc', ')')) {
      while (true) {
        args.push(this.parseExpr());
        if (!this.match('punc', ',')) break;
      }
    }
    this.expect('punc', ')');
    return { kind: 'NewObject', className: baseName, generic, args, line };
  }
}
