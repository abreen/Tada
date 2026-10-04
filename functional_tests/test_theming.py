import pytest
from conftest import init_site, set_site_config


def read_stylesheet(site_dir):
    matches = list((site_dir / 'dist').glob('index.bundle.tada-*.css'))
    assert len(matches) == 1, 'Expected one CSS bundle'
    return matches[0].read_text()


def assert_links_stylesheet_without_inlining_theme(site_dir):
    html = (site_dir / 'dist' / 'index.html').read_text()
    assert 'index.bundle.tada-' in html
    assert '--theme-color:' not in html
    assert '--tint-hue:' not in html


class TestTheming:
    """Custom theme config produces CSS custom properties in the stylesheet."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        # Apply custom theme config
        set_site_config(
            site,
            {
                'themeColor': '#2563eb',  # blue
                'tintHue': 45,  # warm tint
                'tintAmount': 75,
            },
        )

        yield site

    def test_stylesheet_contains_theme_color_property(self, built_dev_site):
        """CSS bundle contains --theme-color property."""
        css = read_stylesheet(built_dev_site)
        assert '--theme-color:' in css

    def test_stylesheet_contains_theme_color_text_property(self, built_dev_site):
        """CSS bundle contains --theme-color-text property."""
        css = read_stylesheet(built_dev_site)
        assert '--theme-color-text:' in css

    def test_stylesheet_contains_text_on_theme_property(self, built_dev_site):
        """CSS bundle contains --text-on-theme property."""
        css = read_stylesheet(built_dev_site)
        assert '--text-on-theme:' in css

    def test_stylesheet_contains_tint_hue_property(self, built_dev_site):
        """CSS bundle contains --tint-hue with custom value."""
        css = read_stylesheet(built_dev_site)
        assert '--tint-hue: 45deg' in css

    def test_stylesheet_contains_tint_amount_property(self, built_dev_site):
        """CSS bundle contains --tint-amount with custom value."""
        css = read_stylesheet(built_dev_site)
        # tintAmount 75 becomes .75 in CSS (leading zero removed by Bun)
        assert '--tint-amount: .75' in css

    def test_html_page_links_theme_css_without_inlining(self, built_dev_site):
        """HTML output links the stylesheet instead of inlining theme CSS."""
        assert_links_stylesheet_without_inlining_theme(built_dev_site)


class TestThemingDefaults:
    """Default theme config (no tintHue/tintAmount overrides) produces valid theme CSS."""

    def test_default_config_stylesheet_contains_theme_color(self, built_dev_site):
        """Default config CSS bundle contains --theme-color property."""
        css = read_stylesheet(built_dev_site)
        assert '--theme-color:' in css

    def test_default_config_stylesheet_contains_tint_hue(self, built_dev_site):
        """Default config CSS bundle contains --tint-hue with default value."""
        css = read_stylesheet(built_dev_site)
        # Default tintHue is 33
        assert '--tint-hue: 33deg' in css

    def test_default_config_stylesheet_contains_tint_amount(self, built_dev_site):
        """Default config CSS bundle contains --tint-amount with default value."""
        css = read_stylesheet(built_dev_site)
        # Default tintAmount is 100, which becomes 1.0
        assert '--tint-amount: 1' in css

    def test_default_html_links_theme_css_without_inlining(self, built_dev_site):
        """Default config HTML output links the stylesheet instead of inlining theme CSS."""
        assert_links_stylesheet_without_inlining_theme(built_dev_site)
