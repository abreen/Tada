import os

import pytest
from conftest import make_fake_failing_command, run_tada


def make_fake_javac(directory):
    """Create a fake javac that always fails. Cross-platform."""
    return make_fake_failing_command(directory, 'javac')


def env_without_javac(fake_dir):
    """Return an env dict where the fake javac shadows the real one."""
    env = os.environ.copy()
    env['PATH'] = str(fake_dir) + os.pathsep + env.get('PATH', '')
    return env


class TestNoJavac:
    """When javac is not available, the build should still succeed."""

    @pytest.fixture(scope='class')
    def built_site(self, tmp_path_factory):
        tmp_path = tmp_path_factory.mktemp('no_javac')

        fake_dir = tmp_path / 'fake_bin'
        fake_dir.mkdir()
        make_fake_javac(fake_dir)

        result = run_tada('init', 'testsite', '--no-interactive', cwd=str(tmp_path))
        assert result.returncode == 0, f'init failed: {result.stderr}'

        site_dir = tmp_path / 'testsite'
        env = env_without_javac(fake_dir)
        result = run_tada('dev', cwd=str(site_dir), env=env)
        assert result.returncode == 0, f'build failed: {result.stderr}'

        return {'site_dir': site_dir, 'output': result.stdout + result.stderr}

    def test_literate_java_warning(self, built_site):
        assert 'javac was not found' in built_site['output']
        assert 'literate Java pages will not include execution output' in built_site['output']

    def test_trace_disabled_warning(self, built_site):
        assert 'will be disabled' in built_site['output']

    def test_disabled_trace_widget_in_output(self, built_site):
        html = (built_site['site_dir'] / 'dist' / 'labs' / '01' / 'index.html').read_text()
        assert 'trace-disabled' in html
        assert '/labs/01/_traces/TraceDemo/manifest.json' not in html
        assert '/labs/01/_traces/SearchTreeDemo/manifest.json' not in html
        assert '/labs/01/_traces/trace_demo/manifest.json' in html

    def test_only_python_trace_chunks_written(self, built_site):
        traces_dir = built_site['site_dir'] / 'dist' / 'labs' / '01' / '_traces'
        assert not (traces_dir / 'TraceDemo').exists()
        assert not (traces_dir / 'SearchTreeDemo').exists()
        assert (traces_dir / 'trace_demo' / 'manifest.json').exists()
