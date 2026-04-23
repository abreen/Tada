import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'path';
import { createFsModuleMock } from '../test-helpers';

const files = new Map<string, string>();

const fsMock = {
  existsSync(filePath: string) {
    return files.has(path.resolve(filePath));
  },
  readFileSync(filePath: string) {
    const resolved = path.resolve(filePath);
    const content = files.get(resolved);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${resolved}'`);
    }
    return content;
  },
};

mock.module('fs', () => createFsModuleMock(fsMock));

let createIncludeFunction: typeof import('./include').createIncludeFunction;

beforeAll(async () => {
  ({ createIncludeFunction } = await import('./include'));
});

beforeEach(() => {
  files.clear();
});

function writeFile(filePath: string, content: string): void {
  files.set(path.resolve(filePath), content);
}

describe('createIncludeFunction', () => {
  test('includes a basic Markdown partial', () => {
    const root = '/virtual/include';
    writeFile(path.join(root, '_partial.md'), 'Hello from partial');

    const callerPath = path.join(root, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(include('_partial.md')).toBe('Hello from partial');
  });

  test('processes Lodash expressions in partials', () => {
    const root = '/virtual/include';
    writeFile(path.join(root, '_partial.md'), 'Title: <%= page.title %>');

    const callerPath = path.join(root, 'page.md');
    const params = { page: { title: 'Hello' } };
    const include = createIncludeFunction(callerPath, params);
    expect(include('_partial.md')).toBe('Title: Hello');
  });

  test('includes an HTML partial with Lodash', () => {
    const root = '/virtual/include';
    writeFile(path.join(root, '_partial.html'), '<p><%= site.title %></p>');

    const callerPath = path.join(root, 'page.md');
    const params = { site: { title: 'My Site' } };
    const include = createIncludeFunction(callerPath, params);
    expect(include('_partial.html')).toBe('<p>My Site</p>');
  });

  test('supports nested includes', () => {
    const root = '/virtual/include';
    writeFile(path.join(root, '_a.md'), 'A then <%= include("_b.md") %>');
    writeFile(path.join(root, '_b.md'), 'B');

    const callerPath = path.join(root, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(include('_a.md')).toBe('A then B');
  });

  test('resolves paths relative to the calling file', () => {
    const root = '/virtual/include';
    writeFile(path.join(root, 'subdir', '_inner.md'), 'Inner content');

    const callerPath = path.join(root, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(include('subdir/_inner.md')).toBe('Inner content');
  });

  test('nested includes resolve relative to the partial, not the caller', () => {
    const root = '/virtual/include';
    writeFile(
      path.join(root, 'subdir', '_a.md'),
      'A then <%= include("_b.md") %>',
    );
    writeFile(path.join(root, 'subdir', '_b.md'), 'B in subdir');

    const callerPath = path.join(root, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(include('subdir/_a.md')).toBe('A then B in subdir');
  });

  test('throws when partial not found', () => {
    const callerPath = '/virtual/include/page.md';
    const include = createIncludeFunction(callerPath, {});
    expect(() => include('_missing.md')).toThrow('partial not found');
  });

  test('throws when target does not start with _', () => {
    const root = '/virtual/include';
    writeFile(path.join(root, 'notpartial.md'), 'content');

    const callerPath = path.join(root, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(() => include('notpartial.md')).toThrow('must start with "_"');
  });

  test('throws when max depth exceeded', () => {
    const root = '/virtual/include';
    for (let i = 0; i <= 10; i++) {
      const content = i < 10 ? `<%= include("_${i + 1}.md") %>` : 'end';
      writeFile(path.join(root, `_${i}.md`), content);
    }

    const callerPath = path.join(root, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(() => include('_0.md')).toThrow('maximum include depth');
  });

  test('strips HTML comments from partials', () => {
    const root = '/virtual/include';
    writeFile(path.join(root, '_partial.md'), 'before<!--- hidden --->after');

    const callerPath = path.join(root, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(include('_partial.md')).toBe('beforeafter');
  });
});
