import json

import pytest

from conftest import run_tada


class TestCodeFeatureDisabled:
    """When features.code is false, code files are not rendered as HTML pages."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Disable the code feature
        config_path = site / "site.dev.json"
        config = json.loads(config_path.read_text())
        config["features"]["code"] = False
        config_path.write_text(json.dumps(config, indent=2) + "\n")

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_no_html_for_java_file(self, built_site):
        """Rectangle.java should NOT produce Rectangle.html."""
        dist = built_site / "dist"
        assert not (dist / "lectures" / "01" / "Rectangle.html").exists()

    def test_no_html_for_py_file(self, built_site):
        """demo.py should NOT produce demo.html."""
        dist = built_site / "dist"
        assert not (dist / "lectures" / "01" / "demo.html").exists()

    def test_java_file_copied_as_is(self, built_site):
        """Rectangle.java should be copied unchanged to the output."""
        dist = built_site / "dist"
        output = dist / "lectures" / "01" / "Rectangle.java"
        assert output.exists()
        source = built_site / "content" / "lectures" / "01" / "Rectangle.java"
        assert output.read_text() == source.read_text()

    def test_py_file_copied_as_is(self, built_site):
        """demo.py should be copied unchanged to the output."""
        dist = built_site / "dist"
        output = dist / "lectures" / "01" / "demo.py"
        assert output.exists()
        source = built_site / "content" / "lectures" / "01" / "demo.py"
        assert output.read_text() == source.read_text()

    def test_markdown_links_not_rewritten(self, built_site):
        """Links to .java/.py files in rendered HTML should keep original extensions."""
        html = (built_site / "dist" / "lectures" / "01" / "index.html").read_text()
        assert 'Rectangle.java' in html
        assert 'demo.py' in html
        # The links should NOT have been rewritten to .html
        assert 'Rectangle.html' not in html
        assert 'demo.html' not in html

    def test_exit_code_zero(self, site_dir):
        """Build should succeed even with code feature disabled."""
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0


class TestSearchFeatureDisabled:
    """When features.search is false, Pagefind search index is not generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Disable the search feature
        config_path = site / "site.dev.json"
        config = json.loads(config_path.read_text())
        config["features"]["search"] = False
        config_path.write_text(json.dumps(config, indent=2) + "\n")

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_no_pagefind_directory(self, built_site):
        """No pagefind/ directory should exist in the output."""
        dist = built_site / "dist"
        assert not (dist / "pagefind").exists()

    def test_html_pages_still_generated(self, built_site):
        """Content pages should still be rendered even without search."""
        dist = built_site / "dist"
        assert (dist / "index.html").exists()

    def test_exit_code_zero(self, site_dir):
        """Build should succeed with search disabled."""
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0


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


class TestCodeFeatureEnabled:
    """When features.code is true, code files are rendered as HTML pages."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        yield tmp_path / "testsite"

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_java_file_rendered_as_html(self, built_site):
        """Rectangle.java should produce Rectangle.html."""
        dist = built_site / "dist"
        html_file = dist / "lectures" / "01" / "Rectangle.html"
        assert html_file.exists()
        html = html_file.read_text()
        assert "<html" in html

    def test_py_file_rendered_as_html(self, built_site):
        """demo.py should produce demo.html."""
        dist = built_site / "dist"
        html_file = dist / "lectures" / "01" / "demo.html"
        assert html_file.exists()
        html = html_file.read_text()
        assert "<html" in html

    def test_markdown_links_rewritten_to_html(self, built_site):
        """Links to .java/.py in rendered HTML should be rewritten to .html."""
        html = (built_site / "dist" / "lectures" / "01" / "index.html").read_text()
        assert 'Rectangle.html' in html
        assert 'demo.html' in html


class TestSearchFeatureEnabled:
    """When features.search is true, Pagefind search index is generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        yield tmp_path / "testsite"

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_pagefind_directory_exists(self, built_site):
        """pagefind/ directory should exist in the output."""
        dist = built_site / "dist"
        assert (dist / "pagefind").is_dir()

    def test_pagefind_has_index_files(self, built_site):
        """pagefind/ should contain index files."""
        pagefind_dir = built_site / "dist" / "pagefind"
        files = list(pagefind_dir.iterdir())
        assert len(files) > 0
