import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createIncludeFunction } from './include';

describe('createIncludeFunction', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-include-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('includes a basic Markdown partial', () => {
    const partialPath = path.join(tempDir, '_partial.md');
    fs.writeFileSync(partialPath, 'Hello from partial');

    const callerPath = path.join(tempDir, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(include('_partial.md')).toBe('Hello from partial');
  });

  test('processes Lodash expressions in partials', () => {
    const partialPath = path.join(tempDir, '_partial.md');
    fs.writeFileSync(partialPath, 'Title: <%= page.title %>');

    const callerPath = path.join(tempDir, 'page.md');
    const params = { page: { title: 'Hello' } };
    const include = createIncludeFunction(callerPath, params);
    expect(include('_partial.md')).toBe('Title: Hello');
  });

  test('includes an HTML partial with Lodash', () => {
    const partialPath = path.join(tempDir, '_partial.html');
    fs.writeFileSync(partialPath, '<p><%= site.title %></p>');

    const callerPath = path.join(tempDir, 'page.md');
    const params = { site: { title: 'My Site' } };
    const include = createIncludeFunction(callerPath, params);
    expect(include('_partial.html')).toBe('<p>My Site</p>');
  });

  test('supports nested includes', () => {
    const aPath = path.join(tempDir, '_a.md');
    const bPath = path.join(tempDir, '_b.md');
    fs.writeFileSync(aPath, 'A then <%= include("_b.md") %>');
    fs.writeFileSync(bPath, 'B');

    const callerPath = path.join(tempDir, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(include('_a.md')).toBe('A then B');
  });

  test('resolves paths relative to the calling file', () => {
    const subdir = path.join(tempDir, 'subdir');
    fs.mkdirSync(subdir);
    fs.writeFileSync(path.join(subdir, '_inner.md'), 'Inner content');

    const callerPath = path.join(tempDir, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(include('subdir/_inner.md')).toBe('Inner content');
  });

  test('nested includes resolve relative to the partial, not the caller', () => {
    const subdir = path.join(tempDir, 'subdir');
    fs.mkdirSync(subdir);
    fs.writeFileSync(
      path.join(subdir, '_a.md'),
      'A then <%= include("_b.md") %>',
    );
    fs.writeFileSync(path.join(subdir, '_b.md'), 'B in subdir');

    const callerPath = path.join(tempDir, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(include('subdir/_a.md')).toBe('A then B in subdir');
  });

  test('throws when partial not found', () => {
    const callerPath = path.join(tempDir, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(() => include('_missing.md')).toThrow('partial not found');
  });

  test('throws when target does not start with _', () => {
    const filePath = path.join(tempDir, 'notpartial.md');
    fs.writeFileSync(filePath, 'content');

    const callerPath = path.join(tempDir, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(() => include('notpartial.md')).toThrow('must start with "_"');
  });

  test('throws when max depth exceeded', () => {
    // Create a chain: _0.md includes _1.md includes _2.md ... up to 11
    for (let i = 0; i <= 10; i++) {
      const content = i < 10 ? `<%= include("_${i + 1}.md") %>` : 'end';
      fs.writeFileSync(path.join(tempDir, `_${i}.md`), content);
    }

    const callerPath = path.join(tempDir, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(() => include('_0.md')).toThrow('maximum include depth');
  });

  test('strips HTML comments from partials', () => {
    const partialPath = path.join(tempDir, '_partial.md');
    fs.writeFileSync(partialPath, 'before<!--- hidden --->after');

    const callerPath = path.join(tempDir, 'page.md');
    const include = createIncludeFunction(callerPath, {});
    expect(include('_partial.md')).toBe('beforeafter');
  });
});
