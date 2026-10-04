import { describe, expect, test } from 'bun:test';
import {
  buildManifestUrl,
  buildTraceOutputPath,
  chunkTraceOutput,
  type ChunkTraceOutputResult,
} from './trace-core';
import type { TraceManifest } from '../types';

function readJson<T>(result: ChunkTraceOutputResult, name: string): T {
  const file = result.files.find(file => file.name === name);
  if (!file) {
    throw new Error(`Missing trace file: ${name}`);
  }
  return JSON.parse(file.content) as T;
}

function step(line: number, file = 'Test.java', output: unknown[] = []) {
  return JSON.stringify({ line, file, stack: [], heap: {}, output });
}

describe('chunkTraceOutput', () => {
  test('returns the manifest followed by chunk files', () => {
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

    const result = chunkTraceOutput(
      output,
      'Test',
      'Test.java',
      [{ file: 'Test.java', source: 'public class Test {}' }],
      { chunkSize: 3 },
    );
    const manifest = result.manifest;

    expect(result.artifactId).toMatch(/^sha256-[0-9a-f]{16}$/);
    expect(result.files.map(file => file.name)).toEqual([
      'manifest.json',
      'chunk-0.json',
      'chunk-1.json',
    ]);

    const chunk0 = readJson<unknown[]>(result, 'chunk-0.json');
    const chunk1 = readJson<unknown[]>(result, 'chunk-1.json');
    expect(chunk0).toHaveLength(3);
    expect(chunk1).toHaveLength(2);

    expect((chunk0[0] as { svg: string }).svg).toContain('<svg');
    expect(chunk0[0]).toHaveProperty('file', 'Test.java');
    expect(chunk0[0]).toHaveProperty('line');
    expect(chunk0[0]).toHaveProperty('output');

    const manifestFile = readJson<TraceManifest>(result, 'manifest.json');
    expect(manifestFile).toEqual(manifest);
    expect(manifest.totalSteps).toBe(5);
    expect(manifest.chunkSize).toBe(3);
    expect(manifestFile.primaryFile).toBe('Test.java');
    expect(manifestFile.sources[0].source).toBe('public class Test {}');
    expect(manifest.sources[0].lineToSteps[1]).toEqual([0]);
    expect(manifest.sources[0].lineToSteps[5]).toEqual([4]);
  });

  test('handles single chunk', () => {
    const result = chunkTraceOutput(
      step(1, 'Test.java', [{ stream: 'stdout', text: 'hello\n' }]),
      'Test',
      'Test.java',
      [{ file: 'Test.java', source: 'class Test {}' }],
      { chunkSize: 50 },
    );

    expect(result.manifest.totalSteps).toBe(1);
    expect(result.files.map(file => file.name)).toEqual([
      'manifest.json',
      'chunk-0.json',
    ]);
    const chunk0 = readJson<
      Array<{ output: Array<{ stream: string; text: string }> }>
    >(result, 'chunk-0.json');
    expect(chunk0).toHaveLength(1);
    expect(chunk0[0].output).toEqual([{ stream: 'stdout', text: 'hello\n' }]);
  });

  test('returns only a manifest for a trace without steps', () => {
    const result = chunkTraceOutput('\n', 'Empty', 'Empty.java', [
      { file: 'Empty.java', source: '' },
    ]);

    expect(result.manifest.totalSteps).toBe(0);
    expect(result.files.map(file => file.name)).toEqual(['manifest.json']);
  });

  test('returns the same files and artifact id for the same trace', () => {
    const output = [step(1), step(2)].join('\n');
    const sources = [{ file: 'Test.java', source: 'class Test {}' }];

    const first = chunkTraceOutput(output, 'Test', 'Test.java', sources);
    const second = chunkTraceOutput(output, 'Test', 'Test.java', sources);

    expect(second.artifactId).toBe(first.artifactId);
    expect(second.files).toEqual(first.files);
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

    const first = chunkTraceOutput(output, 'First', 'First.java', [
      { file: 'First.java', source: 'class First {}' },
    ]);
    const second = chunkTraceOutput(
      output.replaceAll('First', 'Second'),
      'Second',
      'Second.java',
      [{ file: 'Second.java', source: 'class Second {}' }],
    );

    const firstChunk = readJson<Array<{ svg: string }>>(first, 'chunk-0.json');
    const secondChunk = readJson<Array<{ svg: string }>>(
      second,
      'chunk-0.json',
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
    const result = chunkTraceOutput(
      step(1, 'Test.java', [
        { stream: 'stdout', text: 'before\n' },
        { stream: 'stderr', text: 'boom\n' },
      ]),
      'Test',
      'Test.java',
      [{ file: 'Test.java', source: 'class Test {}' }],
      { chunkSize: 50 },
    );

    const chunk0 = readJson<
      Array<{ output: Array<{ stream: string; text: string }> }>
    >(result, 'chunk-0.json');
    expect(chunk0[0].output).toEqual([
      { stream: 'stdout', text: 'before\n' },
      { stream: 'stderr', text: 'boom\n' },
    ]);
  });

  test('maps repeated lines to multiple step indices', () => {
    const result = chunkTraceOutput(
      [step(3), step(3), step(3)].join('\n'),
      'Test',
      'Test.java',
      [{ file: 'Test.java', source: '' }],
      { chunkSize: 50 },
    );

    expect(result.manifest.sources[0].lineToSteps[3]).toEqual([0, 1, 2]);
  });

  test('writes per-file source entries and chunk file owners', () => {
    const result = chunkTraceOutput(
      [step(2, 'Main.java'), step(4, 'Helper.java')].join('\n'),
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
      result,
      'chunk-0.json',
    );
    expect(chunk0.map(entry => [entry.file, entry.line])).toEqual([
      ['Main.java', 2],
      ['Helper.java', 4],
    ]);
  });

  test('changes artifact id when generated trace content changes', () => {
    const sources = [{ file: 'Test.java', source: 'class Test {}' }];
    const first = chunkTraceOutput(step(1), 'Test', 'Test.java', sources);
    const second = chunkTraceOutput(
      step(1, 'Test.java', [{ stream: 'stderr', text: 'changed' }]),
      'Test',
      'Test.java',
      sources,
    );

    expect(first.artifactId).not.toBe(second.artifactId);
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

    const result = chunkTraceOutput(
      output,
      'Test',
      'Test.java',
      [{ file: 'Test.java', source: 'class Test {}' }],
      { chunkSize: 50 },
    );
    const chunk0 = readJson<Array<{ svg: string }>>(result, 'chunk-0.json');

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
});

describe('buildTraceOutputPath', () => {
  test('places trace files under the page directory with POSIX separators', () => {
    expect(
      buildTraceOutputPath('labs/01', 'Demo', 'sha256-abc', 'chunk-0.json'),
    ).toBe('labs/01/_traces/Demo/sha256-abc/chunk-0.json');
  });

  test('places trace files for root pages at the top level', () => {
    expect(
      buildTraceOutputPath('', 'Demo', 'sha256-abc', 'manifest.json'),
    ).toBe('_traces/Demo/sha256-abc/manifest.json');
  });

  test('matches the manifest URL without a base path', () => {
    expect(
      buildManifestUrl({
        relDir: 'labs/01',
        traceName: 'Demo',
        artifactId: 'sha256-abc',
        applyBasePath: subPath => `/course${subPath}`,
      }),
    ).toBe(
      `/course/${buildTraceOutputPath('labs/01', 'Demo', 'sha256-abc', 'manifest.json')}`,
    );
  });
});
