import json
import shutil

import pytest
from conftest import run_tada


def load_manifest(site_dir, trace_name):
    trace_path = site_dir / 'dist' / 'labs' / '01' / '_traces' / trace_name
    matches = list((trace_path).glob('sha256-*/manifest.json'))
    assert matches, f'No manifest found for {trace_name}'
    return matches[0], json.loads(matches[0].read_text())


def load_chunk(manifest_path, index=0):
    return json.loads((manifest_path.parent / f'chunk-{index}.json').read_text())


class TestMultiFileTraces:
    @pytest.mark.skipif(shutil.which('javac') is None, reason='javac is required')
    def test_java_trace_with_companion_source(self, site_dir):
        lectures_dir = site_dir / 'content' / 'lectures' / 'bag'
        labs_dir = site_dir / 'content' / 'labs' / '01'
        lectures_dir.mkdir(parents=True, exist_ok=True)
        labs_dir.mkdir(parents=True, exist_ok=True)
        (lectures_dir / 'ArrayBag.java').write_text(
            'public class ArrayBag {\n'
            '    private int size;\n'
            '    public void add(int value) {\n'
            '        size = size + value;\n'
            '    }\n'
            '    public int size() {\n'
            '        return size;\n'
            '    }\n'
            '}\n'
        )
        (labs_dir / 'ArrayBagDemo.java').write_text(
            'public class ArrayBagDemo {\n'
            '    public static void main(String[] args) {\n'
            '        ArrayBag bag = new ArrayBag();\n'
            '        bag.add(2);\n'
            '        System.out.println(bag.size());\n'
            '    }\n'
            '}\n'
        )
        (labs_dir / 'index.md').write_text(
            '---\n'
            'title: Trace Lab\n'
            '---\n\n'
            "<%= renderTrace('ArrayBagDemo.java', ['../../lectures/bag/ArrayBag.java']) %>\n"
        )

        result = run_tada('dev', cwd=str(site_dir), timeout=180)
        assert result.returncode == 0, result.stderr

        manifest_path, manifest = load_manifest(site_dir, 'ArrayBagDemo')
        assert manifest['primaryFile'] == 'ArrayBagDemo.java'
        assert [source['file'] for source in manifest['sources']] == [
            'ArrayBagDemo.java',
            'ArrayBag.java',
        ]
        chunk = load_chunk(manifest_path)
        assert any(entry['file'] == 'ArrayBag.java' for entry in chunk)

    @pytest.mark.skipif(shutil.which('python3') is None, reason='python3 is required')
    def test_python_trace_with_companion_module(self, site_dir):
        labs_dir = site_dir / 'content' / 'labs' / '01'
        labs_dir.mkdir(parents=True, exist_ok=True)
        (labs_dir / 'helper.py').write_text(
            'def double(value):\n    result = value * 2\n    return result\n'
        )
        (labs_dir / 'trace_import.py').write_text(
            'from helper import double\nvalue = double(3)\nprint(value)\n'
        )
        (labs_dir / 'index.md').write_text(
            "---\ntitle: Trace Lab\n---\n\n<%= renderTrace('trace_import.py', ['helper.py']) %>\n"
        )

        result = run_tada('dev', cwd=str(site_dir), timeout=180)
        assert result.returncode == 0, result.stderr

        manifest_path, manifest = load_manifest(site_dir, 'trace_import')
        assert manifest['primaryFile'] == 'trace_import.py'
        assert [source['file'] for source in manifest['sources']] == [
            'trace_import.py',
            'helper.py',
        ]
        chunk = load_chunk(manifest_path)
        assert any(entry['file'] == 'helper.py' for entry in chunk)
