import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'path';
import { createFsModuleMock } from '../test-helpers';
import type { TraceCache } from '../build-types';

const files = new Map<string, string>();
const fileMtims = new Map<string, number>();

const fsMock = {
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
};

mock.module('fs', () => createFsModuleMock(fsMock));

let bridgeConstructorReturnValues: typeof import('./trace-core').bridgeConstructorReturnValues;
let renderTraceWidgetHtml: typeof import('./trace-core').renderTraceWidgetHtml;
let createTraceHelpers: typeof import('./trace').createTraceHelpers;
let isTraceSourceFile: typeof import('./trace').isTraceSourceFile;
let parseIgnoreFields: typeof import('./trace-java').parseIgnoreFields;
let hasExplicitTopLevelTypeDeclaration: typeof import('./trace-java').hasExplicitTopLevelTypeDeclaration;

beforeAll(async () => {
  ({ bridgeConstructorReturnValues, renderTraceWidgetHtml } =
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

describe('traces', () => {
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
      applyBasePath: value => value,
      cache: new Map(),
      toolAvailability: { java: false, python: false },
      dependencyCollector: { traceFiles },
    });

    helpers.renderTrace('Main.java', ['../lib/Helper.java']);

    expect(traceFiles).toEqual(new Set([primary, companion]));
  });

  test('renderTrace re-emits cached trace files under each page directory', () => {
    const primary = path.resolve('/site/content/shared/Main.java');
    writeVirtualFile(primary, 'class Main {}', 7);
    const cache: TraceCache = new Map([
      [
        JSON.stringify([primary]),
        {
          artifactId: 'sha256-cached',
          files: [
            { name: 'manifest.json', content: '{"totalSteps":1}' },
            { name: 'chunk-0.json', content: '[]' },
          ],
          highlightedSources: [
            { file: 'Main.java', highlightedSource: '<pre>Main</pre>' },
          ],
          totalSteps: 1,
          sourceMtims: { [primary]: 7 },
        },
      ],
    ]);

    for (const [page, sourceFile, relDir] of [
      ['/site/content/shared/index.md', 'Main.java', 'shared'],
      ['/site/content/labs/01/index.md', '../../shared/Main.java', 'labs/01'],
    ]) {
      const traceOutputs = new Map<string, string>();
      const helpers = createTraceHelpers({
        filePath: page,
        contentDir: '/site/content',
        applyBasePath: value => value,
        cache,
        toolAvailability: { java: true, python: true },
        dependencyCollector: { traceOutputs },
      });

      const html = helpers.renderTrace(sourceFile);

      const artifactDir = `${relDir}/_traces/Main/sha256-cached`;
      expect(html).toContain(
        `data-trace-manifest="/${artifactDir}/manifest.json"`,
      );
      expect(traceOutputs).toEqual(
        new Map([
          [`${artifactDir}/manifest.json`, '{"totalSteps":1}'],
          [`${artifactDir}/chunk-0.json`, '[]'],
        ]),
      );
    }
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

  test('rendered widget includes a resize handle between diagram and source', () => {
    const html = renderTraceWidgetHtml({
      highlightedSources: [
        { file: 'Test.java', highlightedSource: '<pre>class Test {}</pre>' },
      ],
      manifestUrl: '/_traces/Test/manifest.json',
      totalSteps: 1,
    });

    expect(html).toContain('class="trace-resizer"');
    expect(html).toContain('role="separator"');
    expect(html.indexOf('class="trace-diagram"')).toBeLessThan(
      html.indexOf('class="trace-resizer"'),
    );
    expect(html.indexOf('class="trace-resizer"')).toBeLessThan(
      html.indexOf('class="trace-source-wrapper"'),
    );
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
