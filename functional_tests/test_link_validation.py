import pytest
from conftest import (
    NAV_CONFIG_FILE,
    init_site,
    load_structured_file,
    run_tada,
    write_structured_file,
)


class TestBrokenNavLink:
    """A broken internal link in the nav config fails the build."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        nav_path = site / NAV_CONFIG_FILE
        nav = load_structured_file(nav_path)
        nav[0]['links'].append({'text': 'Missing', 'internal': '/nonexistent.html'})
        write_structured_file(nav_path, nav)

        yield site

    def test_build_fails(self, site_dir):
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        assert 'nav.yaml' in result.stdout
        assert '/nonexistent.html' in result.stdout


class TestBrokenParentLink:
    """A broken parent link in front matter fails the build."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        (site / 'content' / 'page.md').write_text(
            '---\ntitle: Page\nparent: /nonexistent.html\nparentLabel: Missing\n---\n\nContent.\n'
        )

        yield site

    def test_build_fails(self, site_dir):
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        assert 'parent' in result.stdout.lower()
        assert '/nonexistent.html' in result.stdout


class TestLinkToPartialBroken:
    """Linking to a partial produces a build error."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        (site / 'content' / '_partial.md').write_text('Partial content.\n')
        (site / 'content' / 'page.md').write_text(
            '---\ntitle: Page\n---\n\nSee [the partial](/_partial.html).\n'
        )

        yield site

    def test_build_fails(self, site_dir):
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        assert '/_partial.html' in result.stdout


class TestLinkToPublicFile:
    """A link to a file in public/ is valid."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        (site / 'public' / 'data.csv').write_text('a,b\n1,2\n')
        (site / 'content' / 'page.md').write_text(
            '---\ntitle: Page\n---\n\nDownload [the data](/data.csv).\n'
        )

        yield site

    def test_build_succeeds(self, site_dir):
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, f'build failed: {result.stderr}'


class TestLinkToPublicIndexHtml:
    """A link to index.html inside a public/ subdirectory is valid."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        report_dir = site / 'public' / 'report'
        report_dir.mkdir(parents=True)
        (report_dir / 'index.html').write_text('<html><body>Report</body></html>')
        (site / 'content' / 'page.md').write_text(
            '---\ntitle: Page\n---\n\nSee [the report](/report/index.html).\n'
        )

        yield site

    def test_build_succeeds(self, site_dir):
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, f'build failed: {result.stderr}'

    def test_directory_link_rejected(self, site_dir):
        """Linking to /report/ instead of /report/index.html is an error."""
        (site_dir / 'content' / 'page.md').write_text(
            '---\ntitle: Page\n---\n\nSee [the report](/report/).\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0


class TestLinkToPublicCodeFile:
    """A link to a code-extension file in public/ is valid."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        (site / 'public' / 'Test.java').write_text('public class Test {}\n')
        (site / 'content' / 'page.md').write_text(
            '---\ntitle: Page\n---\n\nDownload [the code](/Test.java).\n'
        )

        yield site

    def test_build_succeeds(self, site_dir):
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, f'build failed: {result.stderr}'

    def test_link_not_rewritten_to_html(self, site_dir):
        """The rendered HTML should link to Test.java, not Test.java.html."""
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, f'build failed: {result.stderr}'
        html = (site_dir / 'dist' / 'page.html').read_text()
        assert '/Test.java' in html
        assert '/Test.java.html' not in html


class TestDisabledNavLinkSkipped:
    """A disabled nav link has no href in the HTML, so it is not validated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        nav_path = site / NAV_CONFIG_FILE
        nav = load_structured_file(nav_path)
        nav[0]['links'].append(
            {'text': 'Coming Soon', 'internal': '/nonexistent.html', 'disabled': True}
        )
        write_structured_file(nav_path, nav)

        yield site

    def test_build_succeeds(self, site_dir):
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, f'build failed: {result.stderr}'
        build_dir = site_dir / 'dist'
        for html_file in build_dir.rglob('*.html'):
            content = html_file.read_text()
            assert '/nonexistent.html' not in content, (
                f'{html_file.name} contains /nonexistent.html'
            )


class TestNavAuthoredTargets:
    def test_encoded_paths_queries_and_fragments_build(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        (site / 'content' / 'my notes.md').write_text(
            '---\ntitle: My notes\n---\n\n## Intro\n\nNotes.\n'
        )
        targets = [
            '/index.html#intro',
            '/index.html?view=full',
            '/my%20notes.html',
            '/my%20notes.html?view=full#intro',
        ]
        write_structured_file(
            site / NAV_CONFIG_FILE,
            [
                {
                    'title': 'Menu',
                    'links': [
                        {'text': f'Page {i}', 'internal': href} for i, href in enumerate(targets)
                    ],
                }
            ],
        )
        result = run_tada('dev', cwd=str(site))
        assert result.returncode == 0, result.stdout + result.stderr
        html = (site / 'dist' / 'index.html').read_text()
        for href in targets:
            assert f'href="{href}"' in html

    @pytest.mark.parametrize(
        'href,diagnostic',
        [
            ('/missing%20page.html?view=full#intro', 'broken internal link'),
            ('index.html?view=full#intro', 'must match pattern'),
        ],
    )
    def test_invalid_targets_still_fail(self, tmp_path, href, diagnostic):
        site = init_site(tmp_path, bare=True)
        write_structured_file(
            site / NAV_CONFIG_FILE,
            [
                {
                    'title': 'Menu',
                    'links': [{'text': 'Invalid', 'internal': href}],
                }
            ],
        )
        result = run_tada('dev', cwd=str(site))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert diagnostic in output
        assert 'nav.yaml' in output


class TestDirectoryConfigLinks:
    @pytest.mark.parametrize('kind', ['nav', 'parent'])
    @pytest.mark.parametrize('href', ['/', '/docs/', '/docs', '/my%20notes/?view=full#intro'])
    def test_directory_alias_requires_explicit_index(self, tmp_path, kind, href):
        site = init_site(tmp_path, bare=True)
        for directory in ['docs', 'my notes']:
            folder = site / 'content' / directory
            folder.mkdir()
            (folder / 'index.md').write_text('---\ntitle: Section\n---\n\nSection.\n')
        if kind == 'nav':
            write_structured_file(
                site / NAV_CONFIG_FILE,
                [{'title': 'Menu', 'links': [{'text': 'Section', 'internal': href}]}],
            )
        else:
            (site / 'content' / 'page.md').write_text(
                f'---\ntitle: Page\nparent: "{href}"\nparentLabel: Section\n---\n\nPage.\n'
            )
        result = run_tada('dev', cwd=str(site))
        output = result.stdout + result.stderr
        assert result.returncode != 0, output
        assert 'directory link must reference index.html explicitly' in output
        assert ('nav.yaml' if kind == 'nav' else 'page.md') in output

    def test_explicit_relative_parent_index_with_suffix_builds(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        folder = site / 'content' / 'my notes'
        folder.mkdir()
        (folder / 'index.md').write_text('---\ntitle: Section\n---\n\nSection.\n')
        (site / 'content' / 'page.md').write_text(
            '---\ntitle: Page\nparent: my%20notes/index.html?view=full#intro\n'
            'parentLabel: Section\n---\n\nPage.\n'
        )
        result = run_tada('dev', cwd=str(site))
        assert result.returncode == 0, result.stdout + result.stderr
        assert (
            'href="my%20notes/index.html?view=full#intro"'
            in (site / 'dist' / 'page.html').read_text()
        )
