import fs from 'fs';
import os from 'os';
import path from 'path';
import { makeLogger } from '../log';
import { B } from '../colors';
import { toPosix } from './paths';
import { checkJavac } from './literate-java';
import {
  buildManifestUrl,
  buildTraceOutputPath,
  chunkTraceOutput,
  DEFAULT_CHUNK_SIZE,
  highlightTraceSource,
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
import type { TraceCache, TraceCacheEntry } from '../build-types';

const log = makeLogger(import.meta.url);

export const TRACEABLE_EXTENSIONS = new Set(['.java', '.py']);

export interface TraceContext {
  filePath: string;
  contentDir: string;
  applyBasePath: (subPath: string) => string;
  cache: TraceCache;
  toolAvailability?: TraceToolAvailability;
  dependencyCollector?: RenderDependencyCollector;
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

interface TraceSourceFile {
  requestedPath: string;
  absolutePath: string;
  file: string;
  source: string;
}

function runTraceForFile(
  primaryFilePath: string,
  tracedFilePaths: string[],
  sources: { file: string; source: string }[],
): { output: string; ignoreFields?: Record<string, string[]> } {
  const ext = path.extname(primaryFilePath).toLowerCase();
  if (ext === '.java') {
    validateJavaTraceTarget(primaryFilePath, sources[0].source);
    const ignoreFields: Record<string, string[]> = {};
    for (const source of sources) {
      const sourceFields = parseIgnoreFields(source.source);
      for (const [className, fieldNames] of Object.entries(sourceFields)) {
        ignoreFields[className] = [
          ...(ignoreFields[className] ?? []),
          ...fieldNames,
        ];
      }
    }
    return {
      output: runJavaTrace(tracedFilePaths, path.parse(primaryFilePath).name),
      ignoreFields,
    };
  }
  if (ext === '.py') {
    return { output: runPythonTrace(primaryFilePath, tracedFilePaths) };
  }
  throw new Error(`Unsupported trace source: ${primaryFilePath}`);
}

export function createTraceHelpers(context: TraceContext): {
  renderTrace: (sourceFile: string, companionFiles?: string[]) => string;
} {
  const {
    filePath,
    contentDir,
    applyBasePath,
    cache,
    toolAvailability,
    dependencyCollector,
  } = context;
  const pageDir = path.dirname(filePath);

  function resolveTraceSources(
    sourceFile: string,
    companionFiles?: string[],
  ): TraceSourceFile[] {
    if (companionFiles !== undefined && !Array.isArray(companionFiles)) {
      throw new Error('renderTrace companionFiles must be an array');
    }

    const requestedPaths = [sourceFile, ...(companionFiles ?? [])];
    const sources = requestedPaths.map(requestedPath => {
      const absolutePath = path.resolve(pageDir, requestedPath);
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Trace target not found: ${absolutePath}`);
      }
      return {
        requestedPath,
        absolutePath,
        file: path.basename(requestedPath),
        source: fs.readFileSync(absolutePath, 'utf-8'),
      };
    });

    const primaryExt = path.extname(sources[0].absolutePath).toLowerCase();
    for (const source of sources) {
      const ext = path.extname(source.absolutePath).toLowerCase();
      if (ext !== primaryExt) {
        throw new Error(
          `Trace companion must use the same extension as ${sourceFile}: ${source.requestedPath}`,
        );
      }
      traceLanguageForFile(source.absolutePath);
    }

    const seenBasenames = new Set<string>();
    for (const source of sources) {
      if (seenBasenames.has(source.file)) {
        throw new Error(
          `Trace files must have unique basenames in a flat workspace: ${source.file}`,
        );
      }
      seenBasenames.add(source.file);
    }

    return sources;
  }

  function cacheKeyForSources(sources: TraceSourceFile[]): string {
    return JSON.stringify(sources.map(source => source.absolutePath));
  }

  function getSourceMtims(sources: TraceSourceFile[]): Record<string, number> {
    return Object.fromEntries(
      sources.map(source => [
        source.absolutePath,
        fs.statSync(source.absolutePath).mtimeMs,
      ]),
    );
  }

  function cacheIsFresh(
    sources: TraceSourceFile[],
    cached: TraceCacheEntry,
  ): boolean {
    return sources.every(source => {
      const mtime = fs.statSync(source.absolutePath, {
        throwIfNoEntry: false,
      })?.mtimeMs;
      return (
        mtime !== undefined && cached.sourceMtims[source.absolutePath] === mtime
      );
    });
  }

  function createTraceWorkspace(sources: TraceSourceFile[]): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-trace-work-'));
    try {
      for (const source of sources) {
        fs.copyFileSync(source.absolutePath, path.join(tempDir, source.file));
      }
      return tempDir;
    } catch (err) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw err;
    }
  }

  function getOrRunTrace(
    sourceFile: string,
    sources: TraceSourceFile[],
    traceName: string,
  ): TraceCacheEntry {
    const cacheKey = cacheKeyForSources(sources);
    const cached = cache.get(cacheKey);
    if (cached && cacheIsFresh(sources, cached)) {
      return cached;
    }

    log.info`Tracing ${B`${sourceFile}`}`;

    const workspaceDir = createTraceWorkspace(sources);
    let output: string;
    let ignoreFields: Record<string, string[]> | undefined;
    try {
      const workspacePaths = sources.map(source =>
        path.join(workspaceDir, source.file),
      );
      ({ output, ignoreFields } = runTraceForFile(
        workspacePaths[0],
        workspacePaths,
        sources.map(source => ({ file: source.file, source: source.source })),
      ));
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }

    const language = traceLanguageForFile(sources[0].absolutePath);
    const { manifest, artifactId, files } = chunkTraceOutput(
      output,
      traceName,
      sources[0].file,
      sources.map(source => ({ file: source.file, source: source.source })),
      { chunkSize: DEFAULT_CHUNK_SIZE, ignoreFields },
    );
    const entry: TraceCacheEntry = {
      artifactId,
      files,
      highlightedSources: sources.map(source => ({
        file: source.file,
        highlightedSource: highlightTraceSource(source.source, language),
      })),
      totalSteps: manifest.totalSteps,
      sourceMtims: getSourceMtims(sources),
    };
    cache.set(cacheKey, entry);
    return entry;
  }

  return {
    renderTrace: (sourceFile: string, companionFiles?: string[]): string => {
      const sources = resolveTraceSources(sourceFile, companionFiles);
      for (const source of sources) {
        dependencyCollector?.traceFiles?.add(source.absolutePath);
      }
      const sourceFilePath = sources[0].absolutePath;
      const available = availabilityForFile(sourceFilePath, toolAvailability);
      if (available === false) {
        log.warn`${disabledTraceMessage(sourceFile)}`;
        const language = traceLanguageForFile(sourceFilePath);
        return renderTraceWidgetHtml({
          highlightedSources: sources.map(source => ({
            file: source.file,
            highlightedSource: highlightTraceSource(source.source, language),
          })),
        });
      }

      const traceName = path.parse(sourceFile).name;
      const relDir = toPosix(path.relative(contentDir, pageDir));
      const trace = getOrRunTrace(sourceFile, sources, traceName);
      for (const file of trace.files) {
        dependencyCollector?.generatedOutputs?.set(
          buildTraceOutputPath(relDir, traceName, trace.artifactId, file.name),
          file.content,
        );
      }
      return renderTraceWidgetHtml({
        highlightedSources: trace.highlightedSources,
        manifestUrl: buildManifestUrl({
          relDir,
          traceName,
          artifactId: trace.artifactId,
          applyBasePath,
        }),
        totalSteps: trace.totalSteps,
      });
    },
  };
}
