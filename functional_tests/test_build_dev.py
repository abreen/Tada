import pytest
from conftest import run_tada, set_site_config


class TestDevBuild:
    def test_creates_dist_directory(self, built_dev_site):
        assert (built_dev_site / 'dist').is_dir()

    def test_produces_index_html(self, built_dev_site):
        index = built_dev_site / 'dist' / 'index.html'
        assert index.exists()
        html = index.read_text()
        assert '<html' in html
        assert '</html>' in html

    def test_produces_css_bundle(self, built_dev_site):
        dist = built_dev_site / 'dist'
        css_files = list(dist.glob('*.bundle.tada-*.css'))
        assert len(css_files) >= 1
        names = [f.name for f in css_files]
        assert any(name.startswith('index.bundle.tada-') for name in names)

    def test_produces_js_bundle(self, built_dev_site):
        dist = built_dev_site / 'dist'
        assert list(dist.glob('index.bundle.tada-*.js'))

    def test_produces_critical_css(self, built_dev_site):
        dist = built_dev_site / 'dist'
        assert list(dist.glob('critical.bundle.tada-*.css'))

    def test_inlines_critical_css_in_html(self, built_dev_site):
        index = built_dev_site / 'dist' / 'index.html'
        html = index.read_text()
        assert '<style>' in html

    def test_produces_font_files(self, built_dev_site):
        dist = built_dev_site / 'dist'
        expected_fonts = [
            'source-serif-4/SourceSerif4-VariableFont_opsz,wght.woff2',
            'source-serif-4/SourceSerif4-Italic-VariableFont_opsz,wght.woff2',
            'libertinus-mono/LibertinusMono-Regular.woff2',
        ]
        for font_path in expected_fonts:
            assert (dist / font_path).is_file()

    def test_produces_no_favicon_files(self, built_dev_site):
        dist = built_dev_site / 'dist'
        assert not (dist / 'favicon.svg').exists()

    def test_produces_no_manifest(self, built_dev_site):
        dist = built_dev_site / 'dist'
        assert not (dist / 'manifest.json').exists()

    def test_exit_code_zero(self, site_dir):
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0

    def test_html_contains_title(self, built_dev_site):
        index = built_dev_site / 'dist' / 'index.html'
        html = index.read_text()
        assert '<title>' in html

    def test_uses_generated_sans_and_standard_appearance_defaults(self, built_dev_site):
        config = (built_dev_site / 'site.dev.yaml').read_text()
        html = (built_dev_site / 'dist' / 'index.html').read_text()
        opening_tag = '<html' + html.split('<html', 1)[1].split('>', 1)[0]

        assert 'defaultFont: sans' in config
        assert 'defaultContrast: standard' in config
        assert 'data-default-font-preference="sans"' in opening_tag
        assert 'data-default-contrast-preference="standard"' in opening_tag
        assert ' data-font-preference=' not in opening_tag
        assert ' data-contrast-preference=' not in opening_tag

    def test_builds_configured_appearance_defaults_and_preloads_their_fonts(self, site_dir):
        set_site_config(
            site_dir,
            {'defaultFont': 'serif', 'defaultContrast': 'high'},
        )

        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, f'dev build failed: {result.stderr}'

        html = (site_dir / 'dist' / 'index.html').read_text()
        opening_tag = '<html' + html.split('<html', 1)[1].split('>', 1)[0]
        assert 'data-default-font-preference="serif"' in opening_tag
        assert 'data-default-contrast-preference="high"' in opening_tag
        assert 'data-font-preference="serif"' in opening_tag
        assert 'data-contrast-preference="high"' in opening_tag
        assert 'href="/source-serif-4/SourceSerif4-VariableFont_opsz,wght.woff2"' in html
        assert 'href="/libertinus-mono/LibertinusMono-Regular.woff2"' in html
        assert 'rel="preload" href="/inter/InterVariable.woff2"' not in html
        assert 'rel="preload" href="/google-sans-code/GoogleSansCodeVariable.woff2"' not in html
        assert (
            'data-font-preference-value="serif" aria-label="Use serif fonts" '
            'aria-pressed="true" disabled'
        ) in html
        assert (
            'data-contrast-preference-value="high" aria-label="Use high contrast" '
            'aria-pressed="true" disabled'
        ) in html


