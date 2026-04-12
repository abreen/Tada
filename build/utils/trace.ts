import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { makeLogger } from '../log';
import { B } from '../colors';
import { normalizeOutputPath, toPosix } from './paths';
import { hasMainMethod, runJavac, splitLines } from './literate-java';
import { renderCodeSegment } from './code';
import { computeLayout } from './trace-layout';
import { generateStepSvg } from './trace-svg';
import type { TraceStep, TraceManifest, TraceChunkEntry } from '../types';

const log = makeLogger(import.meta.url);

const DEFAULT_CHUNK_SIZE = 50;

/**
 * Parse // @trace-ignore comments from Java source code.
 * Returns a map of className -> fieldName[] for fields that should be
 * excluded from layout consideration.
 */
export function parseIgnoreFields(source: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const lines = source.split('\n');
  // Track nesting: Java inner classes are reported as Outer$Inner by the tracer.
  // Each entry is [className, braceDepthWhenOpened].
  const classStack: { name: string; depth: number }[] = [];
  let braceDepth = 0;

  for (const line of lines) {
    // Strip strings and comments (except @trace-ignore) to avoid false braces
    const stripped = line
      .replace(/"(?:[^"\\]|\\.)*"/g, '')
      .replace(/\/\/(?!.*@trace-ignore).*/g, '');

    const classMatch = stripped.match(/\bclass\s+(\w+)/);
    if (classMatch) {
      classStack.push({ name: classMatch[1], depth: braceDepth });
    }

    for (const ch of stripped) {
      if (ch === '{') {
        braceDepth++;
      }
      if (ch === '}') {
        braceDepth--;
        // Pop classes whose scope has ended
        while (
          classStack.length > 0 &&
          braceDepth <= classStack[classStack.length - 1].depth
        ) {
          classStack.pop();
        }
      }
    }

    const currentClass =
      classStack.length > 0 ? classStack.map(c => c.name).join('$') : null;

    if (currentClass && line.includes('// @trace-ignore')) {
      const before = line.split('//')[0].trim();
      const withoutSemicolon = before.endsWith(';')
        ? before.slice(0, -1).trim()
        : before;
      const parts = withoutSemicolon.split(/\s+/);
      if (parts.length >= 2) {
        const fieldName = parts[parts.length - 1];
        if (!result[currentClass]) {
          result[currentClass] = [];
        }
        result[currentClass].push(fieldName);
      }
    }
  }

  return result;
}

let tracerClassDir: string | null = null;

function ensureTracerCompiled(): string {
  if (tracerClassDir) {
    return tracerClassDir;
  }

  const sourceDir = path.join(import.meta.dir, 'jdi-runner');
  const sourceFile = path.join(sourceDir, 'TraceRunner.java');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-tracer-'));

  log.debug`Compiling TraceRunner.java into ${tempDir}`;

  runJavac(['-d', tempDir, sourceFile], {
    tempDir,
    label: 'Failed to compile TraceRunner.java',
  });

  tracerClassDir = tempDir;
  return tempDir;
}

function compileTargetFile(javaFilePath: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-trace-target-'));

  runJavac(
    [
      '-g',
      '-d',
      tempDir,
      '-sourcepath',
      path.dirname(javaFilePath),
      javaFilePath,
    ],
    { tempDir, label: `Compilation failed for ${javaFilePath}` },
  );

  return tempDir;
}

