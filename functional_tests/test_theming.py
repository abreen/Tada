import pytest
from conftest import init_site, set_site_config


def get_inlined_style_content(html):
    style_start = html.find('<style>')
    assert style_start >= 0, 'Expected inlined <style> tag'

    style_end = html.find('</style>', style_start)
    assert style_end >= 0, 'Expected closing </style> tag'

    return html[style_start:style_end]


def read_critical_css(site_dir):
    matches = list((site_dir / 'dist').glob('critical.bundle.tada-*.css'))
    assert matches, 'Expected critical CSS bundle'
    return matches[0].read_text()


class TestTheming:
    """Custom theme config produces CSS custom properties in critical CSS and HTML."""

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

    def test_critical_css_contains_theme_color_property(self, built_dev_site):
        """Critical CSS bundle contains --theme-color property."""
        critical_css = read_critical_css(built_dev_site)
        assert '--theme-color:' in critical_css

    def test_critical_css_contains_theme_color_text_property(self, built_dev_site):
        """Critical CSS bundle contains --theme-color-text property."""
        critical_css = read_critical_css(built_dev_site)
        assert '--theme-color-text:' in critical_css

    def test_critical_css_contains_text_on_theme_property(self, built_dev_site):
        """Critical CSS bundle contains --text-on-theme property."""
        critical_css = read_critical_css(built_dev_site)
        assert '--text-on-theme:' in critical_css

    def test_critical_css_contains_tint_hue_property(self, built_dev_site):
        """Critical CSS bundle contains --tint-hue with custom value."""
        critical_css = read_critical_css(built_dev_site)
        assert '--tint-hue: 45deg' in critical_css

    def test_critical_css_contains_tint_amount_property(self, built_dev_site):
        """Critical CSS bundle contains --tint-amount with custom value."""
        critical_css = read_critical_css(built_dev_site)
        # tintAmount 75 becomes .75 in CSS (leading zero removed by minifier)
        assert '--tint-amount: .75' in critical_css

    def test_html_page_inlines_critical_css_in_style_tag(self, built_dev_site):
        """HTML output contains critical CSS inlined in <style> tag."""
        html = (built_dev_site / 'dist' / 'index.html').read_text()
        assert '<style>' in html
        # Verify critical CSS content is actually present in the style tag
        assert '--theme-color:' in html or '--tint-hue:' in html

    def test_html_page_style_tag_contains_theme_properties(self, built_dev_site):
        """Inlined <style> tag contains theme-related CSS custom properties."""
        html = (built_dev_site / 'dist' / 'index.html').read_text()
        style_content = get_inlined_style_content(html)
        assert '--tint-hue' in style_content
        assert '--tint-amount' in style_content


class TestThemingDefaults:
    """Default theme config (no tintHue/tintAmount overrides) produces valid theme CSS."""

    def test_default_config_critical_css_contains_theme_color(self, built_dev_site):
        """Default config critical CSS contains --theme-color property."""
        critical_css = read_critical_css(built_dev_site)
        assert '--theme-color:' in critical_css

    def test_default_config_critical_css_contains_tint_hue(self, built_dev_site):
        """Default config critical CSS contains --tint-hue with default value."""
        critical_css = read_critical_css(built_dev_site)
        # Default tintHue is 20
        assert '--tint-hue: 20deg' in critical_css

    def test_default_config_critical_css_contains_tint_amount(self, built_dev_site):
        """Default config critical CSS contains --tint-amount with default value."""
        critical_css = read_critical_css(built_dev_site)
        # Default tintAmount is 100, which becomes 1.0
        assert '--tint-amount: 1' in critical_css

    def test_default_html_inlines_theme_css(self, built_dev_site):
        """Default config HTML output inlines theme CSS in <style> tag."""
        html = (built_dev_site / 'dist' / 'index.html').read_text()
        assert '<style>' in html
        assert '--theme-color:' in html or '--tint-hue:' in html
