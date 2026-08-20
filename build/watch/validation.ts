import { B } from '../colors';
import { makeLogger } from '../log';
import { config, getConfigFileName } from '../templates';
import { validateConfigLinks } from '../validate-config-links';
import { validateCustomFontOverrides } from '../custom-fonts';
import type { SiteVariables } from '../types';
import type { WatchDiagnostic } from './types';
import { assertNoOutputPathConflicts, type TadaProjectScan } from './snapshot';

const log = makeLogger(import.meta.url);

export function diagnosticsFromMessages(messages: string[]): WatchDiagnostic[] {
  return messages.map(message => ({ message }));
}

export function validateConfig(
  scan: TadaProjectScan,
  siteVariables: SiteVariables,
): WatchDiagnostic[] {
  const diagnostics = diagnosticsFromMessages(
    validateCustomFontOverrides({
      fontOverrides: siteVariables.fontOverrides,
      publicDir: scan.publicDir,
      publicFiles: scan.publicFiles,
    }),
  );
  const conflicts = assertNoOutputPathConflicts(scan);
  if (conflicts.length === 0) {
    return diagnostics;
  }
  for (const relPath of conflicts) {
    log.error`content/${B`${relPath}`} conflicts with public/${B`${relPath}`}`;
  }
  const noun = conflicts.length === 1 ? 'file' : 'files';
  diagnostics.push({
    message: `${conflicts.length} ${noun} in content/ and public/ have the same path`,
  });
  return diagnostics;
}

export function validateProjectConfigLinks(
  validTargets: Set<string>,
): WatchDiagnostic[] {
  return diagnosticsFromMessages(
    validateConfigLinks(validTargets, config('nav'), config('authors'), {
      navFileName: getConfigFileName('nav'),
      authorsFileName: getConfigFileName('authors'),
    }),
  );
}