export function chunkTraceOutput(
  output: string,
  traceOutputDir: string,
  sourceFile: string,
  source: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): TraceManifest {
  fs.mkdirSync(traceOutputDir, { recursive: true });

  const lines = output
    .trim()
    .split('\n')
    .filter(l => l.length > 0);

  // Parse all steps first (needed for layout pass)
  const allSteps: TraceStep[] = lines.map(l => JSON.parse(l));

  const lineToSteps: Record<number, number[]> = {};
  for (let i = 0; i < allSteps.length; i++) {
    const step = allSteps[i];
    if (!lineToSteps[step.line]) {
      lineToSteps[step.line] = [];
    }
    lineToSteps[step.line].push(i);
  }

  // Parse @trace-ignore comments from source
  const ignoreFields = parseIgnoreFields(source);

  // Compute stable layout across all steps, then generate SVG per step
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

export interface TraceContext {
  filePath: string;
  contentDir: string;
  distDir: string;
  applyBasePath: (subPath: string) => string;
  cache: Map<string, TraceResult>;
  javacAvailable?: boolean;
}

export interface TraceResult {
  manifestUrl: string;
  highlightedSource: string;
  totalSteps: number;
  mtime: number;
}

function highlightSource(source: string): string {
  return renderCodeSegment(splitLines(source), 1, 'java', {
    linkLineNumbers: false,
  });
}

function renderWidgetHtml({
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
    (disabled
      ? `<button class="trace-btn trace-next" disabled tabindex="-1" aria-label="Next step" title="Next step">${iconNext}</button>`
      : `<button class="trace-btn trace-next" aria-label="Next step" title="Next step">${iconNext}</button>`) +
    (disabled
      ? `<button class="trace-btn trace-last" disabled tabindex="-1" aria-label="Last step" title="Last step">${iconLast}</button>`
      : `<button class="trace-btn trace-last" tabindex="-1" aria-label="Last step" title="Last step">${iconLast}</button>`);
  const wrapperAttrs = manifestUrl
    ? ` data-trace-manifest="${manifestUrl}"`
    : '';
  const wrapperClass = disabled
    ? 'trace-widget trace-disabled'
    : 'trace-widget';
  return `<div class="${wrapperClass}"${wrapperAttrs}><noscript><p>This interactive trace requires JavaScript.</p></noscript><div class="trace-body"><div class="trace-toolbar"><div class="trace-controls" role="toolbar" aria-label="Trace navigation">${controls}</div></div><div class="trace-content"><div class="trace-diagram"></div><div class="trace-source-wrapper"><div class="trace-source">${highlightedSource}</div></div><pre class="trace-output"></pre></div></div></div>`;
}

export function createTraceHelpers(context: TraceContext): {
  renderTrace: (javaFile: string) => string;
} {
  const {
    filePath,
    contentDir,
    distDir,
    applyBasePath,
    cache,
    javacAvailable,
  } = context;
  const pageDir = path.dirname(filePath);

  function getOrRunTrace(javaFile: string): TraceResult {
    const javaFilePath = path.resolve(pageDir, javaFile);

    const cached = cache.get(javaFilePath);
    if (cached) {
      const mtime = fs.statSync(javaFilePath, {
        throwIfNoEntry: false,
      })?.mtimeMs;
      if (mtime !== undefined && mtime === cached.mtime) {
        return cached;
      }
    }

    if (!fs.existsSync(javaFilePath)) {
      throw new Error(`Trace target not found: ${javaFilePath}`);
    }

    const source = fs.readFileSync(javaFilePath, 'utf-8');
    if (!hasMainMethod(source)) {
      throw new Error(
        `${javaFilePath}: no main() method found (required for tracing)`,
      );
    }

    const className = path.parse(javaFile).name;
    log.info`Tracing ${B`${javaFile}`}`;

    const targetClassDir = compileTargetFile(javaFilePath);

    try {
      const tracerDir = ensureTracerCompiled();
      const output = execFileSync(
        'java',
        ['-cp', tracerDir, 'TraceRunner', className, targetClassDir],
        { timeout: 60000, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 },
      );

      const highlightedSource = highlightSource(source);

      const relDir = toPosix(path.relative(contentDir, pageDir));
      const traceOutputDir = path.join(distDir, relDir, '_traces', className);

      const manifest = chunkTraceOutput(
        output,
        traceOutputDir,
        `${className}.java`,
        source,
        DEFAULT_CHUNK_SIZE,
      );

      const manifestUrl = applyBasePath(
        normalizeOutputPath(
          '/' +
            [relDir, '_traces', className, 'manifest.json']
              .filter(Boolean)
              .join('/'),
        ),
      );

      const totalSteps = manifest.totalSteps;
      const mtime = fs.statSync(javaFilePath).mtimeMs;
      cache.set(javaFilePath, {
        manifestUrl,
        highlightedSource,
        totalSteps,
        mtime,
      });
      return { manifestUrl, highlightedSource, totalSteps, mtime };
    } finally {
      fs.rmSync(targetClassDir, { recursive: true, force: true });
    }
  }

  return {
    renderTrace: (javaFile: string): string => {
      if (javacAvailable === false) {
        log.warn`javac was not found; trace for ${B`${javaFile}`} will be disabled`;
        const javaFilePath = path.resolve(pageDir, javaFile);
        if (!fs.existsSync(javaFilePath)) {
          throw new Error(`Trace target not found: ${javaFilePath}`);
        }
        const source = fs.readFileSync(javaFilePath, 'utf-8');
        return renderWidgetHtml({ highlightedSource: highlightSource(source) });
      }
      const { manifestUrl, highlightedSource, totalSteps } =
        getOrRunTrace(javaFile);
      return renderWidgetHtml({ highlightedSource, manifestUrl, totalSteps });
    },
  };
}
