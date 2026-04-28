export interface TraceManifest {
  totalSteps: number;
  chunkSize: number;
  primaryFile: string;
  sources: TraceSource[];
}

export interface TraceSource {
  file: string;
  source: string;
  lineToSteps: Record<number, number[]>;
}

export interface TraceStep {
  line: number;
  file: string;
  stack: TraceStackFrame[];
  heap: Record<string, TraceHeapObject>;
  output?: TraceOutputEvent[];
  transientHeapRoots?: string[];
}

export interface TraceOutputEvent {
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface TraceStackFrame {
  method: string;
  class: string;
  line: number;
  locals: Record<string, TraceValue>;
}

export type TraceValue =
  | {
      type: 'int' | 'long' | 'short' | 'byte' | 'float' | 'double';
      value: number;
    }
  | { type: 'boolean'; value: boolean }
  | { type: 'char' | 'String'; value: string }
  | { type: 'null' }
  | { type: 'ref'; id: string }
  | { type: 'unknown' }
  | { type: 'uninitialized' }
  | { type: 'truncated'; remaining: number };

export type TraceHeapObject =
  | { type: string; elements: TraceValue[] }
  | { type: string; fields: Record<string, TraceValue> }
  | { type: string; value: string | number | boolean };

/** A single entry in a chunk file (new format with precomputed SVG). */
export interface TraceChunkEntry {
  file: string;
  line: number;
  output?: TraceOutputEvent[];
  svg: string;
}
