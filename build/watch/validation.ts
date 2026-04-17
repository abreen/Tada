import { B } from '../colors';
import { makeLogger } from '../log';
import { json } from '../templates';
import { validateConfigLinks } from '../validate-config-links';
import type { WatchDiagnostic } from '../../watch/types';
import { assertNoOutputPathConflicts, type TadaProjectScan } from './snapshot';

const log = makeLogger(import.meta.url);

export function diagnosticsFromMessages(messages: string[]): WatchDiagnostic[] {
  return messages.map(message => ({ message }));
}

export function validateConfig(scan: TadaProjectScan): WatchDiagnostic[] {
  const conflicts = assertNoOutputPathConflicts(scan);
  if (conflicts.length === 0) {
    return [];
  }
  for (const relPath of conflicts) {
    log.error`content/${B`${relPath}`} conflicts with public/${B`${relPath}`}`;
  }
  const noun = conflicts.length === 1 ? 'file' : 'files';
  return [
    {
      message: `${conflicts.length} ${noun} in content/ and public/ have the same path`,
    },
  ];
}

export function validateJsonLinks(
  validTargets: Set<string>,
): WatchDiagnostic[] {
  return diagnosticsFromMessages(
    validateConfigLinks(validTargets, json('nav.json'), json('authors.json')),
  );
}
