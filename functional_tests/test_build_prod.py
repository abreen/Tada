import re

import pytest
from conftest import SITE_PROD_CONFIG_FILE, init_site, load_structured_file, run_tada


class TestProdBuild:
    def test_creates_dist_directory(self, built_prod_site):
        assert (built_prod_site / 'dist-prod' / 'v1').is_dir()

    def test_produces_index_html(self, built_prod_site):
        index = built_prod_site / 'dist-prod' / 'v1' / 'index.html'
        assert index.exists()

    def test_produces_css_and_js_bundles(self, built_prod_site):
        dist = built_prod_site / 'dist-prod' / 'v1'
        assert list(dist.glob('index.bundle.tada-*.css'))
        assert list(dist.glob('index.bundle.tada-*.js'))
        assert list(dist.glob('critical.bundle.tada-*.css'))

    def test_no_watch_reload_client_in_prod(self, built_prod_site):
        dist = built_prod_site / 'dist-prod' / 'v1'
        assert not list(dist.glob('watch-reload-client.bundle.tada-*.js'))

    def test_html_uses_prod_base_path(self, built_prod_site):
        config = load_structured_file(built_prod_site / SITE_PROD_CONFIG_FILE)
        base_path = config['basePath']
        index = built_prod_site / 'dist-prod' / 'v1' / 'index.html'
        html = index.read_text()
        assert f'{base_path}index.bundle.tada-' in html

    def test_produces_same_pages_as_dev(self, site_dir):
        run_tada('dev', cwd=str(site_dir), check=True)
        dev_htmls = set(
            p.relative_to(site_dir / 'dist')
            for p in (site_dir / 'dist').rglob('*.html')
            if 'pagefind' not in str(p)
        )

        run_tada('prod', cwd=str(site_dir), check=True)
        prod_dist = site_dir / 'dist-prod' / 'v1'
        prod_htmls = set(
            p.relative_to(prod_dist) for p in prod_dist.rglob('*.html') if 'pagefind' not in str(p)
        )

        assert dev_htmls == prod_htmls


class TestProdBuildWithBasePath:
    """Tests for prod builds where basePath is not /."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(
            tmp_path,
            bare=True,
            extra_args=[
                '--prod-base-path',
                '/test',
                '--prod-base',
                'https://example.edu',
            ],
        )

        # Add a second page so we can link to it
        about_dir = site / 'content' / 'about'
        about_dir.mkdir()
        (about_dir / 'index.md').write_text('---\ntitle: About\n---\n\nThis is the about page.\n')

        # Rewrite index.md with links in both Markdown and HTML syntax
        (site / 'content' / 'index.md').write_text(
            '---\ntitle: Home\n---\n\n'
            '[About page](/about/index.html)\n\n'
            '<a href="/about/index.html">HTML link</a>\n\n'
            '![Logo](/images/logo.png)\n\n'
            '<img src="/images/banner.png" alt="Banner">\n'
        )

        yield site

    def test_creates_dist_prod_directory(self, built_prod_site):
        assert (built_prod_site / 'dist-prod' / 'v1').is_dir()

    def test_head_asset_links_include_base_path(self, built_prod_site):
        html = (built_prod_site / 'dist-prod' / 'v1' / 'index.html').read_text()
        assert re.search(r'/test/index\.bundle\.tada-[^"]+\.css', html)
        assert re.search(r'/test/index\.bundle\.tada-[^"]+\.js', html)

    def test_markdown_links_include_base_path(self, built_prod_site):
        html = (built_prod_site / 'dist-prod' / 'v1' / 'index.html').read_text()
        assert 'href="/test/about/index.html"' in html

    def test_raw_html_links_include_base_path(self, built_prod_site):
        html = (built_prod_site / 'dist-prod' / 'v1' / 'index.html').read_text()
        assert '<a href="/test/about/index.html">HTML link</a>' in html

    def test_markdown_images_include_base_path(self, built_prod_site):
        html = (built_prod_site / 'dist-prod' / 'v1' / 'index.html').read_text()
        assert 'src="/test/images/logo.png"' in html

    def test_raw_html_images_include_base_path(self, built_prod_site):
        html = (built_prod_site / 'dist-prod' / 'v1' / 'index.html').read_text()
        assert 'src="/test/images/banner.png"' in html


class TestProdBuildErrors:
    def test_missing_config_exits_1(self, tmp_path):
        result = run_tada('prod', cwd=str(tmp_path))
        assert result.returncode == 1
        assert 'site.prod.yaml' in result.stderr
