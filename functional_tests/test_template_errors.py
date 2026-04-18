import pytest

from conftest import run_tada


class TestTemplateErrors:
    """Tests for template rendering error handling."""

    def test_undefined_variable_fails_build(self, site_dir):
        """A Markdown file referencing an undefined variable should fail."""
        (site_dir / "content" / "index.md").write_text(
            "---\ntitle: Home\n---\n\n<%= undefinedVariable.foo %>\n"
        )
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert "index.md" in output

    def test_undefined_variable_in_html(self, site_dir):
        """An HTML file referencing an undefined variable should fail."""
        (site_dir / "content" / "index.html").write_text(
            "---\ntitle: Home\n---\n\n<p><%= undefinedVariable.foo %></p>\n"
        )
        # Remove the default index.md so there's no conflict
        index_md = site_dir / "content" / "index.md"
        if index_md.exists():
            index_md.unlink()

        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0

    def test_bad_expression_fails_build(self, site_dir):
        """A file containing an invalid template expression should fail."""
        (site_dir / "content" / "index.md").write_text(
            "---\ntitle: Home\n---\n\n<%= oops. %>\n"
        )
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert "index.md" in output


class TestMissingFrontMatter:
    """Tests for required front matter field validation."""

    def test_missing_title_fails_build(self, site_dir):
        """A markdown page without a title field should fail the build."""
        (site_dir / "content" / "index.md").write_text(
            "Some content.\n"
        )
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0
        output = (result.stdout + result.stderr).lower()
        assert "title" in output

    def test_empty_title_fails_build(self, site_dir):
        """A page with an empty title should fail the build."""
        (site_dir / "content" / "index.md").write_text(
            "---\ntitle:\n---\n\nSome content.\n"
        )
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0
