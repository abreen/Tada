import pytest

from conftest import run_tada


class TestHtmlContentPages:
    """HTML files in content/ are rendered as pages with template wrapping."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        (site / "content" / "custom.html").write_text(
            "---\ntitle: Custom Page\n---\n\n"
            "<p>This is raw <strong>HTML</strong> content.</p>\n"
        )

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        return site_dir

    def test_html_page_exists_in_dist(self, built_site):
        assert (built_site / "dist" / "custom.html").exists()

    def test_html_page_has_template_wrapper(self, built_site):
        html = (built_site / "dist" / "custom.html").read_text()
        assert "<html" in html
        assert "index.bundle.css" in html

    def test_html_content_preserved(self, built_site):
        html = (built_site / "dist" / "custom.html").read_text()
        assert "<p>This is raw <strong>HTML</strong> content.</p>" in html

    def test_html_page_has_title(self, built_site):
        html = (built_site / "dist" / "custom.html").read_text()
        assert "Custom Page" in html
