import json

import pytest

from conftest import run_tada


class TestCodeFeatureDisabled:
    """When features.code is false, code files are not rendered as HTML pages."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Disable the code feature
        config_path = site / "site.dev.json"
        config = json.loads(config_path.read_text())
        config["features"]["code"] = False
        config_path.write_text(json.dumps(config, indent=2) + "\n")

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_no_html_for_java_file(self, built_site):
        """Rectangle.java should NOT produce Rectangle.java.html."""
        dist = built_site / "dist"
        assert not (dist / "lectures" / "01" / "Rectangle.java.html").exists()

    def test_no_html_for_py_file(self, built_site):
        """demo.py should NOT produce demo.py.html."""
        dist = built_site / "dist"
        assert not (dist / "lectures" / "01" / "demo.py.html").exists()

    def test_java_file_copied_as_is(self, built_site):
        """Rectangle.java should be copied unchanged to the output."""
        dist = built_site / "dist"
        output = dist / "lectures" / "01" / "Rectangle.java"
        assert output.exists()
        source = built_site / "content" / "lectures" / "01" / "Rectangle.java"
        assert output.read_text() == source.read_text()

    def test_py_file_copied_as_is(self, built_site):
        """demo.py should be copied unchanged to the output."""
        dist = built_site / "dist"
        output = dist / "lectures" / "01" / "demo.py"
        assert output.exists()
        source = built_site / "content" / "lectures" / "01" / "demo.py"
        assert output.read_text() == source.read_text()

    def test_markdown_links_not_rewritten(self, built_site):
        """Links to .java/.py files in rendered HTML should keep original extensions."""
        html = (built_site / "dist" / "lectures" / "01" / "index.html").read_text()
        assert 'Rectangle.java' in html
        assert 'demo.py' in html
        # The links should NOT have been rewritten to .html
        assert 'Rectangle.java.html' not in html
        assert 'demo.java.html' not in html

    def test_literate_java_page_still_rendered(self, built_site):
        """Pair.java.md should still produce Pair.java.html when code is disabled."""
        dist = built_site / "dist"
        assert (dist / "lectures" / "01" / "Pair.java.html").exists()

    def test_literate_java_source_still_generated(self, built_site):
        """Pair.java.md should still produce Pair.java when code is disabled."""
        dist = built_site / "dist"
        assert (dist / "lectures" / "01" / "Pair.java").exists()

    def test_code_html_link_rejected(self, site_dir):
        """A link to Foo.java.html should fail when features.code is false."""
        content = site_dir / "content" / "test"
        content.mkdir(parents=True)
        (content / "Foo.java").write_text("public class Foo {}\n")
        (content / "index.md").write_text(
            "title: Test\n\n"
            "See [Foo](./Foo.java.html).\n"
        )

        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert "broken internal link" in output

    def test_exit_code_zero(self, site_dir):
        """Build should succeed even with code feature disabled."""
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0


class TestSearchFeatureDisabled:
    """When features.search is false, Pagefind search index is not generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Disable the search feature
        config_path = site / "site.dev.json"
        config = json.loads(config_path.read_text())
        config["features"]["search"] = False
        config_path.write_text(json.dumps(config, indent=2) + "\n")

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_no_pagefind_directory(self, built_site):
        """No pagefind/ directory should exist in the output."""
        dist = built_site / "dist"
        assert not (dist / "pagefind").exists()

    def test_html_pages_still_generated(self, built_site):
        """Content pages should still be rendered even without search."""
        dist = built_site / "dist"
        assert (dist / "index.html").exists()

    def test_exit_code_zero(self, site_dir):
        """Build should succeed with search disabled."""
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0


