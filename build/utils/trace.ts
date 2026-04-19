import fs from 'fs';
import path from 'path';
import { makeLogger } from '../log';
import { B } from '../colors';
import { toPosix } from './paths';
import { checkJavac } from './literate-java';
import {
  buildManifestUrl,
  chunkTraceOutput,
  DEFAULT_CHUNK_SIZE,
  getTraceOutputPaths,
  highlightTraceSource,
  materializeTraceOutputs,
  renderTraceWidgetHtml,
} from './trace-core';
import {
  parseIgnoreFields,
  runJavaTrace,
  validateJavaTraceTarget,
} from './trace-java';
import { resolvePythonCommand } from '../../python/command';
import { runPythonTrace } from './trace-python';
import type {
  RenderDependencyCollector,
  TraceToolAvailability,
} from '../types';

const log = makeLogger(import.meta.url);

export const TRACEABLE_EXTENSIONS = new Set(['.java', '.py']);

export interface TraceContext {
  filePath: string;
  contentDir: string;
  distDir: string;
  applyBasePath: (subPath: string) => string;
  cache: Map<string, TraceResult>;
  toolAvailability?: TraceToolAvailability;
  dependencyCollector?: RenderDependencyCollector;
  cachedTraceSourceDir?: string;
}

export interface TraceResult {
  manifestUrl: string;
  highlightedSource: string;
  totalSteps: number;
  mtime: number;
}

export function isTraceSourceFile(filePath: string): boolean {
  return TRACEABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function checkTraceToolAvailability(): TraceToolAvailability {
  return { java: checkJavac(), python: resolvePythonCommand() !== null };
}

function traceLanguageForFile(filePath: string): 'java' | 'python' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.java') {
    return 'java';
  }
  if (ext === '.py') {
    return 'python';
  }
  throw new Error(`Unsupported trace source: ${filePath}`);
}

function availabilityForFile(
  filePath: string,
  toolAvailability?: TraceToolAvailability,
): boolean | undefined {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.java') {
    return toolAvailability?.java;
  }
  if (ext === '.py') {
    return toolAvailability?.python;
  }
  return undefined;
}

function disabledTraceMessage(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.java') {
    return `javac was not found; trace for ${B`${fileName}`} will be disabled`;
  }
  return `Python was not found; trace for ${B`${fileName}`} will be disabled`;
}

function sourceFileNameForTrace(fileName: string): string {
  const { name, ext } = path.parse(fileName);
  return `${name}${ext}`;
}

function runTraceForFile(
  filePath: string,
  source: string,
): { output: string; ignoreFields?: Record<string, string[]> } {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.java') {
    validateJavaTraceTarget(filePath, source);
    return {
      output: runJavaTrace(filePath, path.parse(filePath).name),
      ignoreFields: parseIgnoreFields(source),
    };
  }
  if (ext === '.py') {
    return { output: runPythonTrace(filePath) };
  }
  throw new Error(`Unsupported trace source: ${filePath}`);
}

export function createTraceHelpers(context: TraceContext): {
  renderTrace: (sourceFile: string) => string;
} {
  const {
    filePath,
    contentDir,
    distDir,
    applyBasePath,
    cache,
    toolAvailability,
    dependencyCollector,
    cachedTraceSourceDir,
  } = context;
  const pageDir = path.dirname(filePath);

  function getOrRunTrace(sourceFile: string): TraceResult {
    const sourceFilePath = path.resolve(pageDir, sourceFile);
    dependencyCollector?.traceFiles?.add(sourceFilePath);
    const traceName = path.parse(sourceFile).name;
    const relDir = toPosix(path.relative(contentDir, pageDir));

    const cached = cache.get(sourceFilePath);
    if (cached) {
      const mtime = fs.statSync(sourceFilePath, {
        throwIfNoEntry: false,
      })?.mtimeMs;
      if (mtime !== undefined && mtime === cached.mtime) {
        const outputPaths = getTraceOutputPaths(
          relDir,
          traceName,
          cached.totalSteps,
        );
        if (
          materializeTraceOutputs({
            outputPaths,
            targetDistDir: distDir,
            sourceDistDir: cachedTraceSourceDir || distDir,
          })
        ) {
          for (const outputPath of outputPaths) {
            dependencyCollector?.generatedOutputPaths?.add(outputPath);
          }
          return {
            ...cached,
            manifestUrl: buildManifestUrl({ relDir, traceName, applyBasePath }),
          };
        }
      }
    }

    if (!fs.existsSync(sourceFilePath)) {
      throw new Error(`Trace target not found: ${sourceFilePath}`);
    }

    const source = fs.readFileSync(sourceFilePath, 'utf-8');

    log.info`Tracing ${B`${sourceFile}`}`;

    const { output, ignoreFields } = runTraceForFile(sourceFilePath, source);
    const highlightedSource = highlightTraceSource(
      source,
      traceLanguageForFile(sourceFilePath),
    );
    const traceOutputDir = path.join(distDir, relDir, '_traces', traceName);

    const manifest = chunkTraceOutput(
      output,
      traceOutputDir,
      sourceFileNameForTrace(sourceFile),
      source,
      { chunkSize: DEFAULT_CHUNK_SIZE, ignoreFields },
    );
    for (const outputPath of getTraceOutputPaths(
      relDir,
      traceName,
      manifest.totalSteps,
    )) {
      dependencyCollector?.generatedOutputPaths?.add(outputPath);
    }

    const manifestUrl = buildManifestUrl({ relDir, traceName, applyBasePath });

    const totalSteps = manifest.totalSteps;
    const mtime = fs.statSync(sourceFilePath).mtimeMs;
    cache.set(sourceFilePath, {
      manifestUrl,
      highlightedSource,
      totalSteps,
      mtime,
    });
    return { manifestUrl, highlightedSource, totalSteps, mtime };
  }

  return {
    renderTrace: (sourceFile: string): string => {
      const sourceFilePath = path.resolve(pageDir, sourceFile);
      const available = availabilityForFile(sourceFilePath, toolAvailability);
      if (available === false) {
        log.warn`${disabledTraceMessage(sourceFile)}`;
        if (!fs.existsSync(sourceFilePath)) {
          throw new Error(`Trace target not found: ${sourceFilePath}`);
        }
        const source = fs.readFileSync(sourceFilePath, 'utf-8');
        return renderTraceWidgetHtml({
          highlightedSource: highlightTraceSource(
            source,
            traceLanguageForFile(sourceFilePath),
          ),
        });
      }

      const { manifestUrl, highlightedSource, totalSteps } =
        getOrRunTrace(sourceFile);
      return renderTraceWidgetHtml({
        highlightedSource,
        manifestUrl,
        totalSteps,
      });
    },
  };
}
