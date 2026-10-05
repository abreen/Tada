import gzip
import json
import os
import shutil
from urllib.parse import quote, unquote, urlsplit

import pytest
from conftest import PACKAGE_DIR, init_site, make_fake_failing_command, run_tada, set_site_config


def _pagefind_has_pdf_ref(pagefind_dir, filename):
    """Check if any pagefind fragment references the given filename.

    Pagefind fragment files are gzip compressed, so we decompress them
    before searching.
    """
    for f in pagefind_dir.rglob('*.pf_fragment'):
        try:
            content = gzip.decompress(f.read_bytes()).decode('utf-8', errors='ignore')
        except Exception:
            continue
        if filename in content:
            return True
    return False


@pytest.mark.parametrize('base_path', ['/', '/course'])
@pytest.mark.parametrize('pdf_name', ['lecture#1.pdf', '100%20done/guide.pdf', 'guide.pdf'])
def test_pdf_search_urls_encode_raw_output_paths(tmp_path, base_path, pdf_name):
    site = init_site(tmp_path, bare=True)
    set_site_config(site, {'basePath': base_path, 'features': {'search': True}})
    source = site / 'content'
    pdf = source.joinpath(*pdf_name.split('/'))
    pdf.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(PACKAGE_DIR / 'init' / 'content' / 'lectures' / '01' / 'lecture1.pdf', pdf)
    url_path = quote('/' + pdf_name, safe='/')
    (source / 'index.md').write_text('---\ntitle: Home\n---\n[Lecture](' + url_path + ')\n')
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'mutool was not found' not in result.stdout + result.stderr
    assert (site / 'dist').joinpath(*pdf_name.split('/')).read_bytes() == pdf.read_bytes()
    records = []
    for fragment in (site / 'dist' / 'pagefind').rglob('*.pf_fragment'):
        payload = gzip.decompress(fragment.read_bytes()).decode('utf-8')
        record = json.loads(payload[payload.index('{') :])
        if record.get('meta', {}).get('title') == pdf.name:
            records.append(record)
    assert records, 'No PDF records found in actual Pagefind fragments'
    assert {record['meta']['page'] for record in records} == {'1', '2'}
    for record in records:
        assert record['url'] == url_path + '#page=' + record['meta']['page']
        parsed = urlsplit(record['url'])
        assert unquote(parsed.path) == '/' + pdf_name
        assert parsed.fragment == 'page=' + record['meta']['page']


class TestPdfSearchIndexing:
    """When search is enabled and mutool is available, PDFs are indexed."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada('init', 'testsite', '--no-interactive', cwd=str(tmp_path))
        assert result.returncode == 0, f'init failed: {result.stderr}'
        yield tmp_path / 'testsite'

    def test_pagefind_directory_exists(self, built_dev_site):
        dist = built_dev_site / 'dist'
        assert (dist / 'pagefind').is_dir()

    def test_pdf_is_copied_to_dist(self, built_dev_site):
        pdf = built_dev_site / 'dist' / 'lectures' / '01' / 'lecture1.pdf'
        assert pdf.exists()

    def test_pagefind_indexes_pdf_content(self, built_dev_site):
        """The pagefind index should contain fragments referencing the PDF."""
        pagefind_dir = built_dev_site / 'dist' / 'pagefind'
        assert _pagefind_has_pdf_ref(pagefind_dir, 'lecture1.pdf')

    def test_pagefind_entry_includes_pdf_pages(self, site_dir):
        """The pagefind entry JSON page count should include PDF pages."""
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, f'dev build failed: {result.stderr}'

        pagefind_dir = site_dir / 'dist' / 'pagefind'
        entry = json.loads((pagefind_dir / 'pagefind-entry.json').read_text())
        # The default site has 14 HTML pages. With the PDF (2 pages),
        # the total should be greater than 14.
        total = sum(lang['page_count'] for lang in entry['languages'].values())
        output = result.stdout + result.stderr
        assert total > 14, f'Expected >14 indexed pages, got {total}\nbuild output:\n{output}'

    def test_build_log_mentions_pdf_count(self, site_dir):
        """The build output should mention PDFs when building the index."""
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0
        output = result.stdout + result.stderr
        assert 'PDF' in output or 'pdf' in output


class TestPdfSearchWithBasePath:
    """PDF search indexing works with a non-root basePath."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada(
            'init',
            'testsite',
            '--no-interactive',
            '--prod-base-path',
            '/course',
            '--prod-base',
            'https://example.edu',
            cwd=str(tmp_path),
        )
        assert result.returncode == 0, f'init failed: {result.stderr}'
        yield tmp_path / 'testsite'

    def test_prod_build_indexes_pdf(self, site_dir):
        result = run_tada('prod', cwd=str(site_dir))
        assert result.returncode == 0, f'prod build failed: {result.stderr}'

        dist = site_dir / 'dist-prod' / 'v1'
        pagefind_dir = dist / 'pagefind'
        assert pagefind_dir.is_dir()
        assert _pagefind_has_pdf_ref(pagefind_dir, 'lecture1.pdf')


def make_fake_mutool(directory):
    """Create a fake mutool that always fails. Cross-platform."""
    return make_fake_failing_command(directory, 'mutool')


def env_without_mutool(fake_dir):
    """Return an env dict where the fake mutool shadows the real one."""
    env = os.environ.copy()
    env['PATH'] = str(fake_dir) + os.pathsep + env.get('PATH', '')
    return env


class TestPdfSearchWithoutMutool:
    """When mutool is not available, build still succeeds but warns."""

    @pytest.fixture(scope='class')
    def built_site(self, tmp_path_factory):
        tmp_path = tmp_path_factory.mktemp('no_mutool')

        fake_dir = tmp_path / 'fake_bin'
        fake_dir.mkdir()
        make_fake_mutool(fake_dir)

        result = run_tada('init', 'testsite', '--no-interactive', cwd=str(tmp_path))
        assert result.returncode == 0, f'init failed: {result.stderr}'

        site_dir = tmp_path / 'testsite'
        env = env_without_mutool(fake_dir)
        result = run_tada('dev', cwd=str(site_dir), env=env)
        assert result.returncode == 0, f'build failed: {result.stderr}'

        return {'site_dir': site_dir, 'output': result.stdout + result.stderr}

    def test_build_succeeds(self, built_site):
        assert built_site['site_dir'].is_dir()

    def test_warns_about_missing_mutool(self, built_site):
        assert 'mutool' in built_site['output'].lower()
