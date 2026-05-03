import path from 'path';
import { normalizeOutputPath } from './util';
import type { HtmlOutputAnalysis } from './types';

function normalizeInternalTarget(target: string): string {
  return normalizeOutputPath(target);
}

function toCandidateHtmlAssetPaths(target: string): string[] {
  const normalizedTarget = normalizeInternalTarget(target);

  if (normalizedTarget === '/') {
    return ['index.html'];
  }

  if (normalizedTarget.endsWith('.html')) {
    return [normalizedTarget.slice(1)];
  }

  if (path.posix.extname(normalizedTarget)) {
    return [];
  }

  const withoutLeadingSlash = normalizedTarget.slice(1);
  if (normalizedTarget.endsWith('/')) {
    return [`${withoutLeadingSlash}index.html`];
  }

  return [`${withoutLeadingSlash}/index.html`, `${withoutLeadingSlash}.html`];
}

function resolveTargetToAssetTarget(target: string): string | null {
  const normalizedTarget = normalizeInternalTarget(target);
  if (normalizedTarget === '/' || normalizedTarget.endsWith('.html')) {
    return null;
  }
  return path.posix.extname(normalizedTarget) ? normalizedTarget : null;
}

function collectOutgoingHtmlAssetPaths(
  analysis: HtmlOutputAnalysis,
  knownHtmlAssetPaths: Set<string>,
): string[] {
  const htmlAssetPaths = new Set<string>();

  for (const target of analysis.outgoingTargets) {
    for (const candidate of toCandidateHtmlAssetPaths(target)) {
      if (knownHtmlAssetPaths.has(candidate)) {
        htmlAssetPaths.add(candidate);
        break;
      }
    }
  }

  return [...htmlAssetPaths].sort();
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

  const knownHtmlAssetPaths = new Set(htmlAnalysisByPath.keys());
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

    for (const targetPath of collectOutgoingHtmlAssetPaths(
      analysis,
      knownHtmlAssetPaths,
    )) {
      if (!reachableHtmlPaths.has(targetPath)) {
        pending.push(targetPath);
      }
    }

    for (const target of analysis.outgoingTargets) {
      const assetTarget = resolveTargetToAssetTarget(target);
      if (assetTarget && knownAssetTargets.has(assetTarget)) {
        reachableAssetTargets.add(assetTarget);
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
