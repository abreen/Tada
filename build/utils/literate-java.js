const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { createMarkdown } = require('./markdown');
const { makeLogger } = require('../log');
const { parseFrontMatterAndContent } = require('./front-matter');

const log = makeLogger(__filename);

const MAIN_PATTERN = /\bvoid\s+main\s*\(/m;

function parseLiterateJava(rawContent, siteVariables) {
  const { pageVariables, content } = parseFrontMatterAndContent(
    rawContent,
    '.md',
  );

  const md = createMarkdown(siteVariables, {
    validatorOptions: { enabled: false },
  });
  const tokens = md.parse(content, {});

  const codeBlocks = [];
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
    .filter(i => i !== null);

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

function hasMainMethod(javaSource) {
  return MAIN_PATTERN.test(javaSource);
}

function deriveClassName(filePath) {
  const name = path.parse(filePath).name;
  return path.parse(name).name;
}

function compileJavaSource(javaSource, className) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-literate-'));
  const javaFile = path.join(tempDir, `${className}.java`);
  fs.writeFileSync(javaFile, javaSource);

  log.debug`Compiling ${className}.java (${javaSource.split('\n').length} lines) in ${tempDir}`;

  try {
    execSync(`javac "${className}.java"`, {
      cwd: tempDir,
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`Compilation failed for ${className}.java:\n${stderr}`);
  }

  return tempDir;
}

function ensureRunnerCompiled(runnerDir) {
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
    execSync('javac LiterateRunner.java', {
      cwd: runnerDir,
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`Failed to compile LiterateRunner.java:\n${stderr}`);
  }
}

function executeLiterateJava(className, classPath, codeBlocks) {
  const runnerDir = path.join(__dirname, 'jdi-runner');
  ensureRunnerCompiled(runnerDir);

  const blockRanges = codeBlocks.map(b => [b.javaStartLine, b.javaEndLine]);
  const rangesJson = JSON.stringify(blockRanges);

  log.debug`Executing literate Java: ${className}`;

  log.debug`Running LiterateRunner with ${blockRanges.length} block range(s)`;

  try {
    const result = execSync(
      `java -cp "${runnerDir}" LiterateRunner "${className}" "${classPath}" '${rangesJson}'`,
      { timeout: 30000, encoding: 'utf-8' },
    );
    const entries = JSON.parse(result);
    log.debug`LiterateRunner returned ${entries.length} output entries`;
    return entries;
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    const stdout = err.stdout ? err.stdout.toString() : '';
    throw new Error(
      `Execution failed for ${className}:\n${stderr || stdout || err.message}`,
    );
  }
}

function checkJavac() {
  try {
    execSync('javac -version', { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  parseLiterateJava,
  hasMainMethod,
  deriveClassName,
  compileJavaSource,
  executeLiterateJava,
  checkJavac,
};
