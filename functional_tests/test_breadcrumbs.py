import pytest

from conftest import run_tada


class TestBreadcrumbs:
    """Pages with parent/parentLabel front matter render a breadcrumb link."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        lectures_dir = site / "content" / "lectures"
        lectures_dir.mkdir()
        (lectures_dir / "index.md").write_text(
            "---\ntitle: Lectures\n---\n\nLecture listing.\n"
        )
        (lectures_dir / "first.md").write_text(
            "---\n"
            "title: First Lecture\n"
            "parent: /lectures/index.html\n"
            "parentLabel: Back to lectures\n"
            "---\n\n"
            "Content here.\n"
        )

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        return site_dir

    def test_breadcrumb_link_present(self, built_site):
        html = (built_site / "dist" / "lectures" / "first.html").read_text()
        assert 'class="breadcrumb"' in html

    def test_breadcrumb_href_correct(self, built_site):
        html = (built_site / "dist" / "lectures" / "first.html").read_text()
        assert 'href="/lectures/index.html"' in html

    def test_breadcrumb_label_correct(self, built_site):
        html = (built_site / "dist" / "lectures" / "first.html").read_text()
        assert "Back to lectures" in html

    def test_page_without_parent_has_no_breadcrumb(self, built_site):
        html = (built_site / "dist" / "index.html").read_text()
        assert 'class="breadcrumb"' not in html
