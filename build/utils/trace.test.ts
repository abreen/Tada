import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chunkTraceOutput } from './trace';
import type { TraceManifest } from '../types';

describe('chunkTraceOutput', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-trace-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('chunks JSONL output into files and writes manifest', () => {
    const lines = [];
    for (let i = 0; i < 5; i++) {
      lines.push(
        JSON.stringify({
          line: i + 1,
          file: 'Test.java',
          stack: [{ method: 'main', class: 'Test', locals: {} }],
          heap: {},
          stdout: '',
        }),
      );
    }
    const output = lines.join('\n') + '\n';
    const outputDir = path.join(tempDir, '_traces', 'Test');

    const manifest = chunkTraceOutput(
      output,
      outputDir,
      'Test.java',
      'public class Test {}',
      3,
    );

    // Should create 2 chunks (3 + 2)
    const chunk0 = JSON.parse(
      fs.readFileSync(path.join(outputDir, 'chunk-0.json'), 'utf-8'),
    );
    const chunk1 = JSON.parse(
      fs.readFileSync(path.join(outputDir, 'chunk-1.json'), 'utf-8'),
    );
    expect(chunk0).toHaveLength(3);
    expect(chunk1).toHaveLength(2);

    // Manifest (returned value and file on disk should both be correct)
    const manifestFile = JSON.parse(
      fs.readFileSync(path.join(outputDir, 'manifest.json'), 'utf-8'),
    ) as TraceManifest;
    expect(manifest.totalSteps).toBe(5);
    expect(manifest.chunkSize).toBe(3);
    expect(manifestFile.sourceFile).toBe('Test.java');
    expect(manifestFile.source).toBe('public class Test {}');
    expect(manifest.lineToSteps[1]).toEqual([0]);
    expect(manifest.lineToSteps[5]).toEqual([4]);
  });

  test('handles single chunk', () => {
    const line = JSON.stringify({
      line: 1,
      file: 'Test.java',
      stack: [],
      heap: {},
      stdout: 'hello\n',
    });
    const outputDir = path.join(tempDir, '_traces', 'Test');

    const manifest = chunkTraceOutput(
      line,
      outputDir,
      'Test.java',
      'class Test {}',
      50,
    );

    expect(manifest.totalSteps).toBe(1);
    const chunk0 = JSON.parse(
      fs.readFileSync(path.join(outputDir, 'chunk-0.json'), 'utf-8'),
    );
    expect(chunk0).toHaveLength(1);
    expect(chunk0[0].stdout).toBe('hello\n');
  });

  test('maps repeated lines to multiple step indices', () => {
    const lines = [];
    // Simulate a loop: line 3 executes at steps 0, 1, 2
    for (let i = 0; i < 3; i++) {
      lines.push(
        JSON.stringify({
          line: 3,
          file: 'Test.java',
          stack: [],
          heap: {},
          stdout: '',
        }),
      );
    }
    const outputDir = path.join(tempDir, '_traces', 'Test');

    const manifest = chunkTraceOutput(
      lines.join('\n'),
      outputDir,
      'Test.java',
      '',
      50,
    );

    expect(manifest.lineToSteps[3]).toEqual([0, 1, 2]);
  });
});
