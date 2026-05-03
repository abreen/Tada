import pytest
from conftest import AUTHORS_CONFIG_FILE, init_site, run_tada, write_structured_file


class TestAuthorsFeature:
    """Tests for the authors config feature."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        # Create avatar images in public/ so link validation passes
        images_dir = site / 'public' / 'images'
        images_dir.mkdir(parents=True, exist_ok=True)
        (images_dir / 'jdoe.png').write_bytes(b'\x89PNG\r\n\x1a\n')
        (images_dir / 'asmith.png').write_bytes(b'\x89PNG\r\n\x1a\n')

        # Create authors.yaml in the config directory
        write_structured_file(
            site / AUTHORS_CONFIG_FILE,
            {
                'jdoe': {
                    'name': 'Jane Doe',
                    'avatar': '/images/jdoe.png',
                },
                'asmith': {
                    'name': 'Alice Smith',
                    'avatar': '/images/asmith.png',
                },
            },
        )

        yield site

    def test_author_name_appears_in_html(self, site_dir):
        """A page with author: jdoe should resolve to the author's name."""
        (site_dir / 'content' / 'index.md').write_text(
            '---\ntitle: Home\nauthor: jdoe\n---\n\nHello world.\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, f'dev build failed: {result.stderr}'

        html = (site_dir / 'dist' / 'index.html').read_text()
        assert 'Jane Doe' in html

    def test_author_avatar_appears_in_html(self, site_dir):
        """The author's avatar path should appear in the rendered page."""
        (site_dir / 'content' / 'index.md').write_text(
            '---\ntitle: Home\nauthor: jdoe\n---\n\nHello world.\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, f'dev build failed: {result.stderr}'

        html = (site_dir / 'dist' / 'index.html').read_text()
        assert '/images/jdoe.png' in html

    def test_author_external_profile_url_is_encoded(self, site_dir):
        """External author profile URLs should pass validation and render encoded."""
        authors_path = site_dir / AUTHORS_CONFIG_FILE
        write_structured_file(
            authors_path,
            {
                'jdoe': {
                    'name': 'Jane Doe',
                    'avatar': '/images/jdoe.png',
                    'url': ('https://example.com/people/Jane Doe?q=hello%20world<tag>"'),
                }
            },
        )
        (site_dir / 'content' / 'index.md').write_text(
            '---\ntitle: Home\nauthor: jdoe\n---\n\nHello world.\n'
        )

        result = run_tada('dev', cwd=str(site_dir))

        assert result.returncode == 0, f'dev build failed: {result.stderr}'
        html = (site_dir / 'dist' / 'index.html').read_text()
        assert 'href="https://example.com/people/Jane%20Doe?q=hello%20world%3Ctag%3E%22"' in html
        assert 'hello%2520world' not in html

    def test_unknown_author_fails_build(self, site_dir):
        """Referencing an author not in the authors config should fail the build."""
        (site_dir / 'content' / 'index.md').write_text(
            '---\ntitle: Home\nauthor: nobody\n---\n\nContent.\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert 'nobody' in output

    def test_author_without_authors_json_fails(self, tmp_path):
        """Using author front matter without an authors config should fail."""
        site = init_site(tmp_path, bare=True)

        (site / 'content' / 'index.md').write_text(
            '---\ntitle: Home\nauthor: someone\n---\n\nContent.\n'
        )
        result = run_tada('dev', cwd=str(site))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert 'authors.yaml' in output

    def test_page_without_author_still_builds(self, site_dir):
        """Pages without an author field should build fine."""
        (site_dir / 'content' / 'index.md').write_text('---\ntitle: Home\n---\n\nNo author here.\n')
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0
