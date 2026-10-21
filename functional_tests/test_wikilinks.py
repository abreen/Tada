import pytest
from conftest import run_tada, set_site_config


def write_page(site_dir, rel_path, title, body):
    page = site_dir / 'content' / rel_path
    page.parent.mkdir(parents=True, exist_ok=True)
    page.write_text(f'---\ntitle: {title}\n---\n\n{body}\n')
    return page


class TestWikilinks:
    """`[[Title]]` links to the page whose front matter title matches exactly."""

    @pytest.fixture
    def site_dir(self, site_dir):
        write_page(site_dir, 'notes/my notes.md', 'My Notes', 'Notes.')
        write_page(site_dir, 'about.html', '"{{ courseName }} info"', '<p>About.</p>')
        write_page(
            site_dir,
            'page.md',
            'Page',
            'See [[My Notes]] and [[CS 101 info|the *course*]].',
        )
        yield site_dir

    @pytest.mark.parametrize('base_path', ['/', '/course'])
    def test_links_resolve(self, site_dir, base_path):
        set_site_config(site_dir, {'basePath': base_path, 'vars': {'courseName': 'CS 101'}})
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, result.stdout + result.stderr

        prefix = base_path.rstrip('/')
        html = (site_dir / 'dist' / 'page.html').read_text()
        assert f'<a href="{prefix}/notes/my%20notes.html" data-tada-page="">My Notes</a>' in html
        assert f'<a href="{prefix}/about.html" data-tada-page="">the <em>course</em></a>' in html

    def test_unknown_title_fails_the_build(self, site_dir):
        set_site_config(site_dir, {'vars': {'courseName': 'CS 101'}})
        write_page(site_dir, 'broken.md', 'Broken', 'See [[my notes]].')
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        expected = 'broken.md: broken wikilink "[[my notes]]": no page has the title "my notes"'
        assert expected in result.stdout

    def test_shared_title_fails_the_build(self, site_dir):
        set_site_config(site_dir, {'vars': {'courseName': 'CS 101'}})
        write_page(site_dir, 'copy.md', 'My Notes', 'Copy.')
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        assert 'page.md: ambiguous wikilink "[[My Notes]]"' in result.stdout
        assert '/copy.html, /notes/my notes.html' in result.stdout


class TestWatchWikilinks:
    """Watch mode re-renders pages whose wikilinks resolve differently."""

    @pytest.fixture
    def site_dir(self, site_dir):
        write_page(site_dir, 'target.md', 'Target', 'Target.')
        write_page(site_dir, 'linker.md', 'Linker', 'See [[Target]].')
        yield site_dir

    def test_retitling_and_moving_the_target(self, watch, site_dir):
        target = site_dir / 'content' / 'target.md'
        linker_html = site_dir / 'dist' / 'linker.html'
        assert 'href="/target.html"' in linker_html.read_text()

        write_page(site_dir, 'target.md', 'Renamed', 'Target.')
        watch.wait_for_error()

        write_page(site_dir, 'target.md', 'Target', 'Target.')
        watch.wait_for_successful_rebuild()
        assert 'href="/target.html"' in linker_html.read_text()

        before_mtime = linker_html.stat().st_mtime
        target.unlink()
        write_page(site_dir, 'moved/target.md', 'Target', 'Target.')
        watch.wait_for_rebuild(linker_html, 'modified', before_mtime=before_mtime)
        assert 'href="/moved/target.html"' in linker_html.read_text()
