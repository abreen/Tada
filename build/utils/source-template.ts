import path from 'path';
import type { SiteVariables } from '../types';
import { resolveStructuredExpressions } from './structured-expressions';

/**
 * Resolves site data in Java `///` prose comments. All other source text is
 * literal, including braces and JavaScript template-expression syntax.
 */
export function applySourceExpressions(
  source: string,
  siteVariables: SiteVariables,
  filePath: string,
): string {
  if (path.extname(filePath).toLowerCase() !== '.java') {
    return source;
  }

  return source
    .split('\n')
    .map(line =>
      /^\s*\/\/\/(?:\s|$)/.test(line)
        ? (resolveStructuredExpressions(
            line,
            { site: siteVariables, vars: siteVariables.vars || {} },
            filePath,
          ) as string)
        : line,
    )
    .join('\n');
}
