import path from 'path';
import type { SiteVariables } from './types.js';
import { getContentDir, getBuildContentFiles } from './util.js';
import {
  compileTemplates,
  getHtmlTemplatesDir,
  getJsonDataDir,
  JSON_DATA_FILES,
} from './templates.js';
import { getProjectDir } from './utils/paths.js';
import { B } from './colors.js';
import { makeLogger } from './log.js';

const log = makeLogger(__filename);

interface ChangeDetectionResult {
  templateError: Error | null;
  needsRestart: boolean;
  changedContentFiles?: Set<string>;
  templatesChanged?: boolean;
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

    const htmlTemplatesDir = getHtmlTemplatesDir();
    const jsonDataDir = getJsonDataDir();

    // Try to recompile templates
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
    const normalizedHtmlDir = path.resolve(htmlTemplatesDir) + path.sep;
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

    // Check if any HTML template or JSON data file changed
    const jsonDataPaths = JSON_DATA_FILES.map(f =>
      path.resolve(jsonDataDir, f),
    );
    const changedTemplatePaths = [...resolvedFiles].filter(
      filePath =>
        filePath === path.resolve(htmlTemplatesDir) ||
        filePath.startsWith(normalizedHtmlDir) ||
        jsonDataPaths.includes(filePath),
    );
    const templatesChanged = changedTemplatePaths.length > 0;

    for (const filePath of changedTemplatePaths) {
      log.event`${B`${path.basename(filePath)}`} changed, rebuilding`;
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
      templatesChanged,
    };
  }
}
