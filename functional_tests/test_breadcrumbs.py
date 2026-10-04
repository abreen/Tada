import re

import pytest
from conftest import init_site, run_tada, set_site_config


class TestBreadcrumbs:
    """Build-time ancestor trails work for Markdown and HTML pages."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        lectures = site / 'content' / 'lectures'
        lectures.mkdir()
        (lectures / 'index.md').write_text('---\ntitle: Lectures\n---\n\nListing.\n')
        trail = (
            'title: First **Lecture** & <em>Notes</em>\n'
            'breadcrumbs:\n'
            '  - label: "Home & <Notes>"\n'
            '    url: /index.html?view=full#intro\n'
            '  - label: "<%= site.title %> lectures"\n'
            '    url: ./index.html\n'
        )
        (lectures / 'first.md').write_text(f'---\n{trail}---\n\nContent.\n')
        (lectures / 'second.html').write_text(f'---\n{trail}---\n\n<p>Content.</p>\n')
        (lectures / 'empty.md').write_text('---\ntitle: Empty\nbreadcrumbs: []\n---\n\nContent.\n')
        yield site

    @pytest.mark.parametrize('base_path', ['/', '/course'])
    def test_ordered_trails_and_url_rewriting(self, site_dir, base_path):
        set_site_config(site_dir, {'basePath': base_path, 'title': 'Course'})
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, result.stdout + result.stderr
        for name in ['first.html', 'second.html']:
            html = (site_dir / 'dist' / 'lectures' / name).read_text()
            nav = re.search(r'<nav class="breadcrumbs"[^>]*>(.*?)</nav>', html, re.S)
            assert nav, 'missing breadcrumb navigation'
            assert 'aria-label="Breadcrumb"' in nav[0]
            assert 'data-pagefind-ignore' in nav[0]
            assert '<ol>' in nav[1]
            assert nav[1].count('<li>') == 3
            assert f'href="{base_path.rstrip("/")}/index.html?view=full#intro"' in nav[1]
            assert 'href="./index.html"' in nav[1]
            assert '>Home &amp; &lt;Notes&gt;</a>' in nav[1]
            assert '>Course lectures</a>' in nav[1]
            assert nav[1].index('>Home &amp;') < nav[1].index('>Course lectures')
            assert (
                '<span aria-current="page" title="First Lecture &amp; Notes">'
                'First Lecture &amp; Notes</span>'
            ) in nav[1]
            assert nav[1].count('aria-hidden="true"') == 2
            assert '<strong>Lecture</strong>' in html
        pages_without_trails = [
            site_dir / 'dist' / 'index.html',
            site_dir / 'dist' / 'lectures' / 'empty.html',
        ]
        for file in pages_without_trails:
            assert 'aria-label="Breadcrumb"' not in file.read_text()

    def test_broken_later_entry_identifies_file_and_entry(self, site_dir):
        (site_dir / 'content' / 'page.md').write_text(
            '---\ntitle: Broken\nbreadcrumbs:\n'
            '  - label: Home\n    url: /index.html\n'
            '  - label: Missing\n    url: /missing.html\n---\n\nContent.\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert 'page.md: breadcrumb entry 2: broken breadcrumb link' in output
        assert '/missing.html' in output
