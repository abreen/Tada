import pytest
from conftest import init_site, run_tada, set_site_config


class TestPickersFeatureDefault:
    """Appearance pickers render when features.pickers is omitted."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        config_path = site / 'site.dev.yaml'
        config = config_path.read_text()
        assert '  pickers: true\n' in config
        config_path.write_text(config.replace('  pickers: true\n', ''))
        yield site

    def test_appearance_pickers_render(self, built_dev_site):
        html = (built_dev_site / 'dist' / 'index.html').read_text()
        assert 'class="appearance-pickers"' in html


class TestPickersFeatureDisabled:
    """Appearance pickers do not render when features.pickers is false."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        set_site_config(site, {'features': {'pickers': False}})
        yield site

    def test_appearance_pickers_do_not_render(self, built_dev_site):
        html = (built_dev_site / 'dist' / 'index.html').read_text()
        assert 'class="appearance-pickers"' not in html

    def test_build_succeeds(self, site_dir):
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, result.stderr
