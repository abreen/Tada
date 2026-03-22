import pytest

from conftest import run_tada


class TestDevBuild:
    def test_creates_dist_directory(self, built_dev_site):
        assert (built_dev_site / "dist").is_dir()

    def test_produces_index_html(self, built_dev_site):
        index = built_dev_site / "dist" / "index.html"
        assert index.exists()
        html = index.read_text()
        assert "<html" in html
        assert "</html>" in html

    def test_produces_css_bundle(self, built_dev_site):
        dist = built_dev_site / "dist"
        css_files = list(dist.glob("*.bundle.css"))
        assert len(css_files) >= 1
        names = [f.name for f in css_files]
        assert "index.bundle.css" in names

    def test_produces_js_bundle(self, built_dev_site):
        dist = built_dev_site / "dist"
        assert (dist / "index.bundle.js").exists()

    def test_produces_critical_css(self, built_dev_site):
        dist = built_dev_site / "dist"
        assert (dist / "critical.bundle.css").exists()

    def test_inlines_critical_css_in_html(self, built_dev_site):
        index = built_dev_site / "dist" / "index.html"
        html = index.read_text()
        assert "<style>" in html

    def test_produces_font_files(self, built_dev_site):
        dist = built_dev_site / "dist"
        woff2_files = list(dist.rglob("*.woff2"))
        assert len(woff2_files) > 0

    def test_produces_no_favicon_files(self, built_dev_site):
        dist = built_dev_site / "dist"
        assert not (dist / "favicon.svg").exists()

    def test_produces_no_manifest(self, built_dev_site):
        dist = built_dev_site / "dist"
        assert not (dist / "manifest.json").exists()

    def test_exit_code_zero(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0

    def test_html_contains_title(self, built_dev_site):
        index = built_dev_site / "dist" / "index.html"
        html = index.read_text()
        assert "<title>" in html


class TestDevBuildDefaultContent:
    """Tests that require the full default content tree."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"
        assert site.is_dir()
        yield site

    def test_copies_public_files(self, built_dev_site):
        dist = built_dev_site / "dist"
        assert (dist / "test.txt").exists()

    def test_copies_content_assets(self, built_dev_site):
        dist = built_dev_site / "dist"
        assert (dist / "lectures" / "01" / "lecture1.pdf").exists()

    def test_renders_nested_content(self, built_dev_site):
        dist = built_dev_site / "dist"
        assert (dist / "lectures" / "index.html").exists()
        assert (dist / "lectures" / "01" / "index.html").exists()

    def test_skipped_content_not_rendered(self, built_dev_site):
        dist = built_dev_site / "dist"
        # problem_sets/index.html has skip: true in front matter
        assert not (dist / "problem_sets" / "index.html").exists()


class TestDevBuildErrors:
    def test_missing_config_exits_1(self, tmp_path):
        result = run_tada("dev", cwd=str(tmp_path))
        assert result.returncode == 1
        assert "site.dev.json" in result.stderr
