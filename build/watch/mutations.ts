import type { TadaSnapshot } from './snapshot';

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

export function computeMutations(
  previous: TadaSnapshot,
  next: TadaSnapshot,
  forceSourcePaths: Set<string> = new Set(),
): { path: string; kind: 'write' | 'delete'; content?: string | Buffer }[] {
  const mutations: {
    path: string;
    kind: 'write' | 'delete';
    content?: string | Buffer;
  }[] = [];
  const allPaths = new Set([
    ...previous.outputOwners.keys(),
    ...next.outputOwners.keys(),
  ]);

  for (const outputPath of [...allPaths].sort()) {
    const previousOwner = previous.outputOwners.get(outputPath);
    const nextOwner = next.outputOwners.get(outputPath);

    const previousContent =
      previousOwner?.kind === 'content'
        ? previous.contentRecords
            .get(previousOwner.sourcePath)
            ?.outputs.get(outputPath)
        : previousOwner
          ? previous.publicRecords
              .get(previousOwner.sourcePath)
              ?.outputs.get(outputPath)
          : undefined;
    const nextContent =
      nextOwner?.kind === 'content'
        ? next.contentRecords.get(nextOwner.sourcePath)?.outputs.get(outputPath)
        : nextOwner
          ? next.publicRecords
              .get(nextOwner.sourcePath)
              ?.outputs.get(outputPath)
          : undefined;

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
