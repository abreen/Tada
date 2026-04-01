import path from 'path';
import type { SiteVariables } from './types';
import { getContentDir, getBuildContentFiles, isPartial } from './util';
import { compileTemplates, getJsonDataDir, JSON_DATA_FILES } from './templates';
import { getProjectDir } from './utils/paths';
import { B } from './colors';
import { makeLogger } from './log';

const log = makeLogger(__filename);

interface ChangeDetectionResult {
  templateError: Error | null;
  needsRestart: boolean;
  changedContentFiles?: Set<string>;
  jsonDataChanged?: boolean;
  partialsChanged?: boolean;
}

export class ContentChangeDetector {
  private siteVariables: SiteVariables;
  private siteConfigPath: string;
  private lastSig: string | null;

  constructor(siteVariables: SiteVariables) {
    this.siteVariables = siteVariables;
    this.siteConfigPath = path.resolve(getProjectDir(), 'site.dev.json');
    this.lastSig = null;
  }

  detectChanges(modifiedFiles: Iterable<string>): ChangeDetectionResult {
    const resolvedFiles = new Set(
      [...(modifiedFiles || [])].map(filePath => path.resolve(filePath)),
    );

    const jsonDataDir = getJsonDataDir();

    // Try to recompile templates (also re-reads JSON data files)
    let templateError: Error | null = null;
    try {
      compileTemplates(this.siteVariables);
    } catch (err) {
      templateError = err as Error;
    }

    if (templateError) {
      return { templateError, needsRestart: false };
    }

    const contentDir = getContentDir();
    const normalizedContentDir = path.resolve(contentDir) + path.sep;
    const buildContentFiles = getBuildContentFiles(
      contentDir,
      Object.keys(this.siteVariables.codeLanguages || {}),
    );

    // Detect structural changes (files added or deleted)
    const sig = buildContentFiles.slice().sort().join('\0');
    let needsRestart = false;
    if (this.lastSig !== null && sig !== this.lastSig) {
      needsRestart = true;
    }
    this.lastSig = sig;

    const changedContentFiles = new Set(
      [...resolvedFiles].filter(filePath =>
        filePath.startsWith(normalizedContentDir),
      ),
    );

    // Check if any JSON data file changed (nav.json, authors.json)
    const jsonDataPaths = JSON_DATA_FILES.map(f =>
      path.resolve(jsonDataDir, f),
    );
    const changedJsonDataPaths = [...resolvedFiles].filter(filePath =>
      jsonDataPaths.includes(filePath),
    );
    const jsonDataChanged = changedJsonDataPaths.length > 0;
    const partialsChanged = [...changedContentFiles].some(f => isPartial(f));

    for (const filePath of changedJsonDataPaths) {
      log.event`${B`${path.basename(filePath)}`} changed, rebuilding`;
    }

    if (partialsChanged) {
      const changedPartials = [...changedContentFiles].filter(f =>
        isPartial(f),
      );
      for (const filePath of changedPartials) {
        log.event`Partial ${B`${path.basename(filePath)}`} changed, rebuilding`;
      }
    }

    const changedJavaFiles = [...changedContentFiles].filter(f =>
      f.endsWith('.java'),
    );
    for (const filePath of changedJavaFiles) {
      log.event`${B`${path.basename(filePath)}`} changed, re-running traces`;
    }

    // Check if site config changed
    const siteConfigChanged = resolvedFiles.has(
      path.resolve(this.siteConfigPath),
    );
    if (siteConfigChanged) {
      needsRestart = true;
    }

    return {
      templateError: null,
      needsRestart,
      changedContentFiles,
      jsonDataChanged,
      partialsChanged,
    };
  }
}
