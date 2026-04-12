import json

import pytest

from conftest import run_tada


class TestNavigationRendering:
    """nav.json entries produce navigation links in the HTML output."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        about_dir = site / "content" / "about"
        about_dir.mkdir()
        (about_dir / "index.md").write_text(
            "---\ntitle: About\n---\n\nAbout page.\n"
        )

        (site / "nav.json").write_text(json.dumps([
            {
                "title": "Main",
                "links": [
                    {"text": "Home", "internal": "/index.html"},
                    {"text": "About", "internal": "/about/index.html"},
                ]
            },
            {
                "title": "External",
                "links": [
                    {"text": "Example", "external": "https://example.com"},
                ]
            }
        ]))

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        return site_dir

    def test_nav_links_present_in_html(self, built_site):
        html = (built_site / "dist" / "index.html").read_text()
        # Check for navigation links by looking for text within anchor tags
        # The text appears after the opening > (may have whitespace)
        assert "Home</a>" in html
        assert "About</a>" in html

    def test_nav_internal_links_have_href(self, built_site):
        html = (built_site / "dist" / "index.html").read_text()
        assert 'href="/index.html"' in html
        assert 'href="/about/index.html"' in html

    def test_nav_external_link_has_target_blank(self, built_site):
        html = (built_site / "dist" / "index.html").read_text()
        # External link should have both the URL and target="_blank"
        assert 'href="https://example.com"' in html
        assert 'target="_blank"' in html
        # Verify the external link contains Example text
        assert "Example</a>" in html

    def test_nav_appears_on_subpages(self, built_site):
        html = (built_site / "dist" / "about" / "index.html").read_text()
        # Navigation should appear on subpages too
        assert "Home</a>" in html
        assert "About</a>" in html
