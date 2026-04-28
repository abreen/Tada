import type { TraceHeapObject } from '../types';

export type TraceHeapScalar = string | number | boolean;

const BOXED_PRIMITIVE_TYPES = new Set([
  'java.lang.Boolean',
  'java.lang.Byte',
  'java.lang.Character',
  'java.lang.Double',
  'java.lang.Float',
  'java.lang.Integer',
  'java.lang.Long',
  'java.lang.Short',
]);

export function isInlineHeapObject(obj: TraceHeapObject): boolean {
  return (
    'value' in obj &&
    (obj.type === 'String' || BOXED_PRIMITIVE_TYPES.has(obj.type))
  );
}

export function formatHeapObjectValue(
  type: string,
  value: TraceHeapScalar,
): string {
  if (type === 'String') {
    return `"${value}"`;
  }
  if (type === 'java.lang.Character') {
    return `'${value}'`;
  }
  return String(value);
}
