import pytest
from conftest import init_site, run_tada, set_site_config

MARKER = '123456789'


def _init_code_site(tmp_path):
    site = init_site(tmp_path, bare=True)
    lectures_dir = site / 'content' / 'lectures' / '01'
    lectures_dir.mkdir(parents=True, exist_ok=True)

    (site / 'content' / 'lectures' / 'index.md').write_text(
        '---\ntitle: Lectures\n---\n\n[Lecture 1](./01/index.html)\n'
    )
    (lectures_dir / 'index.md').write_text(
        '---\ntitle: Lecture 1\n---\n\n'
        '* [Rectangle source](./Rectangle.java)\n'
        '* [Python demo](./demo.py)\n'
    )
    (lectures_dir / 'Rectangle.java').write_text(
        'public class Rectangle {\n  int width = 3;\n  int height = 4;\n}\n'
    )
    (lectures_dir / 'demo.py').write_text('value = 3\nprint(value)\n')
    (lectures_dir / 'rectangle.py').write_text("name = 'lowercase'\n")
    (lectures_dir / 'Pair.java.md').write_text(
        '---\ntitle: Pair\n---\n\n'
        '```java\n'
        'public class Pair {\n'
        '  public static void main(String[] args) {\n'
        '    System.out.println("pair");\n'
        '  }\n'
        '}\n'
        '```\n'
    )
    return site


def _write_marker_code_files(site):
    """Create a .py and a .java file under content/ that both reference
    <%= vars.foobar %>. Used by the templating functional tests."""
    code_dir = site / 'content' / 'marker'
    code_dir.mkdir(parents=True, exist_ok=True)
    (code_dir / 'marker.py').write_text("# marker = <%= vars.foobar %>\nprint('hi')\n")
    (code_dir / 'Marker.java').write_text(
        '/// marker = <%= vars.foobar %>\npublic class Marker {}\n'
    )
    (code_dir / 'index.md').write_text('---\ntitle: Marker\n---\n')


class TestCodeFeatureDisabled:
    """When no source-code extensions are mapped, code files stay raw."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = _init_code_site(tmp_path)
        set_site_config(site, {'extensionToShikiLanguage': {}})
        yield site

    def test_no_html_for_java_file(self, built_dev_site):
        """Rectangle.java should NOT produce Rectangle.java.html."""
        dist = built_dev_site / 'dist'
        assert not (dist / 'lectures' / '01' / 'Rectangle.java.html').exists()

    def test_no_html_for_py_file(self, built_dev_site):
        """demo.py should NOT produce demo.py.html."""
        dist = built_dev_site / 'dist'
        assert not (dist / 'lectures' / '01' / 'demo.py.html').exists()

    def test_java_file_copied_as_is(self, built_dev_site):
        """Rectangle.java should be copied unchanged to the output."""
        dist = built_dev_site / 'dist'
        output = dist / 'lectures' / '01' / 'Rectangle.java'
        assert output.exists()
        source = built_dev_site / 'content' / 'lectures' / '01' / 'Rectangle.java'
        assert output.read_text() == source.read_text()

    def test_py_file_copied_as_is(self, built_dev_site):
        """demo.py should be copied unchanged to the output."""
        dist = built_dev_site / 'dist'
        output = dist / 'lectures' / '01' / 'demo.py'
        assert output.exists()
        source = built_dev_site / 'content' / 'lectures' / '01' / 'demo.py'
        assert output.read_text() == source.read_text()

    def test_markdown_links_not_rewritten(self, built_dev_site):
        """Links to .java/.py files in rendered HTML should keep original extensions."""
        html = (built_dev_site / 'dist' / 'lectures' / '01' / 'index.html').read_text()
        assert 'Rectangle.java' in html
        assert 'demo.py' in html
        # The links should NOT have been rewritten to .html
        assert 'Rectangle.java.html' not in html
        assert 'demo.py.html' not in html

    def test_literate_java_page_still_rendered(self, built_dev_site):
        """Pair.java.md should still produce Pair.java.html when no mappings exist."""
        dist = built_dev_site / 'dist'
        assert (dist / 'lectures' / '01' / 'Pair.java.html').exists()

    def test_literate_java_source_still_generated(self, built_dev_site):
        """Pair.java.md should still produce Pair.java when no mappings exist."""
        dist = built_dev_site / 'dist'
        assert (dist / 'lectures' / '01' / 'Pair.java').exists()

    def test_code_html_link_rejected(self, site_dir):
        """A link to Foo.java.html should fail when .java is not mapped."""
        content = site_dir / 'content' / 'test'
        content.mkdir(parents=True)
        (content / 'Foo.java').write_text('public class Foo {}\n')
        (content / 'index.md').write_text('---\ntitle: Test\n---\n\nSee [Foo](./Foo.java.html).\n')

        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert 'broken internal link' in output

    def test_exit_code_zero(self, site_dir):
        """Build should succeed even when no code-page mappings are configured."""
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0


class TestCodeFeatureEnabled:
    """Mapped source-code extensions produce rendered HTML pages."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = _init_code_site(tmp_path)
        set_site_config(site, {'extensionToShikiLanguage': {'java': 'java', 'py': 'python'}})
        yield site

    def test_java_file_rendered_as_html(self, built_dev_site):
        """Rectangle.java should produce Rectangle.java.html."""
        dist = built_dev_site / 'dist'
        html_file = dist / 'lectures' / '01' / 'Rectangle.java.html'
        assert html_file.exists()
        html = html_file.read_text()
        assert '<html' in html

    def test_py_file_rendered_as_html(self, built_dev_site):
        """demo.py should produce demo.py.html."""
        dist = built_dev_site / 'dist'
        html_file = dist / 'lectures' / '01' / 'demo.py.html'
        assert html_file.exists()
        html = html_file.read_text()
        assert '<html' in html

    def test_markdown_links_rewritten_to_html(self, built_dev_site):
        """Links to .java/.py in rendered HTML should be rewritten to .java.html/.py.html."""
        html = (built_dev_site / 'dist' / 'lectures' / '01' / 'index.html').read_text()
        assert 'Rectangle.java.html' in html
        assert 'demo.py.html' in html

    def test_no_collision_same_base_name(self, built_dev_site):
        """Files with same base name but different extensions should produce distinct HTML files."""
        dist = built_dev_site / 'dist'
        # Rectangle.java should produce Rectangle.java.html
        rectangle_java_html = dist / 'lectures' / '01' / 'Rectangle.java.html'
        assert rectangle_java_html.exists()
        # rectangle.py should produce rectangle.py.html
        rectangle_py_html = dist / 'lectures' / '01' / 'rectangle.py.html'
        assert rectangle_py_html.exists()


