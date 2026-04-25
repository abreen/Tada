import fs from 'fs';
import path from 'path';
import { renderCodeSegment } from './code';
import { splitLines } from './literate-java';
import { normalizeOutputPath } from './paths';
import { computeLayout } from './trace-layout';
import { generateStepSvg } from './trace-svg';
import type { TraceChunkEntry, TraceManifest, TraceStep } from '../types';

export const DEFAULT_CHUNK_SIZE = 50;

export interface ChunkTraceOutputOptions {
  chunkSize?: number;
  ignoreFields?: Record<string, string[]>;
}

export function chunkTraceOutput(
  output: string,
  traceOutputDir: string,
  sourceFile: string,
  source: string,
  options: ChunkTraceOutputOptions = {},
): TraceManifest {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const ignoreFields = options.ignoreFields ?? {};

  fs.mkdirSync(traceOutputDir, { recursive: true });

  const lines = output
    .trim()
    .split('\n')
    .filter(l => l.length > 0);

  const allSteps: TraceStep[] = lines.map(l => JSON.parse(l));

  const lineToSteps: Record<number, number[]> = {};
  for (let i = 0; i < allSteps.length; i++) {
    const step = allSteps[i];
    if (!lineToSteps[step.line]) {
      lineToSteps[step.line] = [];
    }
    lineToSteps[step.line].push(i);
  }

  const layout = computeLayout(allSteps, ignoreFields);

  let chunkEntries: TraceChunkEntry[] = [];
  let chunkIndex = 0;

  for (const step of allSteps) {
    const svg = generateStepSvg(step, layout);
    chunkEntries.push({ line: step.line, stdout: step.stdout, svg });

    if (chunkEntries.length >= chunkSize) {
      fs.writeFileSync(
        path.join(traceOutputDir, `chunk-${chunkIndex}.json`),
        JSON.stringify(chunkEntries),
      );
      chunkEntries = [];
      chunkIndex++;
    }
  }

  if (chunkEntries.length > 0) {
    fs.writeFileSync(
      path.join(traceOutputDir, `chunk-${chunkIndex}.json`),
      JSON.stringify(chunkEntries),
    );
  }

  const manifest: TraceManifest = {
    totalSteps: allSteps.length,
    chunkSize,
    sourceFile,
    source,
    lineToSteps,
  };

  fs.writeFileSync(
    path.join(traceOutputDir, 'manifest.json'),
    JSON.stringify(manifest),
  );

  return manifest;
}

export function highlightTraceSource(
  source: string,
  language: 'java' | 'python',
): string {
  return renderCodeSegment(splitLines(source), 1, language, {
    linkLineNumbers: false,
  });
}

export function getTraceOutputPaths(
  relDir: string,
  traceName: string,
  totalSteps: number,
): string[] {
  const baseDir = [relDir, '_traces', traceName].filter(Boolean).join('/');
  const outputPaths = [`${baseDir}/manifest.json`];
  for (
    let chunkIndex = 0;
    chunkIndex * DEFAULT_CHUNK_SIZE < totalSteps;
    chunkIndex++
  ) {
    outputPaths.push(`${baseDir}/chunk-${chunkIndex}.json`);
  }
  return outputPaths;
}

function linkOrCopyFile(sourcePath: string, targetPath: string): void {
  try {
    fs.linkSync(sourcePath, targetPath);
  } catch {
    fs.copyFileSync(sourcePath, targetPath);
  }
}

export function materializeTraceOutputs({
  outputPaths,
  targetDistDir,
  sourceDistDir,
}: {
  outputPaths: string[];
  targetDistDir: string;
  sourceDistDir: string;
}): boolean {
  for (const relPath of outputPaths) {
    const targetPath = path.join(targetDistDir, relPath);
    if (fs.existsSync(targetPath)) {
      continue;
    }

    const sourcePath = path.join(sourceDistDir, relPath);
    if (!fs.existsSync(sourcePath)) {
      return false;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    linkOrCopyFile(sourcePath, targetPath);
  }

  return true;
}

export function buildManifestUrl({
  relDir,
  traceName,
  applyBasePath,
}: {
  relDir: string;
  traceName: string;
  applyBasePath: (subPath: string) => string;
}): string {
  return applyBasePath(
    normalizeOutputPath(
      '/' +
        [relDir, '_traces', traceName, 'manifest.json']
          .filter(Boolean)
          .join('/'),
    ),
  );
}

export function renderTraceWidgetHtml({
  highlightedSource,
  manifestUrl,
  totalSteps,
}: {
  highlightedSource: string;
  manifestUrl?: string;
  totalSteps?: number;
}): string {
  const svgAttrs = `aria-hidden='true' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'`;
  const iconFirst = `<svg xmlns='http://www.w3.org/2000/svg' ${svgAttrs}><line x1='2' y1='6' x2='2' y2='18'/><polyline points='10 6 4 12 10 18'/><line x1='4' y1='12' x2='22' y2='12'/></svg>`;
  const iconPrev = `<svg xmlns='http://www.w3.org/2000/svg' ${svgAttrs}><polyline points='10 6 4 12 10 18'/><line x1='4' y1='12' x2='22' y2='12'/></svg>`;
  const iconNext = `<svg xmlns='http://www.w3.org/2000/svg' ${svgAttrs}><line x1='2' y1='12' x2='20' y2='12'/><polyline points='14 6 20 12 14 18'/></svg>`;
  const iconLast = `<svg xmlns='http://www.w3.org/2000/svg' ${svgAttrs}><line x1='2' y1='12' x2='20' y2='12'/><polyline points='14 6 20 12 14 18'/><line x1='22' y1='6' x2='22' y2='18'/></svg>`;
  const disabled = totalSteps === undefined;
  const counterContent = disabled ? '--' : `1/${totalSteps}`;
  const counterStyle = disabled
    ? ''
    : ` style="min-width: ${String(totalSteps).length * 2 + 1}ch"`;
  const controls =
    `<button class="trace-btn trace-first" disabled tabindex="-1" aria-label="First step" title="First step">${iconFirst}</button>` +
    `<button class="trace-btn trace-prev" disabled tabindex="-1" aria-label="Previous step" title="Previous step">${iconPrev}</button>` +
    `<span class="trace-step-counter"${counterStyle}>${counterContent}</span>` +
    `<button class="trace-btn trace-next" disabled tabindex="-1" aria-label="Next step" title="Next step">${iconNext}</button>` +
    `<button class="trace-btn trace-last" disabled tabindex="-1" aria-label="Last step" title="Last step">${iconLast}</button>`;
  const wrapperAttrs = manifestUrl
    ? ` data-trace-manifest="${manifestUrl}"`
    : '';
  const wrapperClass = disabled
    ? 'trace-widget trace-disabled'
    : 'trace-widget';
  return `<div class="${wrapperClass}"${wrapperAttrs}><noscript><p>This interactive trace requires JavaScript.</p></noscript><div class="trace-body"><div class="trace-toolbar"><div class="trace-controls" role="toolbar" aria-label="Trace navigation">${controls}</div></div><div class="trace-content"><div class="trace-diagram"></div><div class="trace-source-wrapper"><div class="trace-source">${highlightedSource}</div></div></div></div></div>`;
}
