import pytest

from conftest import run_tada, set_site_config


class TestSearchFeatureDisabled:
    """When features.search is false, Pagefind search index is not generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        set_site_config(site, {"features": {"search": False}})

        yield site

    def test_no_pagefind_directory(self, built_dev_site):
        """No pagefind/ directory should exist in the output."""
        dist = built_dev_site / "dist"
        assert not (dist / "pagefind").exists()

    def test_html_pages_still_generated(self, built_dev_site):
        """Content pages should still be rendered even without search."""
        dist = built_dev_site / "dist"
        assert (dist / "index.html").exists()

    def test_exit_code_zero(self, site_dir):
        """Build should succeed with search disabled."""
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0


class TestSearchFeatureEnabled:
    """When features.search is true, Pagefind search index is generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        yield tmp_path / "testsite"

    def test_pagefind_directory_exists(self, built_dev_site):
        """pagefind/ directory should exist in the output."""
        dist = built_dev_site / "dist"
        assert (dist / "pagefind").is_dir()

    def test_pagefind_has_index_files(self, built_dev_site):
        """pagefind/ should contain index files."""
        pagefind_dir = built_dev_site / "dist" / "pagefind"
        files = list(pagefind_dir.iterdir())
        assert len(files) > 0
