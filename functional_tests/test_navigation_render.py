import pytest
from conftest import NAV_CONFIG_FILE, init_site, write_structured_file


class TestNavigationRendering:
    """Nav config entries produce navigation links in the HTML output."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        about_dir = site / 'content' / 'about'
        about_dir.mkdir()
        (about_dir / 'index.md').write_text('---\ntitle: About\n---\n\nAbout page.\n')

        write_structured_file(
            site / NAV_CONFIG_FILE,
            [
                {
                    'title': 'Main',
                    'links': [
                        {'text': 'Home', 'internal': '/index.html'},
                        {'text': 'About', 'internal': '/about/index.html'},
                    ],
                },
                {
                    'title': 'External',
                    'links': [
                        {'text': 'Example', 'external': 'https://example.com'},
                    ],
                },
            ],
        )

        yield site

    def test_nav_links_present_in_html(self, built_dev_site):
        html = (built_dev_site / 'dist' / 'index.html').read_text()
        # Check for navigation links by looking for text within anchor tags
        # The text appears after the opening > (may have whitespace)
        assert 'Home</a>' in html
        assert 'About</a>' in html

    def test_nav_internal_links_have_href(self, built_dev_site):
        html = (built_dev_site / 'dist' / 'index.html').read_text()
        assert 'href="/index.html"' in html
        assert 'href="/about/index.html"' in html

    def test_nav_external_link_has_target_blank(self, built_dev_site):
        html = (built_dev_site / 'dist' / 'index.html').read_text()
        # External link should have URL, new-tab target, and opener hardening
        assert 'href="https://example.com"' in html
        assert 'target="_blank"' in html
        assert 'rel="noopener noreferrer"' in html
        # Verify the external link contains Example text
        assert 'Example</a>' in html

    def test_nav_appears_on_subpages(self, built_dev_site):
        html = (built_dev_site / 'dist' / 'about' / 'index.html').read_text()
        # Navigation should appear on subpages too
        assert 'Home</a>' in html
        assert 'About</a>' in html
