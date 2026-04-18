import json

import pytest

from conftest import init_site, run_tada, set_site_config


class TestFaviconFeatureDisabled:
    """When features.favicon is false, no favicon assets or manifest are generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        set_site_config(site, {"features": {"favicon": False}})
        yield site

    def test_no_favicon_svg(self, built_dev_site):
        dist = built_dev_site / "dist"
        assert not (dist / "favicon.svg").exists()

    def test_no_favicon_ico(self, built_dev_site):
        dist = built_dev_site / "dist"
        assert not (dist / "favicon.ico").exists()

    def test_no_favicon_pngs(self, built_dev_site):
        dist = built_dev_site / "dist"
        png_favicons = list(dist.glob("favicon-*.png"))
        assert len(png_favicons) == 0

    def test_no_manifest(self, built_dev_site):
        dist = built_dev_site / "dist"
        assert not (dist / "manifest.json").exists()

    def test_exit_code_zero(self, site_dir):
        """Build should succeed with favicon disabled."""
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0


class TestFaviconFeatureEnabled:
    """When features.favicon is true, favicon assets and manifest are generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        set_site_config(site, {"features": {"favicon": True}})
        yield site

    def test_favicon_svg_generated(self, built_dev_site):
        dist = built_dev_site / "dist"
        assert (dist / "favicon.svg").exists()

    def test_favicon_ico_generated(self, built_dev_site):
        dist = built_dev_site / "dist"
        assert (dist / "favicon.ico").exists()

    def test_favicon_pngs_generated(self, built_dev_site):
        dist = built_dev_site / "dist"
        png_favicons = list(dist.glob("favicon-*.png"))
        assert len(png_favicons) > 0

    def test_manifest_generated(self, built_dev_site):
        dist = built_dev_site / "dist"
        manifest = dist / "manifest.json"
        assert manifest.exists()
        data = json.loads(manifest.read_text())
        assert "icons" in data

    def test_exit_code_zero(self, site_dir):
        """Build should succeed with favicon enabled."""
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0
