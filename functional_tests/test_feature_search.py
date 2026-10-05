import gzip
import json

import pytest
from conftest import run_tada, set_site_config


@pytest.mark.parametrize('base_path', ['/', '/course'])
def test_html_search_urls_encode_raw_output_names(site_dir, base_path):
    set_site_config(site_dir, {'basePath': base_path})
    pages = {
        'docs/lecture#1.md': 'title: Hash page\n\nHashmarker content.\n',
        '100%20done/guide.html': 'title: Percent page\n\n<p>Percentmarker content.</p>\n',
        'docs/ordinary.md': 'title: Ordinary page\n\nOrdinarymarker content.\n',
        'docs/index.html': 'title: Directory page\n\n<p>Directorymarker content.</p>\n',
    }
    for relative_path, content in pages.items():
        source = site_dir / 'content' / relative_path
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_text(content)
    (site_dir / 'content' / 'index.md').write_text(
        'title: Home\n\n'
        '[Hash page](/docs/lecture%231.html)\n\n'
        '[Percent page](/100%2520done/guide.html)\n\n'
        '[Ordinary page](/docs/ordinary.html)\n\n'
        '[Directory page](/docs/index.html)\n'
    )

    result = run_tada('dev', cwd=str(site_dir))
    assert result.returncode == 0, result.stderr
    dist = site_dir / 'dist'
    for output in [
        'index.html',
        'docs/lecture#1.html',
        '100%20done/guide.html',
        'docs/ordinary.html',
        'docs/index.html',
    ]:
        assert (dist / output).is_file()
    home = (dist / 'index.html').read_text()
    prefix = base_path.rstrip('/')
    assert f'href="{prefix}/docs/lecture%231.html"' in home
    assert f'href="{prefix}/100%2520done/guide.html"' in home

    records = []
    for fragment in (dist / 'pagefind').rglob('*.pf_fragment'):
        payload = gzip.decompress(fragment.read_bytes()).decode('utf-8')
        records.append(json.loads(payload[payload.index('{') :]))
    assert {record['url'] for record in records} == {
        '/index.html',
        '/docs/lecture%231.html',
        '/100%2520done/guide.html',
        '/docs/ordinary.html',
        '/docs/index.html',
    }


class TestSearchFeatureDisabled:
    """When features.search is false, Pagefind search index is not generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada('init', 'testsite', '--no-interactive', cwd=str(tmp_path))
        assert result.returncode == 0, f'init failed: {result.stderr}'
        site = tmp_path / 'testsite'

        set_site_config(site, {'features': {'search': False}})

        yield site

    def test_no_pagefind_directory(self, built_dev_site):
        """No pagefind/ directory should exist in the output."""
        dist = built_dev_site / 'dist'
        assert not (dist / 'pagefind').exists()

    def test_html_pages_still_generated(self, built_dev_site):
        """Content pages should still be rendered even without search."""
        dist = built_dev_site / 'dist'
        assert (dist / 'index.html').exists()

    def test_exit_code_zero(self, site_dir):
        """Build should succeed with search disabled."""
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0


class TestSearchFeatureEnabled:
    """When features.search is true, Pagefind search index is generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada('init', 'testsite', '--no-interactive', cwd=str(tmp_path))
        assert result.returncode == 0, f'init failed: {result.stderr}'
        yield tmp_path / 'testsite'

    def test_pagefind_directory_exists(self, built_dev_site):
        """pagefind/ directory should exist in the output."""
        dist = built_dev_site / 'dist'
        assert (dist / 'pagefind').is_dir()

    def test_pagefind_has_index_files(self, built_dev_site):
        """pagefind/ should contain index files."""
        pagefind_dir = built_dev_site / 'dist' / 'pagefind'
        files = list(pagefind_dir.iterdir())
        assert len(files) > 0
