import path from 'path';
import { normalizeOutputPath } from './util';
import type { HtmlOutputAnalysis } from './types';

/** HTML candidates for an already normalized target without a non-HTML extension. */
function toCandidateHtmlAssetPaths(target: string): string[] {
  if (target === '/') {
    return ['index.html'];
  }

  if (target.endsWith('.html')) {
    return [target.slice(1)];
  }

  const withoutLeadingSlash = target.slice(1);
  if (target.endsWith('/')) {
    return [`${withoutLeadingSlash}index.html`];
  }

  return [`${withoutLeadingSlash}/index.html`, `${withoutLeadingSlash}.html`];
}

interface CollectReachableOptions {
  htmlAnalysisByPath: Map<string, HtmlOutputAnalysis>;
  knownAssetTargets?: Set<string>;
  rootPath?: string;
}

interface ReachableSiteAssets {
  reachableHtmlPaths: string[];
  reachableAssetTargets: string[];
}

export function collectReachableSiteAssets({
  htmlAnalysisByPath,
  knownAssetTargets = new Set(),
  rootPath = 'index.html',
}: CollectReachableOptions): ReachableSiteAssets {
  if (!htmlAnalysisByPath.has(rootPath)) {
    throw new Error(`Pagefind reachability root not found: ${rootPath}`);
  }

  const reachableHtmlPaths = new Set<string>();
  const reachableAssetTargets = new Set<string>();
  const pending: string[] = [rootPath];

  while (pending.length > 0) {
    const currentPath = pending.pop()!;
    if (reachableHtmlPaths.has(currentPath)) {
      continue;
    }
    reachableHtmlPaths.add(currentPath);

    const analysis = htmlAnalysisByPath.get(currentPath)!;

    for (const outgoingTarget of analysis.outgoingTargets) {
      const target = normalizeOutputPath(outgoingTarget);
      if (!target.endsWith('.html') && path.posix.extname(target)) {
        if (knownAssetTargets.has(target)) {
          reachableAssetTargets.add(target);
        }
        continue;
      }
      const targetPath = toCandidateHtmlAssetPaths(target).find(candidate =>
        htmlAnalysisByPath.has(candidate),
      );
      if (targetPath && !reachableHtmlPaths.has(targetPath)) {
        pending.push(targetPath);
      }
    }
  }

  return {
    reachableHtmlPaths: [...reachableHtmlPaths].sort(),
    reachableAssetTargets: [...reachableAssetTargets].sort(),
  };
}

export function collectReachableHtmlAssets(
  options: CollectReachableOptions,
): string[] {
  return collectReachableSiteAssets(options).reachableHtmlPaths;
}
