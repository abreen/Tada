import json

import pytest

from conftest import run_tada, set_site_config


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
        assert "nav.json" in result.stdout
        assert "/nonexistent.html" in result.stdout


class TestBrokenParentLink:
    """A broken parent link in front matter fails the build."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        (site / "content" / "page.md").write_text(
            "---\ntitle: Page\nparent: /nonexistent.html\nparentLabel: Missing\n---\n\nContent.\n"
        )

        yield site

    def test_build_fails(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0
        assert "parent" in result.stdout.lower()
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
            "---\ntitle: Page\n---\n\nSee [the partial](/_partial.html).\n"
        )

        yield site

    def test_build_fails(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0
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
            "---\ntitle: Page\n---\n\nDownload [the data](/data.csv).\n"
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
            "---\ntitle: Page\n---\n\nSee [the report](/report/index.html).\n"
        )

        yield site

    def test_build_succeeds(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"build failed: {result.stderr}"

    def test_directory_link_rejected(self, site_dir):
        """Linking to /report/ instead of /report/index.html is an error."""
        (site_dir / "content" / "page.md").write_text(
            "---\ntitle: Page\n---\n\nSee [the report](/report/).\n"
        )
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0


class TestLinkToPublicCodeFile:
    """A link to a code-extension file in public/ is valid when features.code is on."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        set_site_config(site, {"features": {"code": True}})

        (site / "public" / "Test.java").write_text("public class Test {}\n")
        (site / "content" / "page.md").write_text(
            "---\ntitle: Page\n---\n\nDownload [the code](/Test.java).\n"
        )

        yield site

    def test_build_succeeds(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"build failed: {result.stderr}"

    def test_link_not_rewritten_to_html(self, site_dir):
        """The rendered HTML should link to Test.java, not Test.java.html."""
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"build failed: {result.stderr}"
        html = (site_dir / "dist" / "page.html").read_text()
        assert "/Test.java" in html
        assert "/Test.java.html" not in html


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
        build_dir = site_dir / "dist"
        for html_file in build_dir.rglob("*.html"):
            content = html_file.read_text()
            assert "/nonexistent.html" not in content, (
                f"{html_file.name} contains /nonexistent.html"
            )
