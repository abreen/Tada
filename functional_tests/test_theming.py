import pytest

from conftest import run_tada, set_site_config


class TestTheming:
    """Custom theme config produces CSS custom properties in critical CSS and HTML."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Apply custom theme config
        set_site_config(site, {
            "themeColor": "#2563eb",  # blue
            "tintHue": 45,  # warm tint
            "tintAmount": 75,
        })

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        return site_dir

    def test_critical_css_contains_theme_color_property(self, built_site):
        """Critical CSS bundle contains --theme-color property."""
        critical_css = (built_site / "dist" / "critical.bundle.css").read_text()
        assert "--theme-color:" in critical_css

    def test_critical_css_contains_theme_color_text_property(self, built_site):
        """Critical CSS bundle contains --theme-color-text property."""
        critical_css = (built_site / "dist" / "critical.bundle.css").read_text()
        assert "--theme-color-text:" in critical_css

    def test_critical_css_contains_text_on_theme_property(self, built_site):
        """Critical CSS bundle contains --text-on-theme property."""
        critical_css = (built_site / "dist" / "critical.bundle.css").read_text()
        assert "--text-on-theme:" in critical_css

    def test_critical_css_contains_tint_hue_property(self, built_site):
        """Critical CSS bundle contains --tint-hue with custom value."""
        critical_css = (built_site / "dist" / "critical.bundle.css").read_text()
        assert "--tint-hue: 45deg" in critical_css

    def test_critical_css_contains_tint_amount_property(self, built_site):
        """Critical CSS bundle contains --tint-amount with custom value."""
        critical_css = (built_site / "dist" / "critical.bundle.css").read_text()
        # tintAmount 75 becomes .75 in CSS (leading zero removed by minifier)
        assert "--tint-amount: .75" in critical_css

    def test_html_page_inlines_critical_css_in_style_tag(self, built_site):
        """HTML output contains critical CSS inlined in <style> tag."""
        html = (built_site / "dist" / "index.html").read_text()
        assert "<style>" in html
        # Verify critical CSS content is actually present in the style tag
        assert "--theme-color:" in html or "--tint-hue:" in html

    def test_html_page_style_tag_contains_theme_properties(self, built_site):
        """Inlined <style> tag contains theme-related CSS custom properties."""
        html = (built_site / "dist" / "index.html").read_text()
        # Find the style tag content
        style_start = html.find("<style>")
        style_end = html.find("</style>", style_start)
        if style_start >= 0 and style_end >= 0:
            style_content = html[style_start:style_end]
            # Verify key theme properties are in the inlined style
            assert "--tint-hue" in style_content
            assert "--tint-amount" in style_content


class TestThemingDefaults:
    """Default theme config (no tintHue/tintAmount overrides) produces valid theme CSS."""

    @pytest.fixture
    def built_site(self, built_dev_site):
        """Use the default built_dev_site fixture which uses bare site defaults."""
        return built_dev_site

    def test_default_config_critical_css_contains_theme_color(self, built_site):
        """Default config critical CSS contains --theme-color property."""
        critical_css = (built_site / "dist" / "critical.bundle.css").read_text()
        assert "--theme-color:" in critical_css

    def test_default_config_critical_css_contains_tint_hue(self, built_site):
        """Default config critical CSS contains --tint-hue with default value."""
        critical_css = (built_site / "dist" / "critical.bundle.css").read_text()
        # Default tintHue is 20
        assert "--tint-hue: 20deg" in critical_css

    def test_default_config_critical_css_contains_tint_amount(self, built_site):
        """Default config critical CSS contains --tint-amount with default value."""
        critical_css = (built_site / "dist" / "critical.bundle.css").read_text()
        # Default tintAmount is 100, which becomes 1.0
        assert "--tint-amount: 1" in critical_css

    def test_default_html_inlines_theme_css(self, built_site):
        """Default config HTML output inlines theme CSS in <style> tag."""
        html = (built_site / "dist" / "index.html").read_text()
        assert "<style>" in html
        assert "--theme-color:" in html or "--tint-hue:" in html
