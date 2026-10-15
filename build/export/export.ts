import fs from 'fs';
import path from 'path';
import { getDevSiteVariables, getProdSiteVariables } from '../site-variables';
import {
  addGeneratedRouteAliases,
  assertNoOutputPathConflicts,
  scanProject,
} from '../source-model';
import { parseFrontMatterAndContent } from '../utils/front-matter';
import { extensionIsMarkdown } from '../utils/file-types';
import { extractLiterateJavaCode } from '../utils/literate-java';
import { createMarkdown } from '../utils/markdown';
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
  | {
      kind: 'markdown';
      filePath: string;
      relPath: string;
      /** Where a literate Java page's extracted source goes */
      javaRelPath?: string;
    }
  | { kind: 'html'; filePath: string; relPath: string }
  | { kind: 'source'; filePath: string; relPath: string }
  | { kind: 'copy'; filePath: string; relPath: string };

interface ExportOutput {
  relPath: string;
  /** Copied from here when there is no content */
  filePath: string;
  content?: string;
  page: boolean;
}

/**
 * Fails when the output directory overlaps the project's sources. Paths are
 * compared without case, since macOS and Windows file systems ignore it.
 */
function checkOutDir(outDir: string, force: boolean): void {
  const lower = (dir: string) => path.resolve(dir).toLowerCase();
  const out = lower(outDir);
  const overlaps = (dir: string) =>
    lower(dir) === out ||
    isInside(lower(dir), out) ||
    isInside(out, lower(dir));
  if (
    out === lower(getProjectDir()) ||
    overlaps(getContentDir()) ||
    overlaps(getPublicDir())
  ) {
    throw new Error(
      `cannot export to ${toDisplayPath(outDir)}: it overlaps content/ or public/`,
    );
  }
  if (!force && fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
    throw new Error(
      `${toDisplayPath(outDir)}/ is not empty; use --force to replace it`,
    );
  }
}

/**
 * Writes the outputs to a new directory beside `outDir`, then puts it in
 * place, so a failure leaves any earlier export as it was
 */
function publishOutputs(outDir: string, outputs: ExportOutput[]): void {
  const staging = `${outDir}.tmp-${process.pid}`;
  const backup = `${outDir}.old-${process.pid}`;
  fs.rmSync(staging, { recursive: true, force: true });
  try {
    fs.mkdirSync(staging, { recursive: true });
    for (const output of outputs) {
      const outPath = path.join(staging, ...output.relPath.split('/'));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      if (output.content === undefined) {
        fs.copyFileSync(output.filePath, outPath);
      } else {
        fs.writeFileSync(outPath, output.content);
      }
    }
    if (fs.existsSync(outDir)) {
      fs.renameSync(outDir, backup);
    }
    fs.renameSync(staging, outDir);
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    if (fs.existsSync(backup) && !fs.existsSync(outDir)) {
      fs.renameSync(backup, outDir);
    }
    throw error;
  }
  fs.rmSync(backup, { recursive: true, force: true });
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
  checkOutDir(resolvedOutDir, force);

  // The build fails when two sources write one output, and a link to that
  // output could not tell which source to export
  const conflicts = assertNoOutputPathConflicts(scan).map(output => {
    const sources = [...scan.outputProducers.get(output)!]
      .map(toDisplayPath)
      .sort();
    return `${sources.join(', ')}: ${sources.length === 2 ? 'both write' : 'all write'} ${output}`;
  });
  if (conflicts.length > 0) {
    throw new Error(conflicts.join('\n'));
  }

  const jobs: ExportJob[] = [];
  const exportPaths = new Map<string, string>();
  const producers = new Map<string, string>();

  // The export keeps source paths, so a page and a file the build publishes
  // at different URLs, such as content/notes.md (notes.html) and
  // public/notes.md, can still land on the same path. Paths that differ only
  // in case are one file on macOS and Windows.
  const claim = (relPath: string, filePath: string) => {
    const key = relPath.toLowerCase();
    const other = producers.get(key);
    if (other !== undefined) {
      throw new Error(
        `${toDisplayPath(filePath)} and ${other} would both be exported as ${relPath}; rename one of them`,
      );
    }
    producers.set(key, toDisplayPath(filePath));
  };

  for (const [filePath, entry] of scan.sources) {
    const rootDir = entry.kind === 'content' ? scan.contentDir : scan.publicDir;
    const relPath = toPosix(path.relative(rootDir, filePath));
    let job: ExportJob;
    if (entry.kind === 'public') {
      job = { kind: 'copy', filePath, relPath };
    } else if (entry.renderKind === 'literate-java') {
      // The build also publishes the extracted Java source
      const javaRelPath = [...entry.outputs].find(
        output => !output.endsWith('.html'),
      );
      job = { kind: 'markdown', filePath, relPath, javaRelPath };
    } else if (entry.renderKind === 'plain-text-page') {
      const ext = path.extname(filePath).toLowerCase();
      job = extensionIsMarkdown(ext)
        ? { kind: 'markdown', filePath, relPath }
        : { kind: 'html', filePath, relPath };
    } else if (entry.renderKind === 'code-page') {
      job = { kind: 'source', filePath, relPath };
    } else if (entry.renderKind === 'content-copy') {
      job = { kind: 'copy', filePath, relPath };
    } else {
      continue;
    }

    claim(relPath, filePath);
    const javaRelPath = job.kind === 'markdown' ? job.javaRelPath : undefined;
    if (javaRelPath !== undefined) {
      claim(javaRelPath, filePath);
    }
    jobs.push(job);

    for (const output of entry.outputs) {
      const aliases = new Set<string>();
      addGeneratedRouteAliases(aliases, `/${output}`);
      for (const alias of aliases) {
        exportPaths.set(alias, output === javaRelPath ? output : relPath);
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

  const outputs: ExportOutput[] = [];
  const vars = getSiteVars(siteVariables);
  for (const job of jobs) {
    if (job.kind === 'copy') {
      outputs.push({ ...job, page: false });
      continue;
    }
    if (job.kind === 'source') {
      // As the build publishes it, with variables substituted
      outputs.push({
        ...job,
        content: readSourceFile(job.filePath, scan.contentDir, siteVariables),
        page: false,
      });
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
      preserveHtmlComments:
        job.kind === 'markdown' && job.javaRelPath !== undefined,
    };
    const body = substituteContent(
      content,
      vars,
      job.filePath,
      page.preserveHtmlComments,
    );
    outputs.push({
      relPath: job.relPath,
      filePath: job.filePath,
      content:
        job.kind === 'markdown'
          ? exportMarkdownPage(context, page, body)
          : exportHtmlPage(context, page, body),
      page: true,
    });
    if (job.kind === 'markdown' && job.javaRelPath !== undefined) {
      const md = createMarkdown(siteVariables, {
        filePath: job.filePath,
        vars,
        preserveHtmlComments: true,
        pageTitles: scan.pageTitles,
      });
      outputs.push({
        relPath: job.javaRelPath,
        filePath: job.filePath,
        content: extractLiterateJavaCode(md.parse(body, {})).javaSource,
        page: false,
      });
    }
  }

  publishOutputs(resolvedOutDir, outputs);
  const pages = outputs.filter(output => output.page).length;
  return {
    outDir: toDisplayPath(resolvedOutDir),
    pages,
    files: outputs.length - pages,
  };
}
