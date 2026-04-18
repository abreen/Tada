import pytest
from conftest import init_site


class TestHtmlContentPages:
    """HTML files in content/ are rendered as pages with template wrapping."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        (site / 'content' / 'custom.html').write_text(
            '---\ntitle: Custom Page\n---\n\n<p>This is raw <strong>HTML</strong> content.</p>\n'
        )

        yield site

    def test_html_page_exists_in_dist(self, built_dev_site):
        assert (built_dev_site / 'dist' / 'custom.html').exists()

    def test_html_page_has_template_wrapper(self, built_dev_site):
        html = (built_dev_site / 'dist' / 'custom.html').read_text()
        assert '<html' in html
        assert 'index.bundle.css' in html

    def test_html_content_preserved(self, built_dev_site):
        html = (built_dev_site / 'dist' / 'custom.html').read_text()
        assert '<p>This is raw <strong>HTML</strong> content.</p>' in html

    def test_html_page_has_title(self, built_dev_site):
        html = (built_dev_site / 'dist' / 'custom.html').read_text()
        assert 'Custom Page' in html
