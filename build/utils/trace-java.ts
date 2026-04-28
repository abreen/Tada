import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { makeLogger } from '../log';
import { hasMainMethod, runJavac } from './literate-java';

const log = makeLogger(import.meta.url);

/**
 * Parse // @trace-ignore comments from Java source code.
 * Returns a map of className -> fieldName[] for fields that should be
 * excluded from layout consideration.
 */
export function parseIgnoreFields(source: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const lines = source.split('\n');
  const classStack: { name: string; depth: number }[] = [];
  let braceDepth = 0;

  for (const line of lines) {
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

function compileTargetFiles(javaFilePaths: string[]): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-trace-target-'));

  runJavac(
    [
      '-g',
      '-d',
      tempDir,
      '-sourcepath',
      path.dirname(javaFilePaths[0]),
      ...javaFilePaths,
    ],
    { tempDir, label: `Compilation failed for ${javaFilePaths[0]}` },
  );

  return tempDir;
}

export function validateJavaTraceTarget(
  javaFilePath: string,
  source: string,
): void {
  if (!hasMainMethod(source)) {
    throw new Error(
      `${javaFilePath}: no main() method found (required for tracing)`,
    );
  }
}

export function runJavaTrace(
  javaFilePaths: string[],
  className: string,
): string {
  const targetClassDir = compileTargetFiles(javaFilePaths);

  try {
    const tracerDir = ensureTracerCompiled();
    return execFileSync(
      'java',
      ['-cp', tracerDir, 'TraceRunner', className, targetClassDir],
      { timeout: 60000, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 },
    );
  } finally {
    fs.rmSync(targetClassDir, { recursive: true, force: true });
  }
}