class TestFaviconFeatureDisabled:
    """When features.favicon is false, no favicon assets or manifest are generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Explicitly disable favicon (it's false by default, but be explicit)
        config_path = site / "site.dev.json"
        config = json.loads(config_path.read_text())
        config["features"]["favicon"] = False
        config_path.write_text(json.dumps(config, indent=2) + "\n")

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_no_favicon_svg(self, built_site):
        dist = built_site / "dist"
        assert not (dist / "favicon.svg").exists()

    def test_no_favicon_ico(self, built_site):
        dist = built_site / "dist"
        assert not (dist / "favicon.ico").exists()

    def test_no_favicon_pngs(self, built_site):
        dist = built_site / "dist"
        png_favicons = list(dist.glob("favicon-*.png"))
        assert len(png_favicons) == 0

    def test_no_manifest(self, built_site):
        dist = built_site / "dist"
        assert not (dist / "manifest.json").exists()

    def test_exit_code_zero(self, site_dir):
        """Build should succeed with favicon disabled."""
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0


class TestFaviconFeatureEnabled:
    """When features.favicon is true, favicon assets and manifest are generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Enable favicon
        config_path = site / "site.dev.json"
        config = json.loads(config_path.read_text())
        config["features"]["favicon"] = True
        config_path.write_text(json.dumps(config, indent=2) + "\n")

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_favicon_svg_generated(self, built_site):
        dist = built_site / "dist"
        assert (dist / "favicon.svg").exists()

    def test_favicon_ico_generated(self, built_site):
        dist = built_site / "dist"
        assert (dist / "favicon.ico").exists()

    def test_favicon_pngs_generated(self, built_site):
        dist = built_site / "dist"
        png_favicons = list(dist.glob("favicon-*.png"))
        assert len(png_favicons) > 0

    def test_manifest_generated(self, built_site):
        dist = built_site / "dist"
        manifest = dist / "manifest.json"
        assert manifest.exists()
        data = json.loads(manifest.read_text())
        assert "icons" in data

    def test_exit_code_zero(self, site_dir):
        """Build should succeed with favicon enabled."""
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0


class TestCodeFeatureEnabled:
    """When features.code is true, code files are rendered as HTML pages."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        yield tmp_path / "testsite"

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_java_file_rendered_as_html(self, built_site):
        """Rectangle.java should produce Rectangle.java.html."""
        dist = built_site / "dist"
        html_file = dist / "lectures" / "01" / "Rectangle.java.html"
        assert html_file.exists()
        html = html_file.read_text()
        assert "<html" in html

    def test_py_file_rendered_as_html(self, built_site):
        """demo.py should produce demo.py.html."""
        dist = built_site / "dist"
        html_file = dist / "lectures" / "01" / "demo.py.html"
        assert html_file.exists()
        html = html_file.read_text()
        assert "<html" in html

    def test_markdown_links_rewritten_to_html(self, built_site):
        """Links to .java/.py in rendered HTML should be rewritten to .java.html/.py.html."""
        html = (built_site / "dist" / "lectures" / "01" / "index.html").read_text()
        assert 'Rectangle.java.html' in html
        assert 'demo.py.html' in html

    def test_no_collision_same_base_name(self, built_site):
        """Files with same base name but different extensions should produce distinct HTML files."""
        dist = built_site / "dist"
        # Rectangle.java should produce Rectangle.java.html
        rectangle_java_html = dist / "lectures" / "01" / "Rectangle.java.html"
        assert rectangle_java_html.exists()
        # rectangle.py should produce rectangle.py.html
        rectangle_py_html = dist / "lectures" / "01" / "rectangle.py.html"
        assert rectangle_py_html.exists()


class TestLiterateJavaPages:
    """Literate Java pages should be rendered with .java.html extension."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        yield tmp_path / "testsite"

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_literate_java_page_has_java_html_extension(self, built_site):
        """Pair.java.md should produce Pair.java.html and Pair.java."""
        dist = built_site / "dist"
        # Pair.java.md is a literate Java page in the example site
        java_html = dist / "lectures" / "01" / "Pair.java.html"
        assert java_html.exists(), f"Expected Pair.java.html to exist at {java_html}"

        # The literate Java page should always produce a .java file
        code_file = dist / "lectures" / "01" / "Pair.java"
        assert code_file.exists(), f"Expected Pair.java to exist at {code_file}"


