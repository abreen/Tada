import json

import pytest

from conftest import run_tada


class TestFaviconFeatureDisabled:
    """When features.favicon is false, no favicon assets or manifest are generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Explicitly disable favicon (it's false by default, but be explicit)
        config_path = site / "site.dev.json"
        config = json.loads(config_path.read_text())
        config["features"]["favicon"] = False
        config_path.write_text(json.dumps(config, indent=2) + "\n")

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_no_favicon_svg(self, built_site):
        dist = built_site / "dist"
        assert not (dist / "favicon.svg").exists()

    def test_no_favicon_ico(self, built_site):
        dist = built_site / "dist"
        assert not (dist / "favicon.ico").exists()

    def test_no_favicon_pngs(self, built_site):
        dist = built_site / "dist"
        png_favicons = list(dist.glob("favicon-*.png"))
        assert len(png_favicons) == 0

    def test_no_manifest(self, built_site):
        dist = built_site / "dist"
        assert not (dist / "manifest.json").exists()

    def test_exit_code_zero(self, site_dir):
        """Build should succeed with favicon disabled."""
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0


class TestFaviconFeatureEnabled:
    """When features.favicon is true, favicon assets and manifest are generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Enable favicon
        config_path = site / "site.dev.json"
        config = json.loads(config_path.read_text())
        config["features"]["favicon"] = True
        config_path.write_text(json.dumps(config, indent=2) + "\n")

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_favicon_svg_generated(self, built_site):
        dist = built_site / "dist"
        assert (dist / "favicon.svg").exists()

    def test_favicon_ico_generated(self, built_site):
        dist = built_site / "dist"
        assert (dist / "favicon.ico").exists()

    def test_favicon_pngs_generated(self, built_site):
        dist = built_site / "dist"
        png_favicons = list(dist.glob("favicon-*.png"))
        assert len(png_favicons) > 0

    def test_manifest_generated(self, built_site):
        dist = built_site / "dist"
        manifest = dist / "manifest.json"
        assert manifest.exists()
        data = json.loads(manifest.read_text())
        assert "icons" in data

    def test_exit_code_zero(self, site_dir):
        """Build should succeed with favicon enabled."""
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0
