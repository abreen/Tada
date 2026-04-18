import pytest
from conftest import init_site


class TestBreadcrumbs:
    """Pages with parent/parentLabel front matter render a breadcrumb link."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        lectures_dir = site / 'content' / 'lectures'
        lectures_dir.mkdir()
        (lectures_dir / 'index.md').write_text('---\ntitle: Lectures\n---\n\nLecture listing.\n')
        (lectures_dir / 'first.md').write_text(
            '---\n'
            'title: First Lecture\n'
            'parent: /lectures/index.html\n'
            'parentLabel: Back to lectures\n'
            '---\n\n'
            'Content here.\n'
        )

        yield site

    def test_breadcrumb_link_present(self, built_dev_site):
        html = (built_dev_site / 'dist' / 'lectures' / 'first.html').read_text()
        assert 'class="breadcrumb"' in html

    def test_breadcrumb_href_correct(self, built_dev_site):
        html = (built_dev_site / 'dist' / 'lectures' / 'first.html').read_text()
        assert 'href="/lectures/index.html"' in html

    def test_breadcrumb_label_correct(self, built_dev_site):
        html = (built_dev_site / 'dist' / 'lectures' / 'first.html').read_text()
        assert 'Back to lectures' in html

    def test_page_without_parent_has_no_breadcrumb(self, built_dev_site):
        html = (built_dev_site / 'dist' / 'index.html').read_text()
        assert 'class="breadcrumb"' not in html
