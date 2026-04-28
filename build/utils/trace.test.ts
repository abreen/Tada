import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'path';
import { createFsModuleMock } from '../test-helpers';
import type { TraceManifest } from '../types';

const files = new Map<string, string>();
const fileMtims = new Map<string, number>();

const fsMock = {
  mkdirSync() {},
  writeFileSync(filePath: string, content: string) {
    files.set(path.resolve(filePath), content);
  },
  existsSync(filePath: string) {
    return files.has(path.resolve(filePath));
  },
  readFileSync(filePath: string) {
    const content = files.get(path.resolve(filePath));
    if (content === undefined) {
      throw new Error(`Missing file: ${filePath}`);
    }
    return content;
  },
  statSync(filePath: string, options?: { throwIfNoEntry?: boolean }) {
    const resolved = path.resolve(filePath);
    if (!files.has(resolved)) {
      if (options?.throwIfNoEntry === false) {
        return undefined;
      }
      throw new Error(`Missing file: ${filePath}`);
    }
    return { mtimeMs: fileMtims.get(resolved) ?? 1 };
  },
  mkdtempSync(prefix: string) {
    return `${prefix}mock`;
  },
  copyFileSync(sourcePath: string, targetPath: string) {
    const content = files.get(path.resolve(sourcePath));
    if (content === undefined) {
      throw new Error(`Missing file: ${sourcePath}`);
    }
    files.set(path.resolve(targetPath), content);
  },
  rmSync() {},
  linkSync() {},
};

mock.module('fs', () => createFsModuleMock(fsMock));

let chunkTraceOutput: typeof import('./trace-core').chunkTraceOutput;
let bridgeConstructorReturnValues: typeof import('./trace-core').bridgeConstructorReturnValues;
let renderTraceWidgetHtml: typeof import('./trace-core').renderTraceWidgetHtml;
let createTraceHelpers: typeof import('./trace').createTraceHelpers;
let isTraceSourceFile: typeof import('./trace').isTraceSourceFile;
let parseIgnoreFields: typeof import('./trace-java').parseIgnoreFields;
let hasExplicitTopLevelTypeDeclaration: typeof import('./trace-java').hasExplicitTopLevelTypeDeclaration;

beforeAll(async () => {
  ({ chunkTraceOutput, bridgeConstructorReturnValues, renderTraceWidgetHtml } =
    await import('./trace-core'));
  ({ createTraceHelpers, isTraceSourceFile } = await import('./trace'));
  ({ parseIgnoreFields, hasExplicitTopLevelTypeDeclaration } =
    await import('./trace-java'));
});

beforeEach(() => {
  files.clear();
  fileMtims.clear();
});

