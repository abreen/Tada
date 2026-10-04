import type { FileMutation } from '../output-publication';
import type { OutputContent } from '../types';
import type { TadaSnapshot } from './snapshot';

type OutputSnapshot = Pick<TadaSnapshot, 'outputs'>;

// Copied files compare by source path; the planner re-renders (and forces a
// write for) any source whose contents changed.
function outputsEqual(left: OutputContent, right: OutputContent): boolean {
  if (typeof left === 'string' || typeof right === 'string') {
    return left === right;
  }
  return left.copyFrom === right.copyFrom;
}

export function computeMutations(
  previous: OutputSnapshot,
  next: OutputSnapshot,
  forceSourcePaths: ReadonlySet<string> = new Set(),
): FileMutation[] {
  const mutations: FileMutation[] = [];
  const outputs = new Set([...previous.outputs.keys(), ...next.outputs.keys()]);
  for (const output of outputs) {
    const before = previous.outputs.get(output);
    const after = next.outputs.get(output);
    if (!after) {
      mutations.push({ kind: 'delete', path: output });
    } else if (
      !before ||
      !outputsEqual(before.content, after.content) ||
      forceSourcePaths.has(after.sourcePath)
    ) {
      mutations.push({ kind: 'write', path: output, content: after.content });
    }
  }
  return mutations;
}
