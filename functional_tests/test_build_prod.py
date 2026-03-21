import json

from conftest import run_tada


class TestProdBuild:
    def test_creates_dist_directory(self, built_prod_site):
        assert (built_prod_site / "dist").is_dir()

    def test_produces_index_html(self, built_prod_site):
        index = built_prod_site / "dist" / "index.html"
        assert index.exists()

    def test_produces_css_and_js_bundles(self, built_prod_site):
        dist = built_prod_site / "dist"
        assert (dist / "index.bundle.css").exists()
        assert (dist / "index.bundle.js").exists()
        assert (dist / "critical.bundle.css").exists()

    def test_no_watch_reload_client_in_prod(self, built_prod_site):
        dist = built_prod_site / "dist"
        assert not (dist / "watch-reload-client.bundle.js").exists()

    def test_html_uses_prod_base_path(self, built_prod_site):
        config = json.loads(
            (built_prod_site / "site.prod.json").read_text()
        )
        base_path = config["basePath"]
        index = built_prod_site / "dist" / "index.html"
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

        run_tada("clean", cwd=str(site_dir))
        run_tada("prod", cwd=str(site_dir), check=True)
        prod_htmls = set(
            p.relative_to(site_dir / "dist")
            for p in (site_dir / "dist").rglob("*.html")
            if "pagefind" not in str(p)
        )

        assert dev_htmls == prod_htmls


class TestProdBuildErrors:
    def test_missing_config_exits_1(self, tmp_path):
        result = run_tada("prod", cwd=str(tmp_path))
        assert result.returncode == 1
        assert "site.prod.json" in result.stderr