function writeVirtualFile(filePath: string, content: string, mtime = 1): void {
  const resolved = path.resolve(filePath);
  files.set(resolved, content);
  fileMtims.set(resolved, mtime);
}

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
      [{ file: 'Test.java', source: 'public class Test {}' }],
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
    expect(chunk0[0]).toHaveProperty('file', 'Test.java');
    expect(chunk0[0]).toHaveProperty('line');
    expect(chunk0[0]).toHaveProperty('output');

    const manifestFile = readJson<TraceManifest>(
      path.join(artifactDir, 'manifest.json'),
    );
    expect(manifest.totalSteps).toBe(5);
    expect(manifest.chunkSize).toBe(3);
    expect(manifestFile.primaryFile).toBe('Test.java');
    expect(manifestFile.sources[0].source).toBe('public class Test {}');
    expect(manifest.sources[0].lineToSteps[1]).toEqual([0]);
    expect(manifest.sources[0].lineToSteps[5]).toEqual([4]);
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
      [{ file: 'Test.java', source: 'class Test {}' }],
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

  test('namespaces generated trace SVG marker ids', () => {
    const output = `${JSON.stringify({
      line: 1,
      file: 'First.java',
      stack: [
        {
          method: 'main',
          class: 'First',
          locals: { node: { type: 'ref', id: '1' } },
        },
      ],
      heap: {
        '1': { type: 'Node', fields: { value: { type: 'int', value: 1 } } },
      },
      output: [],
    })}\n`;

    const first = chunkTraceOutput(
      output,
      '/virtual/_traces/First',
      '',
      'First',
      'First.java',
      [{ file: 'First.java', source: 'class First {}' }],
    );
    const second = chunkTraceOutput(
      output.replaceAll('First', 'Second'),
      '/virtual/_traces/Second',
      '',
      'Second',
      'Second.java',
      [{ file: 'Second.java', source: 'class Second {}' }],
    );

    const firstChunk = readJson<Array<{ svg: string }>>(
      path.join('/virtual/_traces/First', first.artifactId, 'chunk-0.json'),
    );
    const secondChunk = readJson<Array<{ svg: string }>>(
      path.join('/virtual/_traces/Second', second.artifactId, 'chunk-0.json'),
    );
    const firstArrowhead = firstChunk[0].svg.match(
      /id="([^"]+-arrowhead)"/,
    )?.[1];
    const secondArrowhead = secondChunk[0].svg.match(
      /id="([^"]+-arrowhead)"/,
    )?.[1];

    expect(firstArrowhead).toBeDefined();
    expect(secondArrowhead).toBeDefined();
    expect(firstArrowhead).not.toBe(secondArrowhead);
    expect(firstChunk[0].svg).toContain(`marker-end="url(#${firstArrowhead})"`);
    expect(secondChunk[0].svg).toContain(
      `marker-end="url(#${secondArrowhead})"`,
    );
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
      [{ file: 'Test.java', source: 'class Test {}' }],
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

  test('detects explicit top-level Java type declarations', () => {
    expect(
      hasExplicitTopLevelTypeDeclaration(
        `import java.util.List;

public class Demo {
    public static void main(String[] args) {}
}`,
      ),
    ).toBe(true);
  });

  test('treats implicit Java class source as unnamed', () => {
    expect(
      hasExplicitTopLevelTypeDeclaration(
        `void main() {
    class Local {}
    System.out.println("class is just text");
}`,
      ),
    ).toBe(false);
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
      [{ file: 'Test.java', source: '' }],
      { chunkSize: 50 },
    );
    const manifest = result.manifest;

    expect(manifest.sources[0].lineToSteps[3]).toEqual([0, 1, 2]);
  });

  test('writes per-file source entries and chunk file owners', () => {
    const output = [
      JSON.stringify({
        line: 2,
        file: 'Main.java',
        stack: [],
        heap: {},
        output: [],
      }),
      JSON.stringify({
        line: 4,
        file: 'Helper.java',
        stack: [],
        heap: {},
        output: [],
      }),
    ].join('\n');
    const outputDir = '/virtual/_traces/Main';

    const result = chunkTraceOutput(
      output,
      outputDir,
      '',
      'Main',
      'Main.java',
      [
        { file: 'Main.java', source: 'class Main {}' },
        { file: 'Helper.java', source: 'class Helper {}' },
      ],
      { chunkSize: 50 },
    );

    expect(result.manifest.primaryFile).toBe('Main.java');
    expect(result.manifest.sources).toEqual([
      { file: 'Main.java', source: 'class Main {}', lineToSteps: { 2: [0] } },
      {
        file: 'Helper.java',
        source: 'class Helper {}',
        lineToSteps: { 4: [1] },
      },
    ]);
    const chunk0 = readJson<Array<{ file: string; line: number }>>(
      path.join(outputDir, result.artifactId, 'chunk-0.json'),
    );
    expect(chunk0.map(entry => [entry.file, entry.line])).toEqual([
      ['Main.java', 2],
      ['Helper.java', 4],
    ]);
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
      [{ file: 'Test.java', source: 'class Test {}' }],
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
      [{ file: 'Test.java', source: 'class Test {}' }],
    );

    expect(first.artifactId).not.toBe(second.artifactId);
  });

  test('bridges constructed objects for the caller step after constructor return', () => {
    const steps = bridgeConstructorReturnValues([
      {
        line: 4,
        file: 'Bag.java',
        stack: [
          {
            method: '<init>',
            class: 'ArrayBag',
            locals: { this: { type: 'ref', id: 'obj_1' } },
          },
          { method: 'main', class: 'Demo', locals: {} },
        ],
        heap: {
          obj_1: {
            type: 'ArrayBag',
            fields: { items: { type: 'ref', id: 'obj_2' } },
          },
          obj_2: { type: 'Object[]', elements: [] },
        },
        output: [],
      },
      {
        line: 4,
        file: 'Demo.java',
        stack: [{ method: 'main', class: 'Demo', locals: {} }],
        heap: {},
        output: [],
      },
    ]);

    expect(steps[1].transientHeapRoots).toEqual(['obj_1']);
    expect(steps[1].heap).toHaveProperty('obj_1');
    expect(steps[1].heap).toHaveProperty('obj_2');
  });

  test('does not bridge ordinary method return values', () => {
    const steps = bridgeConstructorReturnValues([
      {
        line: 25,
        file: 'Bag.java',
        stack: [
          {
            method: 'toString',
            class: 'ArrayBag',
            locals: { result: { type: 'ref', id: 'obj_1' } },
          },
          { method: 'main', class: 'Demo', locals: {} },
        ],
        heap: { obj_1: { type: 'String', value: '{123}' } },
        output: [],
      },
      {
        line: 16,
        file: 'Demo.java',
        stack: [{ method: 'main', class: 'Demo', locals: {} }],
        heap: {},
        output: [],
      },
    ]);

    expect(steps[1].transientHeapRoots).toBeUndefined();
    expect(steps[1].heap).not.toHaveProperty('obj_1');
  });

  test('lays out replacement strings in the same slot after filtering stale raw heap objects', () => {
    const output = [
      JSON.stringify({
        line: 1,
        file: 'Test.java',
        stack: [
          {
            method: 'toString',
            class: 'Test',
            locals: { str: { type: 'ref', id: 'old' } },
          },
        ],
        heap: { old: { type: 'String', value: '{' } },
        output: [],
      }),
      JSON.stringify({
        line: 2,
        file: 'Test.java',
        stack: [
          {
            method: 'toString',
            class: 'Test',
            locals: { str: { type: 'ref', id: 'new' } },
          },
        ],
        heap: {
          old: { type: 'String', value: '{' },
          new: { type: 'String', value: '{item' },
        },
        output: [],
      }),
    ].join('\n');

    const outputDir = '/virtual/_traces/Test';
    const result = chunkTraceOutput(
      output,
      outputDir,
      '',
      'Test',
      'Test.java',
      [{ file: 'Test.java', source: 'class Test {}' }],
      { chunkSize: 50 },
    );
    const chunk0 = readJson<Array<{ svg: string }>>(
      path.join(outputDir, result.artifactId, 'chunk-0.json'),
    );

    const oldY = chunk0[0].svg.match(
      /data-id="old" transform="translate\([^,]+,([^)]+)\)"/,
    )?.[1];
    const newY = chunk0[1].svg.match(
      /data-id="new" transform="translate\([^,]+,([^)]+)\)"/,
    )?.[1];

    expect(oldY).toBeDefined();
    expect(newY).toBe(oldY);
    expect(chunk0[1].svg).not.toContain('data-id="old"');
  });

  test('treats only .java and .py files as trace sources', () => {
    expect(isTraceSourceFile('/tmp/TraceDemo.java')).toBe(true);
    expect(isTraceSourceFile('/tmp/trace_demo.py')).toBe(true);
    expect(isTraceSourceFile('/tmp/index.md')).toBe(false);
  });

  test('renderTrace requires companionFiles to be an array', () => {
    writeVirtualFile('/site/content/labs/Main.java', 'class Main {}');
    const helpers = createTraceHelpers({
      filePath: '/site/content/labs/index.md',
      contentDir: '/site/content',
      distDir: '/site/dist',
      applyBasePath: value => value,
      cache: new Map(),
      toolAvailability: { java: false, python: false },
    });

    expect(() =>
      helpers.renderTrace('Main.java', 'Helper.java' as unknown as string[]),
    ).toThrow('companionFiles must be an array');
  });

  test('renderTrace rejects companion files with different extensions', () => {
    writeVirtualFile('/site/content/labs/Main.java', 'class Main {}');
    writeVirtualFile('/site/content/labs/helper.py', 'value = 1');
    const helpers = createTraceHelpers({
      filePath: '/site/content/labs/index.md',
      contentDir: '/site/content',
      distDir: '/site/dist',
      applyBasePath: value => value,
      cache: new Map(),
      toolAvailability: { java: false, python: false },
    });

    expect(() => helpers.renderTrace('Main.java', ['helper.py'])).toThrow(
      'same extension',
    );
  });

  test('renderTrace rejects duplicate companion basenames', () => {
    writeVirtualFile('/site/content/labs/Main.java', 'class Main {}');
    writeVirtualFile('/site/content/shared/Main.java', 'class Main {}');
    const helpers = createTraceHelpers({
      filePath: '/site/content/labs/index.md',
      contentDir: '/site/content',
      distDir: '/site/dist',
      applyBasePath: value => value,
      cache: new Map(),
      toolAvailability: { java: false, python: false },
    });

    expect(() =>
      helpers.renderTrace('Main.java', ['../shared/Main.java']),
    ).toThrow('unique basenames');
  });

  test('renderTrace collects primary and companion dependencies', () => {
    const primary = path.resolve('/site/content/labs/Main.java');
    const companion = path.resolve('/site/content/lib/Helper.java');
    writeVirtualFile(primary, 'class Main {}');
    writeVirtualFile(companion, 'class Helper {}');
    const traceFiles = new Set<string>();
    const helpers = createTraceHelpers({
      filePath: '/site/content/labs/index.md',
      contentDir: '/site/content',
      distDir: '/site/dist',
      applyBasePath: value => value,
      cache: new Map(),
      toolAvailability: { java: false, python: false },
      dependencyCollector: { traceFiles },
    });

    helpers.renderTrace('Main.java', ['../lib/Helper.java']);

    expect(traceFiles).toEqual(new Set([primary, companion]));
  });

  test('rendered widget omits output block until the client has output', () => {
    const html = renderTraceWidgetHtml({
      highlightedSources: [
        { file: 'Test.java', highlightedSource: '<pre>class Test {}</pre>' },
      ],
      manifestUrl: '/_traces/Test/manifest.json',
      totalSteps: 1,
    });

    expect(html).toContain('class="trace-content"');
    expect(html).not.toContain('trace-output');
  });

  test('rendered widget disables controls until the client mounts', () => {
    const html = renderTraceWidgetHtml({
      highlightedSources: [
        { file: 'Test.java', highlightedSource: '<pre>class Test {}</pre>' },
      ],
      manifestUrl: '/_traces/Test/manifest.json',
      totalSteps: 3,
    });

    expect(html).toContain('class="trace-widget"');
    expect(html).toContain('1/3');
    expect(html).toContain('trace-next" disabled tabindex="-1"');
    expect(html).toContain('trace-last" disabled tabindex="-1"');
  });

  test('rendered widget includes one source panel per traced file', () => {
    const html = renderTraceWidgetHtml({
      highlightedSources: [
        { file: 'Main.java', highlightedSource: '<pre>Main</pre>' },
        { file: 'Helper.java', highlightedSource: '<pre>Helper</pre>' },
      ],
      manifestUrl: '/_traces/Main/manifest.json',
      totalSteps: 2,
    });

    expect(html).toContain('data-trace-source-file="Main.java"');
    expect(html).toContain('data-trace-source-file="Helper.java" hidden');
  });
});
