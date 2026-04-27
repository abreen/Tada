import fs from 'fs';
import path from 'path';
import { makeLogger } from './log';
import { getRuntimeBundledShikiLanguages } from './site-variables';
import { createContentRecord } from './source-records';
import { validateConfigLinks } from './validate-config-links';
import { config, getConfigFileName } from './templates';
import { initHighlighter } from './utils/shiki-highlighter';
import { checkTraceToolAvailability } from './utils/trace';
import type {
  SiteVariables,
  ContentRenderOptions,
  ContentRenderResult,
  HtmlOutputAnalysis,
  TraceToolAvailability,
} from './types';

const log = makeLogger(import.meta.url);

function cloneHtmlOutputAnalysis(
  analysis: HtmlOutputAnalysis,
): HtmlOutputAnalysis {
  return { outgoingTargets: new Set(analysis.outgoingTargets) };
}

function writeRecordOutputs(
  distDir: string,
  outputs: Map<string, string | Buffer>,
): void {
  for (const [outputPath, content] of outputs) {
    const outPath = path.join(distDir, outputPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content);
  }
}

export class ContentRenderer {
  private siteVariables: SiteVariables;
  private traceToolAvailability: TraceToolAvailability | undefined;
  private traceCache: Map<
    string,
    {
      manifestUrl: string;
      artifactId: string;
      highlightedSource: string;
      totalSteps: number;
      mtime: number;
    }
  > = new Map();

  constructor(siteVariables: SiteVariables) {
    this.siteVariables = siteVariables;
  }

  async initHighlighter(): Promise<void> {
    await initHighlighter(getRuntimeBundledShikiLanguages(this.siteVariables));
  }

  processContent({
    distDir,
    assetFiles,
    scan,
  }: ContentRenderOptions): ContentRenderResult {
    const buildContentFiles = [...scan.buildContentFiles];
    const validInternalTargets = scan.validTargets;

    const errors: Error[] = [];
    const htmlAssetsByPath = new Map<string, string>();
    const htmlAnalysisByPath = new Map<string, HtmlOutputAnalysis>();

    const configLinkErrors = validateConfigLinks(
      validInternalTargets,
      config('nav'),
      config('authors'),
      {
        navFileName: getConfigFileName('nav'),
        authorsFileName: getConfigFileName('authors'),
      },
    );
    for (const msg of configLinkErrors) {
      errors.push(new Error(msg));
    }

    if (buildContentFiles.length > 0) {
      const noun = buildContentFiles.length === 1 ? 'file' : 'files';
      log.info`Processing ${buildContentFiles.length} content ${noun}`;
    }

    if (!this.traceToolAvailability && buildContentFiles.length > 0) {
      this.traceToolAvailability = checkTraceToolAvailability();
      if (!this.traceToolAvailability.java) {
        log.warn`javac was not found; literate Java pages will not include execution output`;
      }
    }

    for (const filePath of buildContentFiles) {
      try {
        const record = createContentRecord({
          filePath,
          siteVariables: this.siteVariables,
          scan,
          assetFiles,
          outputDir: distDir,
          traceCache: this.traceCache,
          traceToolAvailability: this.traceToolAvailability,
          skipLiterateJavaExecution: !this.traceToolAvailability?.java,
        });
        writeRecordOutputs(distDir, record.outputs);
        for (const [outputPath, content] of record.outputs) {
          if (!outputPath.endsWith('.html') || typeof content !== 'string') {
            continue;
          }
          htmlAssetsByPath.set(outputPath, content);
          const analysis = record.htmlAnalysisByOutputPath?.get(outputPath);
          if (analysis) {
            htmlAnalysisByPath.set(
              outputPath,
              cloneHtmlOutputAnalysis(analysis),
            );
          }
        }
      } catch (err) {
        errors.push(err as Error);
      }
    }

    return { errors, htmlAssetsByPath, htmlAnalysisByPath };
  }
}
