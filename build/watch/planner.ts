import fs from 'fs';
import path from 'path';
import {
  AUTHORS_JSON_FILE,
  NAV_JSON_FILE,
  getProjectDataFilePath,
  getSiteConfigPath,
} from '../config-files';
import { getJsonDataDir } from '../templates';
import type { ChangeBatch } from '../../watch/types';
import type { TadaProjectScan, TadaSnapshot } from './snapshot';

export interface TadaWatchPlan {
  kind: 'full' | 'incremental';
  scan: TadaProjectScan;
  contentToRender: Set<string>;
  publicToRender: Set<string>;
  contentToRemove: Set<string>;
  publicToRemove: Set<string>;
}

function readJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function diffAuthorKeys(previous: unknown, next: unknown): Set<string> {
  const previousMap =
    previous && typeof previous === 'object'
      ? (previous as Record<string, unknown>)
      : {};
  const nextMap =
    next && typeof next === 'object' ? (next as Record<string, unknown>) : {};
  const keys = new Set([...Object.keys(previousMap), ...Object.keys(nextMap)]);
  const changed = new Set<string>();

  for (const key of keys) {
    if (JSON.stringify(previousMap[key]) !== JSON.stringify(nextMap[key])) {
      changed.add(key);
    }
  }

  return changed;
}

function addDependents(
  destination: Set<string>,
  reverseMap: Map<string, Set<string>>,
  key: string,
): void {
  const dependents = reverseMap.get(key);
  if (!dependents) {
    return;
  }
  for (const dependent of dependents) {
    destination.add(dependent);
  }
}

function sourceExists(filePath: string, scan: TadaProjectScan): boolean {
  return scan.contentFiles.has(filePath) || scan.publicFiles.has(filePath);
}

export function createTadaWatchPlan({
  snapshot,
  batch,
  scan,
}: {
  snapshot: TadaSnapshot | undefined;
  batch: ChangeBatch;
  scan: TadaProjectScan;
}): TadaWatchPlan {
  const contentToRender = new Set<string>();
  const publicToRender = new Set<string>();
  const contentToRemove = new Set<string>();
  const publicToRemove = new Set<string>();
  const jsonDataDir = getJsonDataDir();
  const siteConfigPath = path.resolve(getSiteConfigPath('.', 'dev'));
  const navPath = path.resolve(
    getProjectDataFilePath(jsonDataDir, NAV_JSON_FILE),
  );
  const authorsPath = path.resolve(
    getProjectDataFilePath(jsonDataDir, AUTHORS_JSON_FILE),
  );

  if (!snapshot) {
    return {
      kind: 'full',
      scan,
      contentToRender,
      publicToRender,
      contentToRemove,
      publicToRemove,
    };
  }

  for (const change of batch.changes) {
    const resolvedPath = path.resolve(change.path);
    if (resolvedPath === siteConfigPath || resolvedPath === navPath) {
      return {
        kind: 'full',
        scan,
        contentToRender,
        publicToRender,
        contentToRemove,
        publicToRemove,
      };
    }
  }

  for (const change of batch.changes) {
    const resolvedPath = path.resolve(change.path);
    if (resolvedPath === authorsPath) {
      const nextAuthorsData = readJsonFile(authorsPath);
      if (snapshot.authorsData === undefined || nextAuthorsData === undefined) {
        return {
          kind: 'full',
          scan,
          contentToRender,
          publicToRender,
          contentToRemove,
          publicToRemove,
        };
      }
      const changedAuthorKeys = diffAuthorKeys(
        snapshot.authorsData,
        nextAuthorsData,
      );
      for (const key of changedAuthorKeys) {
        addDependents(contentToRender, snapshot.reverseAuthorDeps, key);
      }
      continue;
    }

    if (scan.contentFiles.has(resolvedPath)) {
      contentToRender.add(resolvedPath);
    } else if (snapshot.contentRecords.has(resolvedPath)) {
      contentToRemove.add(resolvedPath);
      const previousRecord = snapshot.contentRecords.get(resolvedPath)!;
      for (const partialPath of previousRecord.partialDeps) {
        addDependents(
          contentToRender,
          snapshot.reversePartialDeps,
          partialPath,
        );
      }
      for (const tracePath of previousRecord.traceDeps) {
        addDependents(contentToRender, snapshot.reverseTraceDeps, tracePath);
      }
    }

    if (scan.publicFiles.has(resolvedPath)) {
      publicToRender.add(resolvedPath);
    } else if (snapshot.publicRecords.has(resolvedPath)) {
      publicToRemove.add(resolvedPath);
    }

    addDependents(contentToRender, snapshot.reversePartialDeps, resolvedPath);
    addDependents(contentToRender, snapshot.reverseTraceDeps, resolvedPath);
  }

  const changedTargets = new Set<string>();
  const removedTargets = new Set<string>();
  for (const target of snapshot.validTargets) {
    if (!scan.validTargets.has(target)) {
      changedTargets.add(target);
      removedTargets.add(target);
    }
  }
  for (const target of scan.validTargets) {
    if (!snapshot.validTargets.has(target)) {
      changedTargets.add(target);
    }
  }
  for (const target of changedTargets) {
    addDependents(contentToRender, snapshot.reverseInternalTargetDeps, target);
  }

  if (removedTargets.size > 0 && contentToRender.size === 0) {
    const rootOwner = snapshot.outputOwners.get('index.html');
    if (rootOwner?.kind === 'content') {
      contentToRender.add(rootOwner.sourcePath);
    }
  }

  for (const [outputPath, owner] of snapshot.outputOwners) {
    const nextContentOwner = scan.contentOwners.get(outputPath);
    const nextPublicOwner = scan.publicOwners.get(outputPath);
    const nextKind = nextPublicOwner
      ? 'public'
      : nextContentOwner
        ? 'content'
        : null;
    const nextSourcePath = nextPublicOwner || nextContentOwner;

    if (!nextKind || !nextSourcePath) {
      continue;
    }
    if (owner.kind !== nextKind || owner.sourcePath !== nextSourcePath) {
      if (nextKind === 'content') {
        contentToRender.add(nextSourcePath);
      } else {
        publicToRender.add(nextSourcePath);
      }
    }
  }

  for (const [outputPath, nextSourcePath] of scan.contentOwners) {
    if (!snapshot.outputOwners.has(outputPath)) {
      contentToRender.add(nextSourcePath);
    }
  }
  for (const [outputPath, nextSourcePath] of scan.publicOwners) {
    if (!snapshot.outputOwners.has(outputPath)) {
      publicToRender.add(nextSourcePath);
    }
  }

  for (const sourcePath of [...contentToRender]) {
    if (!sourceExists(sourcePath, scan)) {
      contentToRender.delete(sourcePath);
    }
  }
  for (const sourcePath of [...publicToRender]) {
    if (!sourceExists(sourcePath, scan)) {
      publicToRender.delete(sourcePath);
    }
  }

  return {
    kind: 'incremental',
    scan,
    contentToRender,
    publicToRender,
    contentToRemove,
    publicToRemove,
  };
}
