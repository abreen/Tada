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
let renderTraceWidgetHtml: typeof import('./trace-core').renderTraceWidgetHtml;
let isTraceSourceFile: typeof import('./trace').isTraceSourceFile;
let parseIgnoreFields: typeof import('./trace-java').parseIgnoreFields;

beforeAll(async () => {
  ({ chunkTraceOutput, renderTraceWidgetHtml } = await import('./trace-core'));
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
          output: [],
        }),
      );
    }
    const output = lines.join('\n') + '\n';
    const outputDir = '/virtual/_traces/Test';

    const result = chunkTraceOutput(
      output,
      outputDir,
      '',
      'Test',
      'Test.java',
      'public class Test {}',
      { chunkSize: 3 },
    );
    const manifest = result.manifest;
    const artifactDir = path.join(outputDir, result.artifactId);

    expect(result.artifactId).toMatch(/^sha256-[0-9a-f]{16}$/);
    expect(result.outputPaths).toEqual([
      `_traces/Test/${result.artifactId}/manifest.json`,
      `_traces/Test/${result.artifactId}/chunk-0.json`,
      `_traces/Test/${result.artifactId}/chunk-1.json`,
    ]);

    const chunk0 = readJson<unknown[]>(path.join(artifactDir, 'chunk-0.json'));
    const chunk1 = readJson<unknown[]>(path.join(artifactDir, 'chunk-1.json'));
    expect(chunk0).toHaveLength(3);
    expect(chunk1).toHaveLength(2);

    expect((chunk0[0] as { svg: string }).svg).toContain('<svg');
    expect(chunk0[0]).toHaveProperty('line');
    expect(chunk0[0]).toHaveProperty('output');

    const manifestFile = readJson<TraceManifest>(
      path.join(artifactDir, 'manifest.json'),
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
      output: [{ stream: 'stdout', text: 'hello\n' }],
    });
    const outputDir = '/virtual/_traces/Test';

    const result = chunkTraceOutput(
      line,
      outputDir,
      '',
      'Test',
      'Test.java',
      'class Test {}',
      { chunkSize: 50 },
    );
    const manifest = result.manifest;

    expect(manifest.totalSteps).toBe(1);
    const chunk0 = readJson<
      Array<{ output: Array<{ stream: string; text: string }> }>
    >(path.join(outputDir, result.artifactId, 'chunk-0.json'));
    expect(chunk0).toHaveLength(1);
    expect(chunk0[0].output).toEqual([{ stream: 'stdout', text: 'hello\n' }]);
  });

  test('preserves stderr output events in chunks', () => {
    const line = JSON.stringify({
      line: 1,
      file: 'Test.java',
      stack: [],
      heap: {},
      output: [
        { stream: 'stdout', text: 'before\n' },
        { stream: 'stderr', text: 'boom\n' },
      ],
    });
    const outputDir = '/virtual/_traces/Test';

    const result = chunkTraceOutput(
      line,
      outputDir,
      '',
      'Test',
      'Test.java',
      'class Test {}',
      { chunkSize: 50 },
    );

    const chunk0 = readJson<
      Array<{ output: Array<{ stream: string; text: string }> }>
    >(path.join(outputDir, result.artifactId, 'chunk-0.json'));
    expect(chunk0[0].output).toEqual([
      { stream: 'stdout', text: 'before\n' },
      { stream: 'stderr', text: 'boom\n' },
    ]);
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
          output: [],
        }),
      );
    }
    const outputDir = '/virtual/_traces/Test';

    const result = chunkTraceOutput(
      lines.join('\n'),
      outputDir,
      '',
      'Test',
      'Test.java',
      '',
      { chunkSize: 50 },
    );
    const manifest = result.manifest;

    expect(manifest.lineToSteps[3]).toEqual([0, 1, 2]);
  });

  test('changes artifact id when generated trace content changes', () => {
    const baseStep = {
      line: 1,
      file: 'Test.java',
      stack: [],
      heap: {},
      output: [],
    };
    const first = chunkTraceOutput(
      JSON.stringify(baseStep),
      '/virtual/_traces/Test',
      '',
      'Test',
      'Test.java',
      'class Test {}',
    );
    const second = chunkTraceOutput(
      JSON.stringify({
        ...baseStep,
        output: [{ stream: 'stderr', text: 'changed' }],
      }),
      '/virtual/_traces/Test',
      '',
      'Test',
      'Test.java',
      'class Test {}',
    );

    expect(first.artifactId).not.toBe(second.artifactId);
  });

  test('treats only .java and .py files as trace sources', () => {
    expect(isTraceSourceFile('/tmp/TraceDemo.java')).toBe(true);
    expect(isTraceSourceFile('/tmp/trace_demo.py')).toBe(true);
    expect(isTraceSourceFile('/tmp/index.md')).toBe(false);
  });

  test('rendered widget omits output block until the client has output', () => {
    const html = renderTraceWidgetHtml({
      highlightedSource: '<pre>class Test {}</pre>',
      manifestUrl: '/_traces/Test/manifest.json',
      totalSteps: 1,
    });

    expect(html).toContain('class="trace-content"');
    expect(html).not.toContain('trace-output');
  });

  test('rendered widget disables controls until the client mounts', () => {
    const html = renderTraceWidgetHtml({
      highlightedSource: '<pre>class Test {}</pre>',
      manifestUrl: '/_traces/Test/manifest.json',
      totalSteps: 3,
    });

    expect(html).toContain('class="trace-widget"');
    expect(html).toContain('1/3');
    expect(html).toContain('trace-next" disabled tabindex="-1"');
    expect(html).toContain('trace-last" disabled tabindex="-1"');
  });
});
