import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getValidInternalTargets } from './content-files';

describe('getValidInternalTargets', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-targets-test-'));
    fs.mkdirSync(path.join(tempDir, 'content'));
    fs.mkdirSync(path.join(tempDir, 'public'), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('includes public files as valid targets', () => {
    fs.writeFileSync(path.join(tempDir, 'public', 'test.txt'), '');

    const contentDir = path.join(tempDir, 'content');
    const targets = getValidInternalTargets(contentDir, [], [], false);

    expect(targets.has('/test.txt')).toBe(true);
  });

  test('includes public index.html by exact path only', () => {
    const coverageDir = path.join(tempDir, 'public', 'coverage');
    fs.mkdirSync(coverageDir, { recursive: true });
    fs.writeFileSync(path.join(coverageDir, 'index.html'), '');

    const contentDir = path.join(tempDir, 'content');
    const targets = getValidInternalTargets(contentDir, [], [], false);

    expect(targets.has('/coverage/index.html')).toBe(true);
    expect(targets.has('/coverage/')).toBe(false);
    expect(targets.has('/coverage')).toBe(false);
  });

  test('includes nested public files', () => {
    const subDir = path.join(tempDir, 'public', 'assets');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'style.css'), '');

    const contentDir = path.join(tempDir, 'content');
    const targets = getValidInternalTargets(contentDir, [], [], false);

    expect(targets.has('/assets/style.css')).toBe(true);
  });
});