class TestDevBuildDefaultContent:
    """Tests that require the full default content tree."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada('init', 'testsite', '--no-interactive', cwd=str(tmp_path))
        assert result.returncode == 0, f'init failed: {result.stderr}'
        site = tmp_path / 'testsite'
        assert site.is_dir()
        yield site

    def test_copies_public_files(self, built_dev_site):
        dist = built_dev_site / 'dist'
        assert (dist / 'test.txt').exists()

    def test_copies_content_assets(self, built_dev_site):
        dist = built_dev_site / 'dist'
        assert (dist / 'lectures' / '01' / 'lecture1.pdf').exists()

    def test_renders_nested_content(self, built_dev_site):
        dist = built_dev_site / 'dist'
        assert (dist / 'lectures' / 'index.html').exists()
        assert (dist / 'lectures' / '01' / 'index.html').exists()

    def test_skipped_content_not_rendered(self, built_dev_site):
        dist = built_dev_site / 'dist'
        # problem_sets/index.html has skip: true in front matter
        assert not (dist / 'problem_sets' / 'index.html').exists()

    def test_partials_not_rendered_as_pages(self, built_dev_site):
        dist = built_dev_site / 'dist'
        assert not (dist / 'lectures' / '02' / '_pr1.html').exists()
        assert not (dist / 'lectures' / '02' / 'subdir').exists()

    def test_partial_content_included_in_parent(self, built_dev_site):
        page = built_dev_site / 'dist' / 'lectures' / '02' / 'index.html'
        assert page.exists()
        html = page.read_text()
        assert 'Problem 1' in html
        assert 'Problem 2' in html

    def test_nested_markdown_partial_included(self, built_dev_site):
        page = built_dev_site / 'dist' / 'lectures' / '02' / 'index.html'
        html = page.read_text()
        assert 'nested Markdown partial' in html

    def test_template_variables_resolve_in_partials(self, built_dev_site):
        page = built_dev_site / 'dist' / 'lectures' / '02' / 'index.html'
        html = page.read_text()
        # _pr1.md uses <%= page.title %> which should resolve to "Lecture 2"
        assert 'Lecture 2' in html


class TestDevBuildErrors:
    def test_missing_config_exits_1(self, tmp_path):
        result = run_tada('dev', cwd=str(tmp_path))
        assert result.returncode == 1
        assert 'site.dev.yaml' in result.stderr

    def test_processed_content_conflict_with_public_fails_without_publishing(self, site_dir):
        first_build = run_tada('dev', cwd=str(site_dir))
        assert first_build.returncode == 0

        index_html = site_dir / 'dist' / 'index.html'
        before_html = index_html.read_text()

        page = site_dir / 'content' / 'about.md'
        page.write_text('---\ntitle: About\n---\n\nFrom markdown.\n')
        public_file = site_dir / 'public' / 'about.html'
        public_file.write_text('<p>From public</p>\n')

        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 1
        assert 'same path' in result.stderr
        assert index_html.read_text() == before_html
        assert not (site_dir / 'dist' / 'about.html').exists()

    def test_rebuild_removes_deleted_page_outputs(self, site_dir):
        page = site_dir / 'content' / 'about.md'
        page.write_text('---\ntitle: About\n---\n\nAbout page.\n')

        first_build = run_tada('dev', cwd=str(site_dir))
        assert first_build.returncode == 0
        about_html = site_dir / 'dist' / 'about.html'
        assert about_html.exists()

        page.unlink()

        second_build = run_tada('dev', cwd=str(site_dir))
        assert second_build.returncode == 0
        assert not about_html.exists()
