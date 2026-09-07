import type { FileMutation } from '../output-publication';
import type { TadaSnapshot } from './snapshot';

type OutputSnapshot = Pick<TadaSnapshot, 'outputs'>;

function outputsEqual(left: string | Buffer, right: string | Buffer): boolean {
  if (left === right) {
    return true;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return false;
  }
  return (
    Buffer.compare(
      typeof left === 'string' ? Buffer.from(left) : left,
      typeof right === 'string' ? Buffer.from(right) : right,
    ) === 0
  );
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