class TestLiterateJavaLinkNotRewritten:
    """When features.code is true, links to .java files generated by literate
    Java pages should not be rewritten to .java.html."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        content = site / "content" / "test"
        content.mkdir(parents=True)

        # A literate Java file
        (content / "Hello.java.md").write_text(
            "title: Hello\n\n"
            "```java\n"
            "public class Hello {\n"
            "    public static void main(String[] args) {\n"
            '        System.out.println("hi");\n'
            "    }\n"
            "}\n"
            "```\n"
        )

        # A regular code file
        (content / "Plain.java").write_text(
            "public class Plain {}\n"
        )

        # A page that links to both
        (content / "index.md").write_text(
            "title: Test\n\n"
            "* [Hello source](./Hello.java)\n"
            "* [Plain source](./Plain.java)\n"
        )

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_literate_java_link_not_rewritten(self, built_site):
        """Link to Hello.java (literate Java output) should stay as .java."""
        html = (built_site / "dist" / "test" / "index.html").read_text()
        assert 'href="./Hello.java"' in html
        assert 'href="./Hello.java.html"' not in html

    def test_code_page_link_still_rewritten(self, built_site):
        """Link to Plain.java (a code page) should be rewritten to .java.html."""
        html = (built_site / "dist" / "test" / "index.html").read_text()
        assert 'href="./Plain.java.html"' in html


class TestLiterateJavaBrokenLink:
    """A literate Java page with a broken internal link should fail the build."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        content = site / "content" / "test"
        content.mkdir(parents=True)

        (content / "Broken.java.md").write_text(
            "title: Broken\n\n"
            "See [this page](./nonexistent.html).\n\n"
            "```java\n"
            "public class Broken {}\n"
            "```\n"
        )

        yield site

    def test_build_fails(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert "broken internal link" in output


class TestSearchFeatureEnabled:
    """When features.search is true, Pagefind search index is generated."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        yield tmp_path / "testsite"

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("dev", cwd=str(site_dir))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"
        yield site_dir

    def test_pagefind_directory_exists(self, built_site):
        """pagefind/ directory should exist in the output."""
        dist = built_site / "dist"
        assert (dist / "pagefind").is_dir()

    def test_pagefind_has_index_files(self, built_site):
        """pagefind/ should contain index files."""
        pagefind_dir = built_site / "dist" / "pagefind"
        files = list(pagefind_dir.iterdir())
        assert len(files) > 0


class TestCodeProseLinksRewritten:
    """Markdown links in /// comments are rewritten to full URLs in copied source
    files and in data-prose-source attributes."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada(
            "init", "testsite", "--no-interactive",
            "--prod-base-path", "/course",
            "--prod-base", "https://example.edu",
            cwd=str(tmp_path),
        )
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Add a Java file with /// links
        code_dir = site / "content" / "lectures" / "01"
        (code_dir / "Linked.java").write_text(
            '/// See [`helper.py`](./helper.py)\n'
            '/// and [`about`](/about/index.html)\n'
            'public class Linked {}\n'
        )
        (code_dir / "helper.py").write_text("# helper\n")

        yield site

    @pytest.fixture
    def built_site(self, site_dir):
        result = run_tada("prod", cwd=str(site_dir))
        assert result.returncode == 0, f"prod build failed: {result.stderr}"
        yield site_dir

    def test_copied_java_has_full_urls(self, built_site):
        """The copied .java file should contain rewritten full URLs."""
        java_file = (
            built_site / "dist-prod" / "v1" / "lectures" / "01" / "Linked.java"
        )
        content = java_file.read_text()
        assert "https://example.edu/course/lectures/01/helper.py.html" in content
        assert "https://example.edu/course/about/index.html" in content
        # Original relative links should be gone
        assert "(./helper.py)" not in content

    def test_prose_source_has_full_urls(self, built_site):
        """data-prose-source in the HTML page should contain rewritten links."""
        html_file = (
            built_site / "dist-prod" / "v1" / "lectures" / "01" / "Linked.java.html"
        )
        html = html_file.read_text()
        assert "https://example.edu/course/lectures/01/helper.py.html" in html
        assert "https://example.edu/course/about/index.html" in html
