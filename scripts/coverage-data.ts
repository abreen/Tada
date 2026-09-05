import path from 'path';
import libCoverage from 'istanbul-lib-coverage';
import type { CoverageMapData, FileCoverageData } from 'istanbul-lib-coverage';

export const coverageSourceRoots = ['build', 'src', 'bin', 'python'];

export function isCoverageSource(
  filePath: string,
  packageDir: string,
): boolean {
  const relative = path.relative(
    packageDir,
    path.resolve(packageDir, filePath),
  );
  return (
    coverageSourceRoots.includes(relative.split(path.sep)[0]) &&
    relative.endsWith('.ts') &&
    !relative.endsWith('.d.ts') &&
    !relative.includes('.test.') &&
    path.basename(relative) !== 'test-helpers.ts'
  );
}

/** Merge only original-source Istanbul maps produced by our shared instrumenter. */
export function mergeSourceCoverage(
  packageDir: string,
  sources: FileCoverageData[],
  streams: CoverageMapData[],
) {
  const map = libCoverage.createCoverageMap({});
  for (const source of sources) {
    if (isCoverageSource(source.path, packageDir)) {
      map.addFileCoverage(structuredClone(source));
    }
  }
  for (const stream of streams) {
    for (const [filePath, data] of Object.entries(stream)) {
      if (!isCoverageSource(filePath, packageDir)) {
        continue;
      }
      const absPath = path.resolve(packageDir, filePath);
      if (!map.data[absPath]) {
        continue;
      }
      const canonical = map.fileCoverageFor(absPath).data;
      const incoming = libCoverage.createFileCoverage(data).data;
      for (const key of ['statementMap', 'fnMap', 'branchMap'] as const) {
        if (JSON.stringify(canonical[key]) !== JSON.stringify(incoming[key])) {
          throw new Error(
            `Incompatible coverage for ${absPath}; clear coverage and rerun all suites.`,
          );
        }
      }
      map.addFileCoverage(structuredClone(incoming));
    }
  }
  return map;
}
