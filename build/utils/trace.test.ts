import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'path';
import { createFsModuleMock } from '../test-helpers';
import type { TraceManifest } from '../types';

const files = new Map<string, string>();

const fsMock = {
  mkdirSync() {},
  writeFileSync(filePath: string, content: string) {
    files.set(path.resolve(filePath), content);
  },
};

mock.module('fs', () => createFsModuleMock(fsMock));

let chunkTraceOutput: typeof import('./trace-core').chunkTraceOutput;
let isTraceSourceFile: typeof import('./trace').isTraceSourceFile;
let parseIgnoreFields: typeof import('./trace-java').parseIgnoreFields;

beforeAll(async () => {
  ({ chunkTraceOutput } = await import('./trace-core'));
  ({ isTraceSourceFile } = await import('./trace'));
  ({ parseIgnoreFields } = await import('./trace-java'));
});

beforeEach(() => {
  files.clear();
});

function readJson<T>(filePath: string): T {
  const content = files.get(path.resolve(filePath));
  if (content === undefined) {
    throw new Error(`Missing file: ${filePath}`);
  }
  return JSON.parse(content) as T;
}

describe('chunkTraceOutput', () => {
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
    const outputDir = '/virtual/_traces/Test';

    const manifest = chunkTraceOutput(
      output,
      outputDir,
      'Test.java',
      'public class Test {}',
      { chunkSize: 3 },
    );

    const chunk0 = readJson<unknown[]>(path.join(outputDir, 'chunk-0.json'));
    const chunk1 = readJson<unknown[]>(path.join(outputDir, 'chunk-1.json'));
    expect(chunk0).toHaveLength(3);
    expect(chunk1).toHaveLength(2);

    expect((chunk0[0] as { svg: string }).svg).toContain('<svg');
    expect(chunk0[0]).toHaveProperty('line');
    expect(chunk0[0]).toHaveProperty('stdout');

    const manifestFile = readJson<TraceManifest>(
      path.join(outputDir, 'manifest.json'),
    );
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
    const outputDir = '/virtual/_traces/Test';

    const manifest = chunkTraceOutput(
      line,
      outputDir,
      'Test.java',
      'class Test {}',
      { chunkSize: 50 },
    );

    expect(manifest.totalSteps).toBe(1);
    const chunk0 = readJson<Array<{ stdout: string }>>(
      path.join(outputDir, 'chunk-0.json'),
    );
    expect(chunk0).toHaveLength(1);
    expect(chunk0[0].stdout).toBe('hello\n');
  });

  test('passes ignoreFields from source to layout', () => {
    const source = `class Node {
    int value;
    Node left;
    Node right;
    Node parent; // @trace-ignore
}
public class Test {
    public static void main(String[] args) {}
}`;
    const fields = parseIgnoreFields(source);
    expect(fields).toEqual({ Node: ['parent'] });
  });

  test('parseIgnoreFields handles multiple classes', () => {
    const source = `class A {
    A prev; // @trace-ignore
    A next;
}
class B {
    B up; // @trace-ignore
    B down; // @trace-ignore
}`;
    const fields = parseIgnoreFields(source);
    expect(fields).toEqual({ A: ['prev'], B: ['up', 'down'] });
  });

  test('parseIgnoreFields handles inner classes with $ separator', () => {
    const source = `public class SearchTreeDemo {
    static class Node {
        String data;
        Node left;
        Node right;
        Node parent; // @trace-ignore
    }

    public static void main(String[] args) {}
}`;
    const fields = parseIgnoreFields(source);
    expect(fields).toEqual({ SearchTreeDemo$Node: ['parent'] });
  });

  test('parseIgnoreFields returns empty for no annotations', () => {
    const source = `class Node { int x; }`;
    expect(parseIgnoreFields(source)).toEqual({});
  });

  test('maps repeated lines to multiple step indices', () => {
    const lines = [];
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
    const outputDir = '/virtual/_traces/Test';

    const manifest = chunkTraceOutput(
      lines.join('\n'),
      outputDir,
      'Test.java',
      '',
      { chunkSize: 50 },
    );

    expect(manifest.lineToSteps[3]).toEqual([0, 1, 2]);
  });

  test('treats only .java and .py files as trace sources', () => {
    expect(isTraceSourceFile('/tmp/TraceDemo.java')).toBe(true);
    expect(isTraceSourceFile('/tmp/trace_demo.py')).toBe(true);
    expect(isTraceSourceFile('/tmp/index.md')).toBe(false);
  });
});
