"""Exercise the real unit collector and report against an isolated source fixture."""

import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_original_source_coverage_across_test_files(tmp_path):
    scripts = tmp_path / 'scripts'
    scripts.mkdir()
    for name in [
        'coverage-data.ts',
        'coverage-source.ts',
        'coverage-preload.ts',
        'coverage-unit-preload.ts',
        'coverage-report.ts',
    ]:
        shutil.copy(ROOT / 'scripts' / name, scripts / name)
    (tmp_path / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
    (tmp_path / 'bunfig.coverage.toml').write_text(
        '[test]\npreload = ["./scripts/coverage-unit-preload.ts"]\n'
    )
    for name in ['build', 'src', 'bin', 'python']:
        (tmp_path / name).mkdir()
    # Types occupy source lines but do not become executable coverage entries.
    (tmp_path / 'src/choose.ts').write_text(
        'interface Value {\n  yes: boolean;\n}\n'
        'export function choose(v: Value) {\n  return v.yes ? 1 : 2;\n}\n'
    )
    (tmp_path / 'bin/late.ts').write_text('export function late() { return 3; }\n')
    (tmp_path / 'python/untouched.ts').write_text('export const untouched = 4;\n')
    (tmp_path / 'build/types.d.ts').write_text('declare const declared: number;\n')
    (tmp_path / 'src/test-helpers.ts').write_text('export const helper = 5;\n')
    (tmp_path / 'first.test.ts').write_text(
        'import { test, expect, afterAll, mock } from "bun:test";\n'
        'import { choose } from "./src/choose";\n'
        'test("true arm", () => expect(choose({yes:true})).toBe(1));\n'
        'afterAll(() => mock.restore());\n'
    )
    (tmp_path / 'last.test.ts').write_text(
        'import { test, expect } from "bun:test";\n'
        'import { late } from "./bin/late";\n'
        'test("late file", () => expect(late()).toBe(3));\n'
    )
    result = subprocess.run(
        ['bun', 'run', str(ROOT / 'scripts/test.ts'), 'unit', '--coverage'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    files = list((tmp_path / 'coverage/unit').glob('*.json'))
    assert len(files) == 1
    data = json.loads(files[0].read_text())
    assert set(Path(key).name for key in data) == {'choose.ts', 'late.ts'}
    for entry in data.values():
        assert any(entry['f'].values()), 'Both test files must flush executed functions'
    result = subprocess.run(
        ['bun', 'run', 'scripts/coverage-report.ts'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    lcov = (tmp_path / 'coverage/report/lcov.info').read_text()
    records = {
        record.split('SF:')[1].splitlines()[0]: record
        for record in lcov.split('end_of_record')
        if 'SF:' in record
    }
    assert set(records) == {'src/choose.ts', 'bin/late.ts', 'python/untouched.ts'}
    assert 'DA:5,1\n' in records['src/choose.ts']
    assert 'LF:1\n' in records['src/choose.ts']
    assert 'BRF:2\nBRH:1\n' in records['src/choose.ts']
    assert 'DA:1,0\n' in records['python/untouched.ts']
    assert (tmp_path / 'coverage/report/index.html').is_file()
