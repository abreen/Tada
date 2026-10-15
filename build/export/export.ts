import fs from 'fs';
import path from 'path';
import { getDevSiteVariables, getProdSiteVariables } from '../site-variables';
import { addGeneratedRouteAliases, scanProject } from '../source-model';
import { parseFrontMatterAndContent } from '../utils/front-matter';
import { extensionIsMarkdown } from '../utils/file-types';
import {
  getContentDir,
  getProjectDir,
  getPublicDir,
  isInside,
  toDisplayPath,
  toPosix,
} from '../utils/paths';
import {
  getSiteVars,
  readSourceFile,
  substituteContent,
  substituteFrontMatterValue,
} from '../variables';
import {
  exportHtmlPage,
  exportMarkdownPage,
  type ExportContext,
} from './export-markdown';
import type { SiteEnv } from '../config-files';

export const DEFAULT_EXPORT_DIR = 'exported';

interface ExportOptions {
  env: SiteEnv;
  /** Output directory, relative to the project directory */
  outDir: string;
  /** Replace an output directory that is not empty */
  force: boolean;
}

export interface ExportSummary {
  outDir: string;
  pages: number;
  files: number;
}

type ExportJob =
  | { kind: 'markdown'; filePath: string; relPath: string; literate: boolean }
  | { kind: 'html'; filePath: string; relPath: string }
  | { kind: 'copy'; filePath: string; relPath: string };

function prepareOutDir(outDir: string, force: boolean): void {
  const projectDir = path.resolve(getProjectDir());
  const overlaps = (dir: string) =>
    dir === outDir || isInside(dir, outDir) || isInside(outDir, dir);
  if (
    outDir === projectDir ||
    overlaps(getContentDir()) ||
    overlaps(getPublicDir())
  ) {
    throw new Error(
      `cannot export to ${toDisplayPath(outDir)}: it overlaps content/ or public/`,
    );
  }
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
    if (!force) {
      throw new Error(
        `${toDisplayPath(outDir)}/ is not empty; use --force to replace it`,
      );
    }
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });
}

function pageTitle(
  pageVariables: Record<string, unknown>,
  siteVariables: ExportContext['siteVariables'],
  filePath: string,
): string | undefined {
  const title = substituteFrontMatterValue(
    pageVariables.title,
    siteVariables,
    filePath,
  );
  if (typeof title === 'string') {
    return title.trim() || undefined;
  }
  return typeof title === 'number' || typeof title === 'boolean'
    ? String(title)
    : undefined;
}

function writeFile(outDir: string, relPath: string, content: string): void {
  const outPath = path.join(outDir, ...relPath.split('/'));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content);
}

/**
 * Writes the site's content as plain GitHub Flavored Markdown: Markdown and
 * literate Java pages become Markdown without front matter, HTML pages lose
 * their front matter, and other files are copied. Code pages, partials,
 * document indexes, and skipped pages are left out.
 */
export function runExport({
  env,
  outDir,
  force,
}: ExportOptions): ExportSummary {
  const siteVariables =
    env === 'dev' ? getDevSiteVariables() : getProdSiteVariables();
  const scan = scanProject(siteVariables);
  const resolvedOutDir = path.resolve(getProjectDir(), outDir);

  const jobs: ExportJob[] = [];
  const exportPaths = new Map<string, string>();
  const producers = new Map<string, string>();

  for (const [filePath, entry] of scan.sources) {
    const rootDir = entry.kind === 'content' ? scan.contentDir : scan.publicDir;
    const relPath = toPosix(path.relative(rootDir, filePath));
    let job: ExportJob;
    if (entry.kind === 'public') {
      job = { kind: 'copy', filePath, relPath };
    } else if (entry.renderKind === 'literate-java') {
      job = { kind: 'markdown', filePath, relPath, literate: true };
    } else if (entry.renderKind === 'plain-text-page') {
      const ext = path.extname(filePath).toLowerCase();
      job = extensionIsMarkdown(ext)
        ? { kind: 'markdown', filePath, relPath, literate: false }
        : { kind: 'html', filePath, relPath };
    } else if (
      entry.renderKind === 'code-page' ||
      entry.renderKind === 'content-copy'
    ) {
      job = { kind: 'copy', filePath, relPath };
    } else {
      continue;
    }

    const key = relPath.toLowerCase();
    const other = producers.get(key);
    if (other !== undefined) {
      throw new Error(
        `${toDisplayPath(filePath)} and ${other} would both be exported as ${relPath}`,
      );
    }
    producers.set(key, toDisplayPath(filePath));
    jobs.push(job);

    for (const output of entry.outputs) {
      const aliases = new Set<string>();
      addGeneratedRouteAliases(aliases, `/${output}`);
      for (const alias of aliases) {
        exportPaths.set(alias, relPath);
      }
    }
  }

  const context: ExportContext = {
    siteVariables,
    pageTitles: scan.pageTitles,
    exportPaths,
    readFile: filePath =>
      fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null,
    readTraceFile: filePath => {
      if (!fs.existsSync(filePath)) {
        throw new Error(`trace file not found: ${toDisplayPath(filePath)}`);
      }
      return readSourceFile(filePath, scan.contentDir, siteVariables);
    },
  };

  // Convert everything before writing, so an error leaves no partial export
  const outputs: { relPath: string; content?: string; filePath: string }[] = [];
  const vars = getSiteVars(siteVariables);
  for (const job of jobs) {
    if (job.kind === 'copy') {
      outputs.push(job);
      continue;
    }
    const ext =
      job.kind === 'markdown'
        ? '.md'
        : path.extname(job.filePath).toLowerCase();
    const { pageVariables, content } = parseFrontMatterAndContent(
      fs.readFileSync(job.filePath, 'utf-8'),
      ext,
      toDisplayPath(job.filePath),
    );
    const page = {
      filePath: job.filePath,
      relPath: job.relPath,
      title: pageTitle(pageVariables, siteVariables, job.filePath),
      preserveHtmlComments: job.kind === 'markdown' && job.literate,
    };
    const body = substituteContent(
      content,
      vars,
      job.filePath,
      page.preserveHtmlComments,
    );
    outputs.push({
      ...job,
      content:
        job.kind === 'markdown'
          ? exportMarkdownPage(context, page, body)
          : exportHtmlPage(context, page, body),
    });
  }

  prepareOutDir(resolvedOutDir, force);
  let pages = 0;
  for (const output of outputs) {
    if (output.content === undefined) {
      const outPath = path.join(resolvedOutDir, ...output.relPath.split('/'));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.copyFileSync(output.filePath, outPath);
    } else {
      writeFile(resolvedOutDir, output.relPath, output.content);
      pages++;
    }
  }

  return {
    outDir: toDisplayPath(resolvedOutDir),
    pages,
    files: outputs.length - pages,
  };
}
