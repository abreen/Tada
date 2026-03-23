import pytest

from conftest import run_tada


class TestKatexRendering:
    """LaTeX math is rendered at build time via KaTeX."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Create a page with math
        (site / "content" / "math.md").write_text(
            "title: Math\n\nInline $E = mc^2$ and display:\n\n"
            "$$\\int_0^\\infty e^{-x^2} dx$$\n"
        )

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_math_page_contains_katex_html(self, built_site):
        html = (built_site / "dist" / "math.html").read_text()
        assert 'class="katex"' in html

    def test_math_page_has_katex_stylesheet(self, built_site):
        html = (built_site / "dist" / "math.html").read_text()
        assert "katex.min.css" in html

    def test_katex_stylesheet_is_deferred(self, built_site):
        html = (built_site / "dist" / "math.html").read_text()
        assert 'media="print"' in html
        assert "this.media='all'" in html

    def test_non_math_page_has_no_katex_stylesheet(self, built_site):
        html = (built_site / "dist" / "index.html").read_text()
        assert "katex.min.css" not in html

    def test_katex_css_exists_in_dist(self, built_site):
        assert (built_site / "dist" / "katex" / "katex.min.css").exists()

    def test_katex_fonts_exist_in_dist(self, built_site):
        fonts = list((built_site / "dist" / "katex" / "fonts").glob("*.woff2"))
        assert len(fonts) > 0

    def test_katex_css_has_no_ttf_references(self, built_site):
        css = (built_site / "dist" / "katex" / "katex.min.css").read_text()
        assert ".ttf" not in css


class TestKatexErrorHandling:
    """Invalid LaTeX syntax fails the build."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Create a page with invalid LaTeX
        (site / "content" / "bad-math.md").write_text(
            "title: Bad Math\n\n$\\invalidcommand{$\n"
        )

        yield site

    def test_build_fails_on_invalid_latex(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0

    def test_error_message_mentions_katex(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        output = result.stdout + result.stderr
        assert "KaTeX" in output or "katex" in output.lower()
