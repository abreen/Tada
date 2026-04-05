import json

import pytest

from conftest import run_tada


class TestBrokenNavLink:
    """A broken internal link in nav.json fails the build."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        nav_path = site / "nav.json"
        nav = json.loads(nav_path.read_text())
        nav[0]["links"].append({"text": "Missing", "internal": "/nonexistent.html"})
        nav_path.write_text(json.dumps(nav, indent=2) + "\n")

        yield site

    def test_build_fails(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0

    def test_error_mentions_nav_json(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert "nav.json" in result.stdout

    def test_error_mentions_broken_path(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert "/nonexistent.html" in result.stdout


class TestBrokenParentLink:
    """A broken parent link in front matter fails the build."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        (site / "content" / "page.md").write_text(
            "title: Page\nparent: /nonexistent.html\nparentLabel: Missing\n\nContent.\n"
        )

        yield site

    def test_build_fails(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0

    def test_error_mentions_parent(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert "parent" in result.stdout.lower()

    def test_error_mentions_broken_path(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert "/nonexistent.html" in result.stdout


class TestLinkToPartialBroken:
    """Linking to a partial produces a build error."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        (site / "content" / "_partial.md").write_text("Partial content.\n")
        (site / "content" / "page.md").write_text(
            "title: Page\n\nSee [the partial](/_partial.html).\n"
        )

        yield site

    def test_build_fails(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0

    def test_error_mentions_broken_path(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert "/_partial.html" in result.stdout


class TestLinkToPublicFile:
    """A link to a file in public/ is valid."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        (site / "public" / "data.csv").write_text("a,b\n1,2\n")
        (site / "content" / "page.md").write_text(
            "title: Page\n\nDownload [the data](/data.csv).\n"
        )

        yield site

    def test_build_succeeds(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"build failed: {result.stderr}"


class TestLinkToPublicIndexHtml:
    """A link to index.html inside a public/ subdirectory is valid."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        report_dir = site / "public" / "report"
        report_dir.mkdir(parents=True)
        (report_dir / "index.html").write_text("<html><body>Report</body></html>")
        (site / "content" / "page.md").write_text(
            "title: Page\n\nSee [the report](/report/index.html).\n"
        )

        yield site

    def test_build_succeeds(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"build failed: {result.stderr}"

    def test_directory_link_rejected(self, site_dir):
        """Linking to /report/ instead of /report/index.html is an error."""
        (site_dir / "content" / "page.md").write_text(
            "title: Page\n\nSee [the report](/report/).\n"
        )
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0


class TestDisabledNavLinkSkipped:
    """A disabled nav link has no href in the HTML, so it is not validated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        nav_path = site / "nav.json"
        nav = json.loads(nav_path.read_text())
        nav[0]["links"].append(
            {"text": "Coming Soon", "internal": "/nonexistent.html", "disabled": True}
        )
        nav_path.write_text(json.dumps(nav, indent=2) + "\n")

        yield site

    def test_build_succeeds(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"build failed: {result.stderr}"

    def test_nonexistent_link_not_in_html(self, site_dir):
        run_tada("dev", cwd=str(site_dir))
        build_dir = site_dir / "_build"
        for html_file in build_dir.rglob("*.html"):
            content = html_file.read_text()
            assert "/nonexistent.html" not in content, (
                f"{html_file.name} contains /nonexistent.html"
            )
