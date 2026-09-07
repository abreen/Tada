import { expect, test } from 'bun:test';
import { computeMutations } from './mutations';

function snapshot(content: string | Buffer, sourcePath = '/source') {
  return { outputs: new Map([['output', { sourcePath, content }]]) };
}

test('equal output bytes need no write unless the source was rebuilt', () => {
  expect(
    computeMutations(snapshot('same'), snapshot(Buffer.from('same'))),
  ).toEqual([]);
  expect(
    computeMutations(snapshot('same'), snapshot('same'), new Set(['/source'])),
  ).toEqual([{ kind: 'write', path: 'output', content: 'same' }]);
});

test('replaced, removed and newly owned outputs produce the correct mutations', () => {
  expect(
    computeMutations(
      snapshot(Buffer.from('before')),
      snapshot(Buffer.from('after'), '/new'),
    ),
  ).toEqual([{ kind: 'write', path: 'output', content: Buffer.from('after') }]);
  expect(computeMutations(snapshot('before'), { outputs: new Map() })).toEqual([
    { kind: 'delete', path: 'output' },
  ]);
  expect(computeMutations({ outputs: new Map() }, snapshot('new'))).toEqual([
    { kind: 'write', path: 'output', content: 'new' },
  ]);
});
