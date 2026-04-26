import type { FileMutation } from './types';
import type { TadaOutputOwner, TadaSnapshot } from './snapshot';

function outputsEqual(
  left: string | Buffer | undefined,
  right: string | Buffer | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return left === right;
  }
  const leftBuffer = typeof left === 'string' ? Buffer.from(left) : left;
  const rightBuffer = typeof right === 'string' ? Buffer.from(right) : right;
  return Buffer.compare(leftBuffer, rightBuffer) === 0;
}

function getOutputContent(
  snapshot: TadaSnapshot,
  owner: TadaOutputOwner | undefined,
  outputPath: string,
): string | Buffer | undefined {
  if (!owner) {
    return undefined;
  }
  const records =
    owner.kind === 'content' ? snapshot.contentRecords : snapshot.publicRecords;
  return records.get(owner.sourcePath)?.outputs.get(outputPath);
}

export function computeMutations(
  previous: TadaSnapshot,
  next: TadaSnapshot,
  forceSourcePaths: Set<string> = new Set(),
): FileMutation[] {
  const mutations: FileMutation[] = [];
  const allPaths = new Set([
    ...previous.outputOwners.keys(),
    ...next.outputOwners.keys(),
  ]);

  for (const outputPath of [...allPaths].sort()) {
    const previousOwner = previous.outputOwners.get(outputPath);
    const nextOwner = next.outputOwners.get(outputPath);

    const previousContent = getOutputContent(
      previous,
      previousOwner,
      outputPath,
    );
    const nextContent = getOutputContent(next, nextOwner, outputPath);

    if (!nextOwner) {
      mutations.push({ path: outputPath, kind: 'delete' });
      continue;
    }

    if (
      !previousOwner ||
      !outputsEqual(previousContent, nextContent) ||
      forceSourcePaths.has(nextOwner.sourcePath)
    ) {
      mutations.push({
        path: outputPath,
        kind: 'write',
        content: nextContent!,
      });
    }
  }

  return mutations;
}
