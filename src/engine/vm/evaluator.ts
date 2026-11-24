import {
  Expr,
  Stmt,
  TypeRef,
} from './parser';
import {
  formatJavaValue,
  JObjectInstance,
  JValue,
  LocalSnapshot,
  RunOptions,
  RunResult,
  TraceFrame,
  TraceKind,
} from './types';

// Re-export helper type alias safely if parser doesn't export individual union members
type MethodNode = Extract<Stmt, { kind: 'MethodDecl' }>;
type ClassNode = Extract<Stmt, { kind: 'ClassDecl' }>;
type ConstructorNode = Extract<Stmt, { kind: 'ConstructorDecl' }>;
type FieldNode = Extract<Stmt, { kind: 'FieldDecl' }>;

interface VarSlot {
  type: string;
  value: JValue;
}

class EnvScope {
  public readonly parent: EnvScope | null;
  public readonly vars = new Map<string, VarSlot>();

  constructor(parent: EnvScope | null = null) {
    this.parent = parent;
  }

  public get(name: string): VarSlot | null {
    if (this.vars.has(name)) return this.vars.get(name)!;
    return this.parent ? this.parent.get(name) : null;
  }

  public declare(name: string, type: string, value: JValue, line: number): void {
    if (this.vars.has(name)) {
      throw new VMRuntimeError(`Variable "${name}" is already declared in this scope.`, line, 'type');
    }
    this.vars.set(name, { type, value });
  }

  public snapshot(): Record<string, LocalSnapshot> {
    const chain: EnvScope[] = [];
    let cur: EnvScope | null = this;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parent;
    }
    const out: Record<string, LocalSnapshot> = {};
    for (const scope of chain) {
      for (const [k, slot] of scope.vars.entries()) {
        out[k] = { type: slot.type, value: formatJavaValue(slot.value) };
      }
    }
    return out;
  }
}

export class VMRuntimeError extends Error {
  public readonly line: number;
  public readonly kind: 'syntax' | 'type' | 'runtime' | 'timeout';
  constructor(message: string, line: number, kind: 'syntax' | 'type' | 'runtime' | 'timeout' = 'runtime') {
    super(message);
    this.line = line;
    this.kind = kind;
  }
}

class ReturnSignal {
  public readonly value: JValue;
  constructor(value: JValue) {
    this.value = value;
  }
}
class BreakSignal {}
class ContinueSignal {}

interface ClassDef {
  node: ClassNode;
  fields: FieldNode[];
  constructors: ConstructorNode[];
  methods: Map<string, MethodNode>;
  staticFields: Map<string, VarSlot>;
}

const VOID_VAL: JValue = { type: 'void', value: undefined };
const NULL_VAL: JValue = { type: 'null', value: null };

export class Evaluator {
  private readonly maxSteps: number;
  private readonly maxCallDepth: number;
  private steps = 0;
  private callDepth = 0;
  private nextObjectId = 1;
  private stdout = '';
  private frames: TraceFrame[] = [];
  private methods = new Map<string, MethodNode>();
  private classes = new Map<string, ClassDef>();
  private currentThis: JObjectInstance | null = null;

  constructor(options: RunOptions = {}) {
    this.maxSteps = options.maxSteps ?? 1500;
    this.maxCallDepth = options.maxCallDepth ?? 64;
  }

  public executeStatements(program: Stmt[]): RunResult {
    const rootScope = new EnvScope();
    try {
      this.registerTopLevel(program);
      const runnable = this.extractMainOrTopStatements(program);
      for (const stmt of runnable) {
        this.execStmt(stmt, rootScope);
      }
      return {
        ok: true,
        frames: this.frames,
        stdout: this.stdout,
        finalLocals: rootScope.snapshot(),
      };
    } catch (err) {
      return this.handleError(err, rootScope);
    }
  }

  public executeMethod(program: Stmt[], methodName: string, args: JValue[]): RunResult {
    const rootScope = new EnvScope();
    try {
      this.registerTopLevel(program);
      const method = this.findMethod(methodName);
      if (!method) {
        throw new VMRuntimeError(`Method "${methodName}" was not found. Keep the starter method signature.`, 1, 'runtime');
      }
      const ret = this.invokeMethod(method, args, null, method.line);
      const lastLocals = this.frames.length > 0 ? this.frames[this.frames.length - 1].locals : rootScope.snapshot();
      return {
        ok: true,
        frames: this.frames,
        stdout: this.stdout,
        returnValue: ret,
        finalLocals: lastLocals,
      };
    } catch (err) {
      return this.handleError(err, rootScope);
    }
  }

