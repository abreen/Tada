import json

import pytest

from conftest import run_tada


class TestProdBuild:
    def test_creates_dist_directory(self, built_prod_site):
        assert (built_prod_site / "dist-prod" / "v1").is_dir()

    def test_produces_index_html(self, built_prod_site):
        index = built_prod_site / "dist-prod" / "v1" / "index.html"
        assert index.exists()

    def test_produces_css_and_js_bundles(self, built_prod_site):
        dist = built_prod_site / "dist-prod" / "v1"
        assert (dist / "index.bundle.css").exists()
        assert (dist / "index.bundle.js").exists()
        assert (dist / "critical.bundle.css").exists()

    def test_no_watch_reload_client_in_prod(self, built_prod_site):
        dist = built_prod_site / "dist-prod" / "v1"
        assert not (dist / "watch-reload-client.bundle.js").exists()

    def test_html_uses_prod_base_path(self, built_prod_site):
        config = json.loads(
            (built_prod_site / "site.prod.json").read_text()
        )
        base_path = config["basePath"]
        index = built_prod_site / "dist-prod" / "v1" / "index.html"
        html = index.read_text()
        assert f"{base_path}index.bundle.css" in html

    def test_exit_code_zero(self, site_dir):
        result = run_tada("prod", cwd=str(site_dir))
        assert result.returncode == 0

    def test_produces_same_pages_as_dev(self, site_dir):
        run_tada("dev", cwd=str(site_dir), check=True)
        dev_htmls = set(
            p.relative_to(site_dir / "dist")
            for p in (site_dir / "dist").rglob("*.html")
            if "pagefind" not in str(p)
        )

        run_tada("prod", cwd=str(site_dir), check=True)
        prod_dist = site_dir / "dist-prod" / "v1"
        prod_htmls = set(
            p.relative_to(prod_dist)
            for p in prod_dist.rglob("*.html")
            if "pagefind" not in str(p)
        )

        assert dev_htmls == prod_htmls


class TestProdBuildWithBasePath:
    """Tests for prod builds where basePath is not /."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada(
            "init", "testsite", "--bare", "--no-interactive",
            "--prod-base-path", "/test",
            "--prod-base", "https://example.edu",
            cwd=str(tmp_path),
        )
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Add a second page so we can link to it
        about_dir = site / "content" / "about"
        about_dir.mkdir()
        (about_dir / "index.md").write_text(
            "title: About\n\nThis is the about page.\n"
        )

        # Rewrite index.md with links in both Markdown and HTML syntax
        (site / "content" / "index.md").write_text(
            "title: Home\n\n"
            "[About page](/about/index.html)\n\n"
            '<a href="/about/index.html">HTML link</a>\n\n'
            "![Logo](/images/logo.png)\n\n"
            '<img src="/images/banner.png" alt="Banner">\n'
        )

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("prod", cwd=str(site_dir))
        assert result.returncode == 0, f"prod build failed: {result.stderr}"
        yield site_dir

    def test_creates_dist_prod_directory(self, built_site):
        assert (built_site / "dist-prod" / "v1").is_dir()

    def test_head_asset_links_include_base_path(self, built_site):
        html = (built_site / "dist-prod" / "v1" / "index.html").read_text()
        assert "/test/index.bundle.css" in html
        assert "/test/index.bundle.js" in html

    def test_markdown_links_include_base_path(self, built_site):
        html = (built_site / "dist-prod" / "v1" / "index.html").read_text()
        assert 'href="/test/about/index.html"' in html

    def test_raw_html_links_include_base_path(self, built_site):
        html = (built_site / "dist-prod" / "v1" / "index.html").read_text()
        assert '<a href="/test/about/index.html">HTML link</a>' in html

    def test_markdown_images_include_base_path(self, built_site):
        html = (built_site / "dist-prod" / "v1" / "index.html").read_text()
        assert 'src="/test/images/logo.png"' in html

    def test_raw_html_images_include_base_path(self, built_site):
        html = (built_site / "dist-prod" / "v1" / "index.html").read_text()
        assert 'src="/test/images/banner.png"' in html


class TestProdBuildErrors:
    def test_missing_config_exits_1(self, tmp_path):
        result = run_tada("prod", cwd=str(tmp_path))
        assert result.returncode == 1
        assert "site.prod.json" in result.stderr
