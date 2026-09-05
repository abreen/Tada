import path from 'path';
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
    const sources = [...scan.sourceOutputPaths]
      .filter(([, outputs]) => outputs.has(relPath))
      .map(([sourcePath]) =>
        path.relative(path.dirname(scan.contentDir), sourcePath),
      )
      .sort();
    log.error`${sources.join(' conflicts with ')}: same output path ${B`${relPath}`}`;
  }
  const noun = conflicts.length === 1 ? 'file' : 'files';
  diagnostics.push({
    message: `${conflicts.length} output ${noun} ${conflicts.length === 1 ? 'has' : 'have'} multiple sources with the same path`,
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