class TestCodeProseLinksRewritten:
    """Markdown links in /// comments are rewritten to full URLs in copied source
    files and in data-prose-source attributes."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(
            tmp_path,
            bare=True,
            extra_args=[
                '--prod-base-path',
                '/course',
                '--prod-base',
                'https://example.edu',
            ],
        )
        set_site_config(
            site,
            {'extensionToShikiLanguage': {'java': 'java', 'py': 'python'}},
        )
        set_site_config(
            site,
            {'extensionToShikiLanguage': {'java': 'java', 'py': 'python'}},
            config_file='site.prod.json',
        )

        # Add a Java file with /// links
        code_dir = site / 'content' / 'lectures' / '01'
        code_dir.mkdir(parents=True, exist_ok=True)
        (code_dir / 'Linked.java').write_text(
            '/// See [`helper.py`](./helper.py)\n'
            '/// and [`about`](/about/index.html)\n'
            'public class Linked {}\n'
        )
        (code_dir / 'helper.py').write_text('# helper\n')
        about_dir = site / 'content' / 'about'
        about_dir.mkdir(parents=True, exist_ok=True)
        (about_dir / 'index.md').write_text('---\ntitle: About\n---\n\nAbout page.\n')

        yield site

    def test_copied_java_has_full_urls(self, built_prod_site):
        """The copied .java file should contain rewritten full URLs."""
        java_file = built_prod_site / 'dist-prod' / 'v1' / 'lectures' / '01' / 'Linked.java'
        content = java_file.read_text()
        assert 'https://example.edu/course/lectures/01/helper.py.html' in content
        assert 'https://example.edu/course/about/index.html' in content
        # Original relative links should be gone
        assert '(./helper.py)' not in content

    def test_prose_source_has_full_urls(self, built_prod_site):
        """data-prose-source in the HTML page should contain rewritten links."""
        html_file = built_prod_site / 'dist-prod' / 'v1' / 'lectures' / '01' / 'Linked.java.html'
        html = html_file.read_text()
        assert 'https://example.edu/course/lectures/01/helper.py.html' in html
        assert 'https://example.edu/course/about/index.html' in html


class TestCodeSourceTemplating:
    """When source-code extensions are mapped, files in content/ are run
    through the Lodash template engine before the code page and the
    downloadable copy are written."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        set_site_config(site, {'vars': {'foobar': MARKER}})
        set_site_config(site, {'extensionToShikiLanguage': {'java': 'java', 'py': 'python'}})
        _write_marker_code_files(site)
        yield site

    def test_py_page_substitutes_vars(self, built_dev_site):
        """marker.py.html should contain the marker value, not the raw
        <%= %> template syntax."""
        html = (built_dev_site / 'dist' / 'marker' / 'marker.py.html').read_text()
        assert MARKER in html
        assert 'vars.foobar' not in html

    def test_py_download_substitutes_vars(self, built_dev_site):
        """The copied marker.py file should have the var substituted."""
        py = (built_dev_site / 'dist' / 'marker' / 'marker.py').read_text()
        assert MARKER in py
        assert '<%= vars.foobar %>' not in py

    def test_java_page_substitutes_vars(self, built_dev_site):
        """Marker.java.html should contain the marker value."""
        html = (built_dev_site / 'dist' / 'marker' / 'Marker.java.html').read_text()
        assert MARKER in html
        assert 'vars.foobar' not in html

    def test_java_download_substitutes_vars(self, built_dev_site):
        """The copied Marker.java file should have the var substituted."""
        java = (built_dev_site / 'dist' / 'marker' / 'Marker.java').read_text()
        assert MARKER in java
        assert '<%= vars.foobar %>' not in java


class TestCodeSourceTemplatingDisabled:
    """When source-code extensions are not mapped, source files are copied as-is."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        set_site_config(site, {'vars': {'foobar': MARKER}})
        set_site_config(site, {'extensionToShikiLanguage': {}})
        _write_marker_code_files(site)
        yield site

    def test_py_download_is_literal_source(self, built_dev_site):
        """When no source-code extensions are mapped, the raw <%= %> syntax is preserved
        and the marker value is NOT substituted."""
        py = (built_dev_site / 'dist' / 'marker' / 'marker.py').read_text()
        assert '<%= vars.foobar %>' in py
        assert MARKER not in py

    def test_java_download_is_literal_source(self, built_dev_site):
        """When no source-code extensions are mapped, the raw <%= %> syntax is preserved
        and the marker value is NOT substituted."""
        java = (built_dev_site / 'dist' / 'marker' / 'Marker.java').read_text()
        assert '<%= vars.foobar %>' in java
        assert MARKER not in java
