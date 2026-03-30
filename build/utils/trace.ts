import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { makeLogger } from '../log';
import { B } from '../colors';
import { normalizeOutputPath } from './paths';
import { hasMainMethod } from './literate-java';
import { renderCodeSegment } from './code';
import type { TraceStep, TraceManifest } from '../types';

const log = makeLogger(__filename);

const DEFAULT_CHUNK_SIZE = 50;

let tracerClassDir: string | null = null;

function ensureTracerCompiled(): string {
  if (tracerClassDir) {
    return tracerClassDir;
  }

  const sourceDir = path.join(__dirname, 'jdi-runner');
  const sourceFile = path.join(sourceDir, 'TraceRunner.java');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-tracer-'));

  log.debug`Compiling TraceRunner.java into ${tempDir}`;

  try {
    execFileSync('javac', ['-d', tempDir, sourceFile], {
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: unknown) {
    const execErr = err as { stderr?: Buffer; message: string };
    const stderr = execErr.stderr ? execErr.stderr.toString() : execErr.message;
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Failed to compile TraceRunner.java:\n${stderr}`, {
      cause: err,
    });
  }

  tracerClassDir = tempDir;
  return tempDir;
}

function compileTargetFile(javaFilePath: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-trace-target-'));

  try {
    execFileSync(
      'javac',
      [
        '-g',
        '-d',
        tempDir,
        '-sourcepath',
        path.dirname(javaFilePath),
        javaFilePath,
      ],
      { timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch (err: unknown) {
    const execErr = err as { stderr?: Buffer; message: string };
    const stderr = execErr.stderr ? execErr.stderr.toString() : execErr.message;
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Compilation failed for ${javaFilePath}:\n${stderr}`, {
      cause: err,
    });
  }

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
  const lineToSteps: Record<number, number[]> = {};
  let chunkSteps: TraceStep[] = [];
  let chunkIndex = 0;

  for (let stepIndex = 0; stepIndex < lines.length; stepIndex++) {
    const step: TraceStep = JSON.parse(lines[stepIndex]);
    chunkSteps.push(step);

    if (!lineToSteps[step.line]) {
      lineToSteps[step.line] = [];
    }
    lineToSteps[step.line].push(stepIndex);

    if (chunkSteps.length >= chunkSize) {
      fs.writeFileSync(
        path.join(traceOutputDir, `chunk-${chunkIndex}.json`),
        JSON.stringify(chunkSteps),
      );
      chunkSteps = [];
      chunkIndex++;
    }
  }

  if (chunkSteps.length > 0) {
    fs.writeFileSync(
      path.join(traceOutputDir, `chunk-${chunkIndex}.json`),
      JSON.stringify(chunkSteps),
    );
  }

  const manifest: TraceManifest = {
    totalSteps: lines.length,
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
}

export interface TraceResult {
  manifestUrl: string;
  highlightedSource: string;
  totalSteps: number;
}

export function createTraceHelpers(context: TraceContext): {
  renderTrace: (javaFile: string) => string;
} {
  const { filePath, contentDir, distDir, applyBasePath, cache } = context;
  const pageDir = path.dirname(filePath);

  function getOrRunTrace(javaFile: string): TraceResult {
    const javaFilePath = path.resolve(pageDir, javaFile);

    if (cache.has(javaFilePath)) {
      return cache.get(javaFilePath)!;
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

      const sourceLines = source.split('\n');
      if (sourceLines[sourceLines.length - 1] === '') {
        sourceLines.pop();
      }
      const ext = path.extname(javaFile).slice(1).toLowerCase();
      const lang = ext === 'java' ? 'java' : 'text';
      const highlightedSource = renderCodeSegment(sourceLines, 1, lang, {
        linkLineNumbers: false,
      });

      const relDir = path
        .relative(contentDir, pageDir)
        .split(path.sep)
        .join(path.posix.sep);
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
      cache.set(javaFilePath, { manifestUrl, highlightedSource, totalSteps });
      return { manifestUrl, highlightedSource, totalSteps };
    } finally {
      fs.rmSync(targetClassDir, { recursive: true, force: true });
    }
  }

  return {
    renderTrace: (javaFile: string): string => {
      const { manifestUrl, highlightedSource, totalSteps } =
        getOrRunTrace(javaFile);
      const svgAttrs = `width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'`;
      const iconFirst = `<svg xmlns='http://www.w3.org/2000/svg' ${svgAttrs}><line x1='2' y1='6' x2='2' y2='18'/><polyline points='10 6 4 12 10 18'/><line x1='4' y1='12' x2='22' y2='12'/></svg>`;
      const iconPrev = `<svg xmlns='http://www.w3.org/2000/svg' ${svgAttrs}><polyline points='10 6 4 12 10 18'/><line x1='4' y1='12' x2='22' y2='12'/></svg>`;
      const iconNext = `<svg xmlns='http://www.w3.org/2000/svg' ${svgAttrs}><line x1='2' y1='12' x2='20' y2='12'/><polyline points='14 6 20 12 14 18'/></svg>`;
      const iconLast = `<svg xmlns='http://www.w3.org/2000/svg' ${svgAttrs}><line x1='2' y1='12' x2='20' y2='12'/><polyline points='14 6 20 12 14 18'/><line x1='22' y1='6' x2='22' y2='18'/></svg>`;
      const controls =
        `<button class="trace-btn trace-first" disabled tabindex="-1" aria-label="First step">${iconFirst}</button>` +
        `<button class="trace-btn trace-prev" disabled tabindex="-1" aria-label="Previous step">${iconPrev}</button>` +
        `<span class="trace-step-counter">1 / ${totalSteps}</span>` +
        `<button class="trace-btn trace-next" aria-label="Next step">${iconNext}</button>` +
        `<button class="trace-btn trace-last" tabindex="-1" aria-label="Last step">${iconLast}</button>`;
      return `<div class="trace-widget" data-trace-manifest="${manifestUrl}"><noscript><p>This interactive trace requires JavaScript.</p></noscript><div class="trace-body"><div class="trace-toolbar"><div class="trace-controls" role="toolbar" aria-label="Trace navigation">${controls}</div></div><div class="trace-content"><div class="trace-left"><div class="trace-source">${highlightedSource}</div></div><div class="trace-right"><div class="trace-diagram"></div><pre class="trace-output"></pre></div></div></div></div>`;
    },
  };
}
