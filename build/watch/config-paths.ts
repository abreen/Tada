import path from 'path';
import {
  getProjectConfigBaseName,
  getSiteConfigBaseName,
  getSupportedConfigFilePaths,
} from '../config-files';
import { getProjectConfigDir } from '../templates';

export type WatchConfigPathKind = 'site' | 'nav' | 'authors';

function getConfigPathEntries(): Array<{
  kind: WatchConfigPathKind;
  paths: string[];
}> {
  const projectConfigDir = getProjectConfigDir();
  return [
    {
      kind: 'site',
      paths: getSupportedConfigFilePaths('.', getSiteConfigBaseName('dev')),
    },
    {
      kind: 'nav',
      paths: getSupportedConfigFilePaths(
        projectConfigDir,
        getProjectConfigBaseName('nav'),
      ),
    },
    {
      kind: 'authors',
      paths: getSupportedConfigFilePaths(
        projectConfigDir,
        getProjectConfigBaseName('authors'),
      ),
    },
  ];
}

function getWatchConfigPathKinds(): Map<string, WatchConfigPathKind> {
  return new Map(
    getConfigPathEntries().flatMap(entry =>
      entry.paths.map(
        filePath => [path.resolve(filePath), entry.kind] as const,
      ),
    ),
  );
}

export function getWatchConfigFilePaths(): Set<string> {
  return new Set(getWatchConfigPathKinds().keys());
}

export function classifyWatchConfigPath(
  filePath: string,
): WatchConfigPathKind | undefined {
  return getWatchConfigPathKinds().get(path.resolve(filePath));
}
