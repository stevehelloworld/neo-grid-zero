import { Evaluator } from './evaluator';
import { LexerError, tokenize } from './lexer';
import { Expr, ParseError, Parser, Stmt } from './parser';
import { JValue, RunOptions, RunResult, VarPatchSpec } from './types';

export * from './types';

function makeLiteralExpr(val: number | string | boolean, line: number): Expr {
  if (typeof val === 'boolean') {
    return { kind: 'Literal', value: val, litType: 'boolean', line };
  }
  if (typeof val === 'string') {
    return { kind: 'Literal', value: val, litType: 'String', line };
  }
  return {
    kind: 'Literal',
    value: val,
    litType: Number.isInteger(val) ? 'int' : 'double',
    line,
  };
}

export function patchVarUpdates(stmts: Stmt[], specs: VarPatchSpec[]): Stmt[] {
  if (!specs.length) return stmts;
  const specMap = new Map(specs.map((s) => [s.name, s]));
  const seenDecl = new Set<string>();
  const seenReassign = new Set<string>();

  const walkExpr = (expr: Expr): Expr => {
    if (expr.kind === 'AssignExpr' && expr.op === '=' && expr.target.kind === 'Id') {
      const name = expr.target.name;
      const spec = specMap.get(name);
      if (spec) {
        if (!seenDecl.has(name) && spec.initial !== undefined) {
          seenDecl.add(name);
          return { ...expr, value: makeLiteralExpr(spec.initial, expr.line) };
        }
        if (!seenReassign.has(name) && spec.reassign !== undefined) {
          seenReassign.add(name);
          return { ...expr, value: makeLiteralExpr(spec.reassign, expr.line) };
        }
      }
    }
    return expr;
  };

  const walkStmt = (stmt: Stmt): Stmt => {
    switch (stmt.kind) {
      case 'VarDecl': {
        const declarators = stmt.declarators.map((d) => {
          const spec = specMap.get(d.name);
          if (spec && spec.initial !== undefined && !seenDecl.has(d.name) && d.init) {
            seenDecl.add(d.name);
            return { ...d, init: makeLiteralExpr(spec.initial, stmt.line) };
          }
          return d;
        });
        return { ...stmt, declarators };
      }
      case 'ExprStmt':
        return { ...stmt, expr: walkExpr(stmt.expr) };
      case 'Block':
        return { ...stmt, body: stmt.body.map(walkStmt) };
      case 'IfStmt':
        return {
          ...stmt,
          consequent: walkStmt(stmt.consequent),
          alternate: stmt.alternate ? walkStmt(stmt.alternate) : undefined,
        };
      case 'WhileStmt':
        return { ...stmt, body: walkStmt(stmt.body) };
      case 'ForStmt':
        return { ...stmt, body: walkStmt(stmt.body) };
      case 'ClassDecl':
        return { ...stmt, members: stmt.members.map(walkStmt) };
      case 'MethodDecl':
        return { ...stmt, body: stmt.body.map(walkStmt) };
      default:
        return stmt;
    }
  };

  return stmts.map(walkStmt);
}

function parseSource(source: string): Stmt[] {
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  return parser.parseProgram();
}

function parseErrorResult(err: unknown): RunResult {
  if (err instanceof LexerError || err instanceof ParseError) {
    return {
      ok: false,
      frames: [],
      stdout: '',
      finalLocals: {},
      error: { message: err.message, line: err.line, kind: 'syntax' },
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    ok: false,
    frames: [],
    stdout: '',
    finalLocals: {},
    error: { message, line: 1, kind: 'syntax' },
  };
}

export function runStatements(source: string, options: RunOptions = {}): RunResult {
  let ast: Stmt[];
  try {
    ast = parseSource(source);
    if (options.patches?.length) {
      ast = patchVarUpdates(ast, options.patches);
    }
  } catch (err) {
    return parseErrorResult(err);
  }
  const vm = new Evaluator(options);
  return vm.executeStatements(ast);
}

export function toJValue(v: number | string | boolean): JValue {
  if (typeof v === 'boolean') return { type: 'boolean', value: v };
  if (typeof v === 'string') return { type: 'String', value: v };
  return { type: Number.isInteger(v) ? 'int' : 'double', value: v };
}

export function runMethodCall(
  source: string,
  methodName: string,
  args: Array<number | string | boolean | JValue>,
  options: RunOptions = {},
): RunResult {
  let ast: Stmt[];
  try {
    ast = parseSource(source);
  } catch (err) {
    return parseErrorResult(err);
  }
  const jArgs: JValue[] = args.map((a) =>
    typeof a === 'object' && a !== null && 'type' in a ? a : toJValue(a),
  );
  const vm = new Evaluator(options);
  return vm.executeMethod(ast, methodName, jArgs);
}
