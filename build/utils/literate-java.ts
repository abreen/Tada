import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createMarkdown } from './markdown';
import { makeLogger } from '../log';
import { parseFrontMatterAndContent } from './front-matter';
import type {
  SiteVariables,
  LiterateJavaParseResult,
  LiterateCodeBlock,
  LiterateRunnerEntry,
} from '../types';

const log = makeLogger(__filename);

const MAIN_PATTERN = /\bvoid\s+main\s*\(/m;

export function parseLiterateJava(
  rawContent: string,
  siteVariables: SiteVariables,
): LiterateJavaParseResult {
  const { pageVariables, content } = parseFrontMatterAndContent(
    rawContent,
    '.md',
  );

  const md = createMarkdown(siteVariables, {
    validatorOptions: { enabled: false },
  });
  const tokens = md.parse(content, {});

  const codeBlocks: LiterateCodeBlock[] = [];
  let javaLine = 1;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'fence' && token.type !== 'hidden_fence') {
      continue;
    }

    const code = token.content;
    const codeLines = code.endsWith('\n')
      ? code.slice(0, -1).split('\n')
      : code.split('\n');
    const javaStartLine = javaLine;
    const javaEndLine = javaLine + codeLines.length - 1;
    javaLine = javaEndLine + 1;

    const hidden = token.type === 'hidden_fence';
    codeBlocks.push({ javaStartLine, javaEndLine, content: code, hidden });
  }

  const javaSource = codeBlocks.map(b => b.content).join('');
  const visibleBlockIndices = codeBlocks
    .map((b, i) => (b.hidden ? null : i))
    .filter((i): i is number => i !== null);

  const hiddenCount = codeBlocks.length - visibleBlockIndices.length;
  log.debug`Parsed ${codeBlocks.length} code block(s) (${hiddenCount} hidden), ${javaSource.split('\n').length} Java line(s)`;

  return {
    pageVariables,
    content,
    javaSource,
    codeBlocks,
    visibleBlockIndices,
  };
}

export function hasMainMethod(javaSource: string): boolean {
  return MAIN_PATTERN.test(javaSource);
}

export function deriveClassName(filePath: string): string {
  const name = path.parse(filePath).name;
  return path.parse(name).name;
}

export function compileJavaSource(
  javaSource: string,
  className: string,
): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-literate-'));
  const javaFile = path.join(tempDir, `${className}.java`);
  fs.writeFileSync(javaFile, javaSource);

  log.debug`Compiling ${className}.java (${javaSource.split('\n').length} lines) in ${tempDir}`;

  try {
    execFileSync('javac', [`${className}.java`], {
      cwd: tempDir,
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: unknown) {
    const execErr = err as { stderr?: Buffer; message: string };
    const stderr = execErr.stderr ? execErr.stderr.toString() : execErr.message;
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Compilation failed for ${className}.java:\n${stderr}`, {
      cause: err,
    });
  }

  return tempDir;
}

function ensureRunnerCompiled(runnerDir: string): void {
  const sourceFile = path.join(runnerDir, 'LiterateRunner.java');
  const classFile = path.join(runnerDir, 'LiterateRunner.class');

  if (
    fs.existsSync(classFile) &&
    fs.statSync(classFile).mtimeMs >= fs.statSync(sourceFile).mtimeMs
  ) {
    log.debug`LiterateRunner.class is up to date`;
    return;
  }

  log.debug`Compiling LiterateRunner.java`;

  try {
    execFileSync('javac', ['LiterateRunner.java'], {
      cwd: runnerDir,
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: unknown) {
    const execErr = err as { stderr?: Buffer; message: string };
    const stderr = execErr.stderr ? execErr.stderr.toString() : execErr.message;
    throw new Error(`Failed to compile LiterateRunner.java:\n${stderr}`, {
      cause: err,
    });
  }
}

export function executeLiterateJava(
  className: string,
  classPath: string,
  codeBlocks: LiterateCodeBlock[],
): LiterateRunnerEntry[] {
  const runnerDir = path.join(__dirname, 'jdi-runner');
  ensureRunnerCompiled(runnerDir);

  const blockRanges = codeBlocks.map(b => [b.javaStartLine, b.javaEndLine]);
  const rangesJson = JSON.stringify(blockRanges);

  log.debug`Executing literate Java: ${className}`;

  log.debug`Running LiterateRunner with ${blockRanges.length} block range(s)`;

  try {
    const result = execFileSync(
      'java',
      ['-cp', runnerDir, 'LiterateRunner', className, classPath, rangesJson],
      { timeout: 30000, encoding: 'utf-8' },
    );
    const entries: LiterateRunnerEntry[] = JSON.parse(result);
    log.debug`LiterateRunner returned ${entries.length} output entries`;
    return entries;
  } catch (err: unknown) {
    const execErr = err as {
      stderr?: Buffer | string;
      stdout?: Buffer | string;
      message: string;
    };
    const stderr = execErr.stderr ? execErr.stderr.toString() : '';
    const stdout = execErr.stdout ? execErr.stdout.toString() : '';
    throw new Error(
      `Execution failed for ${className}:\n${stderr || stdout || execErr.message}`,
      { cause: err },
    );
  }
}

export function checkJavac(): boolean {
  try {
    execFileSync('javac', ['-version'], { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}
