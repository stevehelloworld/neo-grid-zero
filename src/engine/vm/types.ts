export type JPrimitiveType = 'int' | 'double' | 'boolean' | 'String';

export type JType =
  | JPrimitiveType
  | 'void'
  | 'null'
  | 'array'
  | 'arraylist'
  | 'object';

export interface JObjectInstance {
  className: string;
  fields: Record<string, JValue>;
  id: number;
}

export interface JValue {
  type: JType;
  value: unknown;
  elemType?: string;
  className?: string;
}

export type TraceKind =
  | 'decl'
  | 'assign'
  | 'branch'
  | 'loop'
  | 'call'
  | 'return'
  | 'print'
  | 'error';

export interface LocalSnapshot {
  type: string;
  value: string;
}

export interface TraceFrame {
  step: number;
  line: number;
  kind: TraceKind;
  summary: string;
  changedVar?: string;
  prevValue?: string;
  newValue?: string;
  branchTaken?: boolean;
  branchExpr?: string;
  locals: Record<string, LocalSnapshot>;
  stdout: string;
  callDepth: number;
}

export interface VMError {
  message: string;
  line: number;
  kind: 'syntax' | 'type' | 'runtime' | 'timeout';
}

export interface RunResult {
  ok: boolean;
  frames: TraceFrame[];
  stdout: string;
  returnValue?: JValue;
  finalLocals: Record<string, LocalSnapshot>;
  error?: VMError;
}

export interface VarPatchSpec {
  name: string;
  initial?: number | string | boolean;
  reassign?: number | string | boolean;
}

export interface RunOptions {
  maxSteps?: number;
  maxCallDepth?: number;
  patches?: VarPatchSpec[];
}

export function formatJavaValue(v: JValue): string {
  if (v.type === 'void') return 'void';
  if (v.type === 'null') return 'null';
  if (v.type === 'double') {
    const num = v.value as number;
    if (Number.isNaN(num)) return 'NaN';
    if (!Number.isFinite(num)) return num > 0 ? 'Infinity' : '-Infinity';
    return Number.isInteger(num) ? num.toFixed(1) : String(num);
  }
  if (v.type === 'int' || v.type === 'boolean') {
    return String(v.value);
  }
  if (v.type === 'String') {
    return String(v.value);
  }
  if (v.type === 'array') {
    const arr = v.value as JValue[];
    return '[' + arr.map(formatJavaValue).join(', ') + ']';
  }
  if (v.type === 'arraylist') {
    const list = v.value as JValue[];
    return '[' + list.map(formatJavaValue).join(', ') + ']';
  }
  if (v.type === 'object') {
    const obj = v.value as JObjectInstance;
    return `${obj.className}#${obj.id}`;
  }
  return String(v.value);
}
