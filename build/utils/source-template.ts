import _ from 'lodash';
import type { SiteVariables } from '../types';

/**
 * Applies Lodash template syntax to a source code file's contents so that
 * authors can interpolate site variables (like `<%= vars.fullCourseName %>`)
 * in their source code. The template context mirrors the one used for JSON
 * data files in `build/templates.ts`: `vars` and `site`. Invoked from
 * `renderCodePageAsset` and `renderCopiedContentAsset` for source files whose
 * extension is mapped in `site.extensionToShikiLanguage`.
 */
export function applySourceTemplate(
  source: string,
  siteVariables: SiteVariables,
  filePath: string,
): string {
  const params = { vars: siteVariables.vars || {}, site: siteVariables };

  try {
    return _.template(source)(params);
  } catch (err: unknown) {
    throw new Error(
      `${filePath}: Lodash template error in source code: ${(err as Error).message}`,
      { cause: err },
    );
  }
}