  private handleError(err: unknown, scope: EnvScope): RunResult {
    const lastLocals = this.frames.length > 0 ? this.frames[this.frames.length - 1].locals : scope.snapshot();
    if (err instanceof VMRuntimeError) {
      this.pushFrame(err.line, 'error', err.message, scope);
      return {
        ok: false,
        frames: this.frames,
        stdout: this.stdout,
        finalLocals: lastLocals,
        error: { message: err.message, line: err.line, kind: err.kind },
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    this.pushFrame(1, 'error', msg, scope);
    return {
      ok: false,
      frames: this.frames,
      stdout: this.stdout,
      finalLocals: lastLocals,
      error: { message: msg, line: 1, kind: 'runtime' },
    };
  }

  private registerTopLevel(program: Stmt[]): void {
    for (const stmt of program) {
      if (stmt.kind === 'MethodDecl') {
        this.methods.set(stmt.name, stmt);
      } else if (stmt.kind === 'ClassDecl') {
        const fields: FieldNode[] = [];
        const constructors: ConstructorNode[] = [];
        const methods = new Map<string, MethodNode>();
        const staticFields = new Map<string, VarSlot>();
        for (const m of stmt.members) {
          if (m.kind === 'FieldDecl') {
            fields.push(m);
            if (m.isStatic) {
              for (const d of m.declarators) {
                const initVal = d.init ? this.evalExpr(d.init, new EnvScope()) : this.defaultValue(m.typeRef);
                staticFields.set(d.name, { type: this.typeName(m.typeRef), value: initVal });
              }
            }
          } else if (m.kind === 'ConstructorDecl') {
            constructors.push(m);
          } else if (m.kind === 'MethodDecl') {
            methods.set(m.name, m);
          }
        }
        this.classes.set(stmt.name, { node: stmt, fields, constructors, methods, staticFields });
      }
    }
  }

  private extractMainOrTopStatements(program: Stmt[]): Stmt[] {
    // If the user wrapped statements inside a class with `main`, unwrap `main`'s body.
    for (const stmt of program) {
      if (stmt.kind === 'ClassDecl') {
        for (const member of stmt.members) {
          if (member.kind === 'MethodDecl' && member.name === 'main') {
            return member.body;
          }
        }
      }
      if (stmt.kind === 'MethodDecl' && stmt.name === 'main') {
        return stmt.body;
      }
    }
    return program.filter((s) => s.kind !== 'MethodDecl' && s.kind !== 'ClassDecl');
  }

  private findMethod(name: string): MethodNode | null {
    if (this.methods.has(name)) return this.methods.get(name)!;
    for (const cls of this.classes.values()) {
      if (cls.methods.has(name)) return cls.methods.get(name)!;
    }
    return null;
  }

  private tick(line: number): void {
    this.steps++;
    if (this.steps > this.maxSteps) {
      throw new VMRuntimeError(
        `Execution halted after ${this.maxSteps} steps (possible infinite loop).`,
        line,
        'timeout',
      );
    }
  }

  private pushFrame(
    line: number,
    kind: TraceKind,
    summary: string,
    scope: EnvScope,
    extra: Partial<TraceFrame> = {},
  ): void {
    this.frames.push({
      step: this.frames.length + 1,
      line,
      kind,
      summary,
      locals: scope.snapshot(),
      stdout: this.stdout,
      callDepth: this.callDepth,
      ...extra,
    });
  }

  private typeName(t: TypeRef): string {
    return `${t.base}${t.generic ? `<${t.generic}>` : ''}${'[]'.repeat(t.dims)}`;
  }

  private defaultValue(t: TypeRef): JValue {
    if (t.dims > 0 || t.base === 'String' || t.base === 'ArrayList' || this.classes.has(t.base)) {
      return NULL_VAL;
    }
    if (t.base === 'int') return { type: 'int', value: 0 };
    if (t.base === 'double') return { type: 'double', value: 0.0 };
    if (t.base === 'boolean') return { type: 'boolean', value: false };
    return NULL_VAL;
  }

  private coerceType(targetType: string, val: JValue, line: number): JValue {
    if (targetType === 'int' || targetType === 'Integer') {
      if (val.type === 'int') return { type: 'int', value: val.value };
      throw new VMRuntimeError(
        `Type mismatch: cannot assign ${val.type} to ${targetType}.`,
        line,
        'type',
      );
    }
    if (targetType === 'double' || targetType === 'Double') {
      if (val.type === 'double') return { type: 'double', value: val.value };
      if (val.type === 'int') return { type: 'double', value: val.value };
      throw new VMRuntimeError(
        `Type mismatch: cannot assign ${val.type} to ${targetType}.`,
        line,
        'type',
      );
    }
    if (targetType === 'boolean') {
      if (val.type === 'boolean') return { type: 'boolean', value: val.value };
      throw new VMRuntimeError(
        `Type mismatch: cannot assign ${val.type} to boolean.`,
        line,
        'type',
      );
    }
    if (targetType === 'String') {
      if (val.type === 'String' || val.type === 'null') return val;
      throw new VMRuntimeError(
        `Type mismatch: cannot assign ${val.type} to String.`,
        line,
        'type',
      );
    }
    return val;
  }

  private execStmt(stmt: Stmt, scope: EnvScope): void {
    this.tick(stmt.line);

    switch (stmt.kind) {
      case 'Block': {
        const inner = new EnvScope(scope);
        for (const s of stmt.body) {
          this.execStmt(s, inner);
        }
        return;
      }

      case 'VarDecl': {
        const tName = this.typeName(stmt.typeRef);
        for (const d of stmt.declarators) {
          const val = d.init ? this.evalInit(d.init, stmt.typeRef, scope) : this.defaultValue(stmt.typeRef);
          const coerced = this.coerceType(tName, val, stmt.line);
          scope.declare(d.name, tName, coerced, stmt.line);
          this.pushFrame(
            stmt.line,
            'decl',
            `${tName} ${d.name} = ${formatJavaValue(coerced)}`,
            scope,
            { changedVar: d.name, newValue: formatJavaValue(coerced) },
          );
        }
        return;
      }

      case 'ExprStmt': {
        this.evalExpr(stmt.expr, scope);
        return;
      }

      case 'IfStmt': {
        const testVal = this.evalExpr(stmt.test, scope);
        if (testVal.type !== 'boolean') {
          throw new VMRuntimeError(`if condition must be boolean, got ${testVal.type}.`, stmt.line, 'type');
        }
        const taken = Boolean(testVal.value);
        this.pushFrame(
          stmt.line,
          'branch',
          `if (${stmt.testText}) → ${taken ? 'TRUE' : 'FALSE'}`,
          scope,
          { branchTaken: taken, branchExpr: stmt.testText },
        );
        if (taken) {
          this.execStmt(stmt.consequent, scope);
        } else if (stmt.alternate) {
          this.execStmt(stmt.alternate, scope);
        }
        return;
      }

      case 'WhileStmt': {
        while (true) {
          this.tick(stmt.line);
          const testVal = this.evalExpr(stmt.test, scope);
          if (testVal.type !== 'boolean') {
            throw new VMRuntimeError(`while condition must be boolean, got ${testVal.type}.`, stmt.line, 'type');
          }
          const cont = Boolean(testVal.value);
          this.pushFrame(
            stmt.line,
            'loop',
            `while (${stmt.testText}) → ${cont ? 'TRUE' : 'FALSE'}`,
            scope,
            { branchTaken: cont, branchExpr: stmt.testText },
          );
          if (!cont) break;
          try {
            this.execStmt(stmt.body, scope);
          } catch (sig) {
            if (sig instanceof BreakSignal) break;
            if (sig instanceof ContinueSignal) continue;
            throw sig;
          }
        }
        return;
      }

      case 'ForStmt': {
        const loopScope = new EnvScope(scope);
        if (stmt.init) this.execStmt(stmt.init, loopScope);
        while (true) {
          this.tick(stmt.line);
          let cont = true;
          if (stmt.test) {
            const testVal = this.evalExpr(stmt.test, loopScope);
            if (testVal.type !== 'boolean') {
              throw new VMRuntimeError(`for condition must be boolean, got ${testVal.type}.`, stmt.line, 'type');
            }
            cont = Boolean(testVal.value);
          }
          this.pushFrame(
            stmt.line,
            'loop',
            `for (${stmt.testText}) → ${cont ? 'TRUE' : 'FALSE'}`,
            loopScope,
            { branchTaken: cont, branchExpr: stmt.testText },
          );
          if (!cont) break;
          try {
            this.execStmt(stmt.body, loopScope);
          } catch (sig) {
            if (sig instanceof BreakSignal) break;
            if (!(sig instanceof ContinueSignal)) throw sig;
          }
          if (stmt.update) this.evalExpr(stmt.update, loopScope);
        }
        return;
      }

      case 'ForEachStmt': {
        const iterVal = this.evalExpr(stmt.iterable, scope);
        if (iterVal.type !== 'array' && iterVal.type !== 'arraylist') {
          throw new VMRuntimeError('Enhanced for loop requires an array or ArrayList.', stmt.line, 'type');
        }
        const items = [...(iterVal.value as JValue[])];
        const tName = this.typeName(stmt.typeRef);
        for (const item of items) {
          this.tick(stmt.line);
          const eachScope = new EnvScope(scope);
          eachScope.declare(stmt.varName, tName, this.coerceType(tName, item, stmt.line), stmt.line);
          this.pushFrame(
            stmt.line,
            'loop',
            `for (${stmt.varName} = ${formatJavaValue(item)})`,
            eachScope,
            { changedVar: stmt.varName, newValue: formatJavaValue(item) },
          );
          try {
            this.execStmt(stmt.body, eachScope);
          } catch (sig) {
            if (sig instanceof BreakSignal) break;
            if (sig instanceof ContinueSignal) continue;
            throw sig;
          }
        }
        return;
      }

      case 'ReturnStmt': {
        const val = stmt.argument ? this.evalExpr(stmt.argument, scope) : VOID_VAL;
        this.pushFrame(
          stmt.line,
          'return',
          `return ${stmt.argument ? formatJavaValue(val) : ''}`.trim(),
          scope,
        );
        throw new ReturnSignal(val);
      }

      case 'BreakStmt':
        throw new BreakSignal();

      case 'ContinueStmt':
        throw new ContinueSignal();

      default:
        return;
    }
  }

  private evalInit(expr: Expr, typeRef: TypeRef, scope: EnvScope): JValue {
    if (expr.kind === 'ArrayInit') {
      const elements = expr.elements.map((el) =>
        el.kind === 'ArrayInit'
          ? this.evalInit(el, { ...typeRef, dims: Math.max(0, typeRef.dims - 1) }, scope)
          : this.evalExpr(el, scope),
      );
      return { type: 'array', value: elements, elemType: typeRef.base };
    }
    return this.evalExpr(expr, scope);
  }

  private evalExpr(expr: Expr, scope: EnvScope): JValue {
    switch (expr.kind) {
      case 'Literal':
        return { type: expr.litType, value: expr.value };

      case 'This':
        if (!this.currentThis) {
          throw new VMRuntimeError('"this" cannot be used outside an instance method or constructor.', expr.line, 'runtime');
        }
        return { type: 'object', value: this.currentThis, className: this.currentThis.className };

      case 'Id': {
        const slot = scope.get(expr.name);
        if (slot) return slot.value;
        if (this.currentThis && expr.name in this.currentThis.fields) {
          return this.currentThis.fields[expr.name];
        }
        if (expr.name === 'System' || expr.name === 'Math' || expr.name === 'Integer' || expr.name === 'Double' || expr.name === 'Arrays') {
          return { type: 'object', value: { className: expr.name, fields: {}, id: 0 }, className: expr.name };
        }
        throw new VMRuntimeError(`Variable "${expr.name}" has not been declared.`, expr.line, 'runtime');
      }

      case 'Cast': {
        const v = this.evalExpr(expr.arg, scope);
        if (v.type !== 'int' && v.type !== 'double') {
          throw new VMRuntimeError(`Cannot cast ${v.type} to ${expr.targetType}.`, expr.line, 'type');
        }
        if (expr.targetType === 'int') {
          return { type: 'int', value: Math.trunc(v.value as number) };
        }
        return { type: 'double', value: Number(v.value) };
      }

      case 'Unary': {
        const v = this.evalExpr(expr.arg, scope);
        if (expr.op === '!') {
          if (v.type !== 'boolean') {
            throw new VMRuntimeError(`Operator "!" requires boolean, got ${v.type}.`, expr.line, 'type');
          }
          return { type: 'boolean', value: !(v.value as boolean) };
        }
        if (v.type !== 'int' && v.type !== 'double') {
          throw new VMRuntimeError(`Unary "${expr.op}" requires a number.`, expr.line, 'type');
        }
        return { type: v.type, value: expr.op === '-' ? -(v.value as number) : (v.value as number) };
      }

      case 'Update': {
        const delta = expr.op === '++' ? 1 : -1;
        const { current, write } = this.resolveAssignTarget(expr.arg, scope, expr.line);
        if (current.type !== 'int' && current.type !== 'double') {
          throw new VMRuntimeError(`Operator "${expr.op}" requires a numeric variable.`, expr.line, 'type');
        }
        const nextVal: JValue = { type: current.type, value: (current.value as number) + delta };
        write(nextVal, expr.line);
        return expr.prefix ? nextVal : current;
      }

      case 'AssignExpr': {
        const rhs = this.evalExpr(expr.value, scope);
        if (expr.op === '=') {
          const { write } = this.resolveAssignTarget(expr.target, scope, expr.line);
          return write(rhs, expr.line);
        }
        const op = expr.op[0];
        const { current, write } = this.resolveAssignTarget(expr.target, scope, expr.line);
        const combined = this.evalBinaryOp(op, current, rhs, expr.line);
        return write(combined, expr.line);
      }

      case 'Binary': {
        // Strict short-circuiting for && and ||
        if (expr.op === '&&') {
          const l = this.evalExpr(expr.left, scope);
          if (l.type !== 'boolean') throw new VMRuntimeError('&& requires boolean operands.', expr.line, 'type');
          if (!l.value) return { type: 'boolean', value: false };
          const r = this.evalExpr(expr.right, scope);
          if (r.type !== 'boolean') throw new VMRuntimeError('&& requires boolean operands.', expr.line, 'type');
          return { type: 'boolean', value: Boolean(r.value) };
        }
        if (expr.op === '||') {
          const l = this.evalExpr(expr.left, scope);
          if (l.type !== 'boolean') throw new VMRuntimeError('|| requires boolean operands.', expr.line, 'type');
          if (l.value) return { type: 'boolean', value: true };
          const r = this.evalExpr(expr.right, scope);
          if (r.type !== 'boolean') throw new VMRuntimeError('|| requires boolean operands.', expr.line, 'type');
          return { type: 'boolean', value: Boolean(r.value) };
        }

        const left = this.evalExpr(expr.left, scope);
        const right = this.evalExpr(expr.right, scope);
        return this.evalBinaryOp(expr.op, left, right, expr.line);
      }

      case 'Member': {
        if (expr.object.kind === 'Id' && expr.object.name === 'System' && expr.property === 'out') {
          return { type: 'object', value: { className: 'PrintStream', fields: {}, id: 0 }, className: 'PrintStream' };
        }
        const obj = this.evalExpr(expr.object, scope);
        if (obj.type === 'array' && expr.property === 'length') {
          return { type: 'int', value: (obj.value as JValue[]).length };
        }
        if (obj.type === 'object') {
          const inst = obj.value as JObjectInstance;
          if (expr.property in inst.fields) {
            return inst.fields[expr.property];
          }
          const cls = this.classes.get(inst.className);
          if (cls && cls.staticFields.has(expr.property)) {
            return cls.staticFields.get(expr.property)!.value;
          }
        }
        throw new VMRuntimeError(`Cannot read property "${expr.property}".`, expr.line, 'runtime');
      }

      case 'Index': {
        const arr = this.evalExpr(expr.object, scope);
        const idx = this.evalExpr(expr.index, scope);
        if (arr.type !== 'array') {
          throw new VMRuntimeError('Indexing [...] requires an array.', expr.line, 'type');
        }
        if (idx.type !== 'int') {
          throw new VMRuntimeError('Array index must be an int.', expr.line, 'type');
        }
        const elements = arr.value as JValue[];
        const i = idx.value as number;
        if (i < 0 || i >= elements.length) {
          throw new VMRuntimeError(`ArrayIndexOutOfBoundsException: index ${i} out of bounds for length ${elements.length}.`, expr.line, 'runtime');
        }
        return elements[i];
      }

      case 'NewArray': {
        const dims = expr.dims.map((d) => {
          const val = this.evalExpr(d, scope);
          if (val.type !== 'int' || (val.value as number) < 0) {
            throw new VMRuntimeError('Array size must be a nonnegative int.', expr.line, 'runtime');
          }
          return val.value as number;
        });
        return this.allocArray(expr.elemType, dims);
      }

      case 'ArrayInit': {
        const elems = expr.elements.map((el) => this.evalExpr(el, scope));
        return { type: 'array', value: elems, elemType: elems[0]?.type ?? 'int' };
      }

      case 'NewObject': {
        if (expr.className === 'ArrayList') {
          return { type: 'arraylist', value: [] as JValue[], elemType: expr.generic ?? 'Object' };
        }
        if (expr.className === 'String') {
          const arg = expr.args[0] ? this.evalExpr(expr.args[0], scope) : { type: 'String' as const, value: '' };
          return { type: 'String', value: formatJavaValue(arg) };
        }
        const cls = this.classes.get(expr.className);
        if (!cls) {
          throw new VMRuntimeError(`Unknown class "${expr.className}".`, expr.line, 'runtime');
        }
        const inst: JObjectInstance = { className: expr.className, fields: {}, id: this.nextObjectId++ };
        for (const f of cls.fields) {
          if (!f.isStatic) {
            for (const d of f.declarators) {
              inst.fields[d.name] = d.init ? this.evalExpr(d.init, scope) : this.defaultValue(f.typeRef);
            }
          }
        }
        const ctor = cls.constructors.find((c) => c.params.length === expr.args.length);
        if (ctor) {
          const args = expr.args.map((a) => this.evalExpr(a, scope));
          this.invokeConstructor(ctor, args, inst, expr.line);
        }
        return { type: 'object', value: inst, className: expr.className };
      }

      case 'Call': {
        return this.evalCall(expr.callee, expr.args, scope, expr.line);
      }
    }
  }

  private allocArray(elemType: string, dims: number[]): JValue {
    const size = dims[0] ?? 0;
    const arr: JValue[] = [];
    for (let i = 0; i < size; i++) {
      if (dims.length > 1) {
        arr.push(this.allocArray(elemType, dims.slice(1)));
      } else if (elemType === 'int') {
        arr.push({ type: 'int', value: 0 });
      } else if (elemType === 'double') {
        arr.push({ type: 'double', value: 0.0 });
      } else if (elemType === 'boolean') {
        arr.push({ type: 'boolean', value: false });
      } else {
        arr.push(NULL_VAL);
      }
    }
    return { type: 'array', value: arr, elemType };
  }

  private evalCall(callee: Expr, argExprs: Expr[], scope: EnvScope, line: number): JValue {
    const args = argExprs.map((a) => this.evalExpr(a, scope));

    if (callee.kind === 'Id') {
      const m = this.findMethod(callee.name);
      if (m) return this.invokeMethod(m, args, this.currentThis, line);
      throw new VMRuntimeError(`Unknown method "${callee.name}".`, line, 'runtime');
    }

    if (callee.kind === 'Member') {
      const prop = callee.property;
      // System.out.println / print
      if (
        callee.object.kind === 'Member' &&
        callee.object.object.kind === 'Id' &&
        callee.object.object.name === 'System' &&
        callee.object.property === 'out'
      ) {
        const text = args.length > 0 ? formatJavaValue(args[0]) : '';
        this.stdout += text + (prop === 'println' ? '\n' : '');
        this.pushFrame(line, 'print', `System.out.${prop}(${text})`, scope);
        return VOID_VAL;
      }

      // Math static helpers
      if (callee.object.kind === 'Id' && callee.object.name === 'Math') {
        return this.evalMath(prop, args, line);
      }
      if (callee.object.kind === 'Id' && callee.object.name === 'Integer' && prop === 'parseInt') {
        const raw = String(args[0]?.value ?? '').trim();
        const parsed = Number.parseInt(raw, 10);
        if (Number.isNaN(parsed)) throw new VMRuntimeError(`NumberFormatException for "${raw}".`, line, 'runtime');
        return { type: 'int', value: parsed };
      }
      if (callee.object.kind === 'Id' && callee.object.name === 'Double' && prop === 'parseDouble') {
        const raw = String(args[0]?.value ?? '').trim();
        const parsed = Number.parseFloat(raw);
        if (Number.isNaN(parsed)) throw new VMRuntimeError(`NumberFormatException for "${raw}".`, line, 'runtime');
        return { type: 'double', value: parsed };
      }

      const target = this.evalExpr(callee.object, scope);

      // String methods
      if (target.type === 'String') {
        return this.evalStringMethod(String(target.value), prop, args, line);
      }

      // ArrayList methods
      if (target.type === 'arraylist') {
        return this.evalArrayListMethod(target.value as JValue[], prop, args, line);
      }

      // Class instance or static method
      if (target.type === 'object') {
        const inst = target.value as JObjectInstance;
        const cls = this.classes.get(inst.className);
        const m = cls?.methods.get(prop);
        if (m) return this.invokeMethod(m, args, inst.id === 0 ? null : inst, line);
      }
    }

    throw new VMRuntimeError('Unsupported method call.', line, 'runtime');
  }

  private evalMath(method: string, args: JValue[], line: number): JValue {
    const nums = args.map((a) => Number(a.value));
    if (method === 'random') return { type: 'double', value: Math.random() };
    if (method === 'sqrt') return { type: 'double', value: Math.sqrt(nums[0]) };
    if (method === 'pow') return { type: 'double', value: Math.pow(nums[0], nums[1]) };
    if (method === 'abs') {
      const t = args[0]?.type === 'double' ? 'double' : 'int';
      return { type: t, value: Math.abs(nums[0]) };
    }
    if (method === 'max') {
      const t = args.some((a) => a.type === 'double') ? 'double' : 'int';
      return { type: t, value: Math.max(nums[0], nums[1]) };
    }
    if (method === 'min') {
      const t = args.some((a) => a.type === 'double') ? 'double' : 'int';
      return { type: t, value: Math.min(nums[0], nums[1]) };
    }
    throw new VMRuntimeError(`Unsupported Math.${method}().`, line, 'runtime');
  }

  private evalStringMethod(str: string, method: string, args: JValue[], line: number): JValue {
    switch (method) {
      case 'length':
        return { type: 'int', value: str.length };
      case 'substring': {
        const start = Number(args[0]?.value);
        const end = args.length > 1 ? Number(args[1]?.value) : str.length;
        if (start < 0 || end > str.length || start > end) {
          throw new VMRuntimeError(`StringIndexOutOfBoundsException: (${start}, ${end}) on length ${str.length}.`, line, 'runtime');
        }
        return { type: 'String', value: str.slice(start, end) };
      }
      case 'indexOf':
        return { type: 'int', value: str.indexOf(String(args[0]?.value ?? '')) };
      case 'charAt': {
        const idx = Number(args[0]?.value);
        if (!Number.isInteger(idx) || idx < 0 || idx >= str.length) {
          throw new VMRuntimeError(`StringIndexOutOfBoundsException: index ${idx} out of range for length ${str.length}.`, line, 'runtime');
        }
        return { type: 'String', value: str[idx] };
      }
      case 'equals':
        return { type: 'boolean', value: args[0]?.type === 'String' && str === String(args[0].value) };
      case 'equalsIgnoreCase':
        return {
          type: 'boolean',
          value: args[0]?.type === 'String' && str.toLowerCase() === String(args[0].value).toLowerCase(),
        };
      case 'compareTo': {
        const other = String(args[0]?.value ?? '');
        if (str === other) return { type: 'int', value: 0 };
        return { type: 'int', value: str < other ? -1 : 1 };
      }
      case 'toUpperCase':
        return { type: 'String', value: str.toUpperCase() };
      case 'toLowerCase':
        return { type: 'String', value: str.toLowerCase() };
      case 'trim':
        return { type: 'String', value: str.trim() };
      case 'split':
        return {
          type: 'array',
          elemType: 'String',
          value: str.split(String(args[0]?.value ?? '')).map((s) => ({ type: 'String', value: s })),
        };
      default:
        throw new VMRuntimeError(`Unsupported String.${method}().`, line, 'runtime');
    }
  }

  private evalArrayListMethod(list: JValue[], method: string, args: JValue[], line: number): JValue {
    switch (method) {
      case 'size':
        return { type: 'int', value: list.length };
      case 'isEmpty':
        return { type: 'boolean', value: list.length === 0 };
      case 'get': {
        const idx = Number(args[0]?.value);
        if (idx < 0 || idx >= list.length) {
          throw new VMRuntimeError(`IndexOutOfBoundsException: index ${idx} for size ${list.length}.`, line, 'runtime');
        }
        return list[idx];
      }
      case 'set': {
        const idx = Number(args[0]?.value);
        if (idx < 0 || idx >= list.length) {
          throw new VMRuntimeError(`IndexOutOfBoundsException: index ${idx} for size ${list.length}.`, line, 'runtime');
        }
        const prev = list[idx];
        list[idx] = args[1];
        return prev;
      }
      case 'add': {
        if (args.length === 2 && args[0].type === 'int') {
          const idx = Number(args[0].value);
          if (idx < 0 || idx > list.length) {
            throw new VMRuntimeError(`IndexOutOfBoundsException: index ${idx} for size ${list.length}.`, line, 'runtime');
          }
          list.splice(idx, 0, args[1]);
          return VOID_VAL;
        }
        list.push(args[0]);
        return { type: 'boolean', value: true };
      }
      case 'remove': {
        if (args[0]?.type === 'int') {
          const idx = Number(args[0].value);
          if (idx < 0 || idx >= list.length) {
            throw new VMRuntimeError(`IndexOutOfBoundsException: index ${idx} for size ${list.length}.`, line, 'runtime');
          }
          return list.splice(idx, 1)[0];
        }
        const pos = list.findIndex((item) => item.value === args[0]?.value);
        if (pos >= 0) {
          list.splice(pos, 1);
          return { type: 'boolean', value: true };
        }
        return { type: 'boolean', value: false };
      }
      case 'clear':
        list.length = 0;
        return VOID_VAL;
      default:
        throw new VMRuntimeError(`Unsupported ArrayList.${method}().`, line, 'runtime');
    }
  }

  private invokeConstructor(ctor: ConstructorNode, args: JValue[], inst: JObjectInstance, line: number): void {
    const scope = new EnvScope();
    ctor.params.forEach((p, idx) => {
      scope.declare(p.name, this.typeName(p.typeRef), args[idx] ?? NULL_VAL, line);
    });
    const prevThis = this.currentThis;
    this.currentThis = inst;
    try {
      for (const s of ctor.body) this.execStmt(s, scope);
    } finally {
      this.currentThis = prevThis;
    }
  }

  private invokeMethod(method: MethodNode, args: JValue[], thisObj: JObjectInstance | null, line: number): JValue {
    if (this.callDepth >= this.maxCallDepth) {
      throw new VMRuntimeError(`StackOverflowError: recursion depth exceeded ${this.maxCallDepth}.`, line, 'timeout');
    }
    this.callDepth++;
    const scope = new EnvScope();
    method.params.forEach((p, idx) => {
      const val = args[idx] ?? NULL_VAL;
      scope.declare(p.name, this.typeName(p.typeRef), this.coerceType(this.typeName(p.typeRef), val, line), method.line);
    });
    this.pushFrame(
      method.line,
      'call',
      `${method.name}(${args.map(formatJavaValue).join(', ')})`,
      scope,
    );
    const prevThis = this.currentThis;
    this.currentThis = thisObj;
    try {
      for (const s of method.body) {
        this.execStmt(s, scope);
      }
      return VOID_VAL;
    } catch (sig) {
      if (sig instanceof ReturnSignal) {
        return sig.value;
      }
      throw sig;
    } finally {
      this.currentThis = prevThis;
      this.callDepth--;
    }
  }

  private resolveAssignTarget(
    target: Expr,
    scope: EnvScope,
    line: number,
  ): { current: JValue; write: (val: JValue, writeLine: number) => JValue } {
    if (target.kind === 'Id') {
      const slot = scope.get(target.name);
      if (slot) {
        return {
          current: slot.value,
          write: (val, writeLine) => {
            const prev = formatJavaValue(slot.value);
            const coerced = this.coerceType(slot.type, val, writeLine);
            slot.value = coerced;
            const next = formatJavaValue(coerced);
            this.pushFrame(writeLine, 'assign', `${target.name} = ${next}`, scope, {
              changedVar: target.name,
              prevValue: prev,
              newValue: next,
            });
            return coerced;
          },
        };
      }
      if (this.currentThis && target.name in this.currentThis.fields) {
        const inst = this.currentThis;
        return {
          current: inst.fields[target.name],
          write: (val, writeLine) => {
            const prev = formatJavaValue(inst.fields[target.name]);
            inst.fields[target.name] = val;
            const next = formatJavaValue(val);
            this.pushFrame(writeLine, 'assign', `this.${target.name} = ${next}`, scope, {
              changedVar: target.name,
              prevValue: prev,
              newValue: next,
            });
            return val;
          },
        };
      }
      throw new VMRuntimeError(`Declare "${target.name}" before assigning to it.`, line, 'runtime');
    }

    if (target.kind === 'Member' && target.object.kind === 'This' && this.currentThis) {
      const inst = this.currentThis;
      const prop = target.property;
      return {
        current: inst.fields[prop] ?? NULL_VAL,
        write: (val, writeLine) => {
          const prev = formatJavaValue(inst.fields[prop] ?? NULL_VAL);
          inst.fields[prop] = val;
          const next = formatJavaValue(val);
          this.pushFrame(writeLine, 'assign', `this.${prop} = ${next}`, scope, {
            changedVar: prop,
            prevValue: prev,
            newValue: next,
          });
          return val;
        },
      };
    }

    if (target.kind === 'Index') {
      const arr = this.evalExpr(target.object, scope);
      const idx = this.evalExpr(target.index, scope);
      if (arr.type !== 'array' || idx.type !== 'int') {
        throw new VMRuntimeError('Invalid array assignment target.', line, 'type');
      }
      const elems = arr.value as JValue[];
      const i = idx.value as number;
      if (i < 0 || i >= elems.length) {
        throw new VMRuntimeError(`ArrayIndexOutOfBoundsException: index ${i}.`, line, 'runtime');
      }
      return {
        current: elems[i],
        write: (val, writeLine) => {
          elems[i] = val;
          this.pushFrame(writeLine, 'assign', `[${i}] = ${formatJavaValue(val)}`, scope);
          return val;
        },
      };
    }

    throw new VMRuntimeError('Invalid assignment target.', line, 'type');
  }

  private evalBinaryOp(op: string, left: JValue, right: JValue, line: number): JValue {
    if (op === '+' && (left.type === 'String' || right.type === 'String')) {
      return { type: 'String', value: formatJavaValue(left) + formatJavaValue(right) };
    }
    if (op === '==' || op === '!=') {
      const eq = left.value === right.value;
      return { type: 'boolean', value: op === '==' ? eq : !eq };
    }

    if (!['int', 'double'].includes(left.type) || !['int', 'double'].includes(right.type)) {
      throw new VMRuntimeError(`Operator "${op}" requires numeric values, got ${left.type} and ${right.type}.`, line, 'type');
    }

    const a = left.value as number;
    const b = right.value as number;

    if (['<', '<=', '>', '>='].includes(op)) {
      const res =
        op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
      return { type: 'boolean', value: res };
    }

    const resType = left.type === 'double' || right.type === 'double' ? 'double' : 'int';
    if ((op === '/' || op === '%') && b === 0) {
      throw new VMRuntimeError('ArithmeticException: division by zero.', line, 'runtime');
    }

    let val: number;
    if (op === '+') val = a + b;
    else if (op === '-') val = a - b;
    else if (op === '*') val = a * b;
    else if (op === '/') {
      val = resType === 'int' ? Math.trunc(a / b) : a / b;
    } else if (op === '%') {
      val = a % b;
    } else {
      throw new VMRuntimeError(`Unsupported operator "${op}".`, line, 'runtime');
    }

    return { type: resType, value: val };
  }
}
