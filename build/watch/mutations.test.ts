import { expect, test } from 'bun:test';
import { computeMutations } from './mutations';
import type { OutputContent } from '../types';

function snapshot(content: OutputContent, sourcePath = '/source') {
  return { outputs: new Map([['output', { sourcePath, content }]]) };
}

test('equal output text needs no write unless the source was rebuilt', () => {
  expect(computeMutations(snapshot('same'), snapshot('same'))).toEqual([]);
  expect(
    computeMutations(snapshot('same'), snapshot('same'), new Set(['/source'])),
  ).toEqual([{ kind: 'write', path: 'output', content: 'same' }]);
});

test('copied outputs are rewritten only when their source path changes or is rebuilt', () => {
  const copy = { copyFrom: '/site/public/logo.png' };
  expect(computeMutations(snapshot(copy), snapshot({ ...copy }))).toEqual([]);
  expect(
    computeMutations(snapshot(copy), snapshot(copy), new Set(['/source'])),
  ).toEqual([{ kind: 'write', path: 'output', content: copy }]);

  const moved = { copyFrom: '/site/content/logo.png' };
  expect(computeMutations(snapshot(copy), snapshot(moved, '/new'))).toEqual([
    { kind: 'write', path: 'output', content: moved },
  ]);
  expect(computeMutations(snapshot('text'), snapshot(copy))).toEqual([
    { kind: 'write', path: 'output', content: copy },
  ]);
});

test('replaced, removed and newly owned outputs produce the correct mutations', () => {
  expect(
    computeMutations(snapshot('before'), snapshot('after', '/new')),
  ).toEqual([{ kind: 'write', path: 'output', content: 'after' }]);
  expect(computeMutations(snapshot('before'), { outputs: new Map() })).toEqual([
    { kind: 'delete', path: 'output' },
  ]);
  expect(computeMutations({ outputs: new Map() }, snapshot('new'))).toEqual([
    { kind: 'write', path: 'output', content: 'new' },
  ]);
});
