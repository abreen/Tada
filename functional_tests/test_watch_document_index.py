import pytest
from conftest import init_site, write_structured_file


class TestWatchDocumentIndex:
    """Watch mode re-renders pages whose document navigation changes."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        content = site / 'content'
        (content / 'guide.md').write_text('---\ntitle: Guide\n---\n\nGuide.\n')
        (content / 'install.md').write_text('---\ntitle: Install\n---\n\nInstall.\n')
        (content / 'other.md').write_text('---\ntitle: Other\n---\n\nOther.\n')
        yield site

    def write_index(self, site_dir):
        write_structured_file(
            site_dir / 'content' / 'index.yml',
            {
                'page': 'index.md',
                'children': [{'page': 'guide.md', 'children': ['install.md']}],
            },
        )

    def test_creating_and_deleting_an_index_updates_its_pages(self, watch, site_dir):
        install_html = site_dir / 'dist' / 'install.html'
        before = install_html.stat().st_mtime
        self.write_index(site_dir)
        watch.wait_for_rebuild(install_html, 'modified', before_mtime=before)
        assert 'aria-label="Document navigation"' in install_html.read_text()

        before = install_html.stat().st_mtime
        (site_dir / 'content' / 'index.yml').unlink()
        watch.wait_for_rebuild(install_html, 'modified', before_mtime=before)
        assert 'aria-label="Document navigation"' not in install_html.read_text()

    def test_retitling_a_page_updates_only_pages_that_show_it(self, watch, site_dir):
        install_html = site_dir / 'dist' / 'install.html'
        other_html = site_dir / 'dist' / 'other.html'
        before = install_html.stat().st_mtime
        self.write_index(site_dir)
        watch.wait_for_rebuild(install_html, 'modified', before_mtime=before)

        before = install_html.stat().st_mtime
        before_other = watch.snapshot(other_html)
        (site_dir / 'content' / 'guide.md').write_text('---\ntitle: User Guide\n---\n\nGuide.\n')
        watch.wait_for_rebuild(install_html, 'modified', before_mtime=before)
        assert '>User Guide</a>' in install_html.read_text()
        assert watch.snapshot(other_html) == before_other

    def test_broken_index_reports_an_error_then_recovers(self, watch, site_dir):
        index_file = site_dir / 'content' / 'index.yml'
        write_structured_file(index_file, {'page': 'index.md', 'children': ['missing.md']})
        watch.wait_for_error()

        install_html = site_dir / 'dist' / 'install.html'
        before = install_html.stat().st_mtime
        self.write_index(site_dir)
        watch.wait_for_rebuild(install_html, 'modified', before_mtime=before)
        assert 'aria-label="Document navigation"' in install_html.read_text()
