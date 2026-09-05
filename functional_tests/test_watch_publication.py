import json
import subprocess

import pytest
from conftest import PACKAGE_DIR


@pytest.mark.parametrize('failure', ['write', 'delete', 'parent', 'transition', 'recovery'])
def test_incremental_publication_rolls_back(tmp_path, failure):
    script = tmp_path / 'probe.ts'
    module = json.dumps(str(PACKAGE_DIR / 'build/watch/fs-commit.ts'))
    script.write_text(
        """
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { applyCommitPlan } from MODULE;
const root = process.argv[2];
const failure = process.argv[3];
const dist = path.join(root, 'dist');
fs.mkdirSync(dist);
fs.mkdirSync(path.join(dist, 'old'));
fs.writeFileSync(path.join(dist, 'old/deleted.txt'), 'deleted original');
fs.writeFileSync(path.join(dist, 'a.txt'), 'original');
fs.mkdirSync(path.join(dist, 'z.txt'));
fs.writeFileSync(path.join(dist, 'z.txt/keep'), 'directory original');
fs.writeFileSync(path.join(dist, 'blocked'), 'parent original');
if (failure === 'recovery') {
  const rename = fs.renameSync;
  fs.renameSync = (source, target) => {
    if (String(source).endsWith('backup-0')) throw new Error('restore unavailable');
    rename(source, target);
  };
}
const mutations = [
  {kind: 'write', path: 'a.txt', content: 'changed'},
  {kind: 'delete', path: 'old/deleted.txt'},
  {kind: 'write', path: 'new/nested/file.txt', content: 'new'},
  {kind: 'write', path: 'new/nested/deeper/file.txt', content: 'deep'},
  ...(failure === 'transition' ? [
    {kind: 'delete', path: 'blocked'},
    {kind: 'write', path: 'blocked/child', content: 'child'},
  ] : []),
  failure === 'parent'
    ? {kind: 'write', path: 'blocked/child', content: 'fail'}
    : {kind: ['transition', 'recovery'].includes(failure) ? 'write' : failure,
       path: 'z.txt', content: 'fail'},
];
assert.throws(() => applyCommitPlan({kind: 'apply-mutations', rootDir: dist, mutations}));
if (failure === 'recovery') {
  const recovery = fs.readdirSync(dist).find(name => name.startsWith('.watch-'));
  assert.ok(recovery, 'failed rollback must retain recovery files');
  assert.equal(fs.readFileSync(path.join(dist, recovery, 'backup-0'), 'utf8'), 'original');
  assert.equal(fs.readFileSync(path.join(dist, 'old/deleted.txt'), 'utf8'), 'deleted original');
  process.exit(0);
}
assert.equal(fs.readFileSync(path.join(dist, 'a.txt'), 'utf8'), 'original');
assert.equal(fs.readFileSync(path.join(dist, 'old/deleted.txt'), 'utf8'), 'deleted original');
assert.equal(fs.readFileSync(path.join(dist, 'z.txt/keep'), 'utf8'), 'directory original');
assert.equal(fs.readFileSync(path.join(dist, 'blocked'), 'utf8'), 'parent original');
assert.deepEqual(fs.readdirSync(dist).sort(), ['a.txt', 'blocked', 'old', 'z.txt']);
applyCommitPlan({kind: 'apply-mutations', rootDir: dist, mutations: mutations.slice(0, 3)});
assert.equal(fs.readFileSync(path.join(dist, 'a.txt'), 'utf8'), 'changed');
assert.equal(fs.existsSync(path.join(dist, 'old')), false);
assert.equal(fs.readFileSync(path.join(dist, 'new/nested/file.txt'), 'utf8'), 'new');
assert.equal(fs.readdirSync(dist).some(name => name.startsWith('.watch-')), false);
""".replace('MODULE', module)
    )
    result = subprocess.run(
        ['bun', str(script), str(tmp_path), failure], capture_output=True, text=True, timeout=15
    )
    assert result.returncode == 0, result.stdout + result.stderr
