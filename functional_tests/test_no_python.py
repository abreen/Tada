import os

import pytest
from conftest import make_fake_failing_command, run_tada


def make_fake_python(directory, name):
    return make_fake_failing_command(directory, name)


def env_without_python(fake_dir):
    env = os.environ.copy()
    env['PATH'] = str(fake_dir) + os.pathsep + env.get('PATH', '')
    return env


class TestNoPython:
    """When Python is not available, Python traces should be disabled."""

    @pytest.fixture(scope='class')
    def built_site(self, tmp_path_factory):
        tmp_path = tmp_path_factory.mktemp('no_python')

        fake_dir = tmp_path / 'fake_bin'
        fake_dir.mkdir()
        make_fake_python(fake_dir, 'python3')
        make_fake_python(fake_dir, 'python')

        result = run_tada('init', 'testsite', '--no-interactive', cwd=str(tmp_path))
        assert result.returncode == 0, f'init failed: {result.stderr}'

        site_dir = tmp_path / 'testsite'
        env = env_without_python(fake_dir)
        result = run_tada('dev', cwd=str(site_dir), env=env)
        assert result.returncode == 0, f'build failed: {result.stderr}'

        return {'site_dir': site_dir, 'output': result.stdout + result.stderr}

    def test_python_trace_disabled_warning(self, built_site):
        assert 'python3/python was not found' in built_site['output']

    def test_java_trace_manifest_still_present(self, built_site):
        html = (built_site['site_dir'] / 'dist' / 'labs' / '01' / 'index.html').read_text()
        assert '/labs/01/_traces/TraceDemo/manifest.json' in html
        assert '/labs/01/_traces/SearchTreeDemo/manifest.json' in html
        assert '/labs/01/_traces/trace_demo/manifest.json' not in html

    def test_python_trace_widget_disabled(self, built_site):
        html = (built_site['site_dir'] / 'dist' / 'labs' / '01' / 'index.html').read_text()
        assert 'trace-disabled' in html
        assert not (
            built_site['site_dir'] / 'dist' / 'labs' / '01' / '_traces' / 'trace_demo'
        ).exists()
