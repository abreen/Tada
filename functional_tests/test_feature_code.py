import html
import re

import pytest
from conftest import init_site, run_tada, set_site_config

MARKER = '123456789'


def test_prototype_named_extension_generates_code_page_and_download(tmp_path):
    site = init_site(tmp_path, bare=True)
    set_site_config(
        site, {'extensionToShikiLanguage': {'__proto__': 'text'}, 'basePath': '/course'}
    )
    (site / 'content' / 'sample.__proto__').write_text(
        'mapping = <%= site.extensionToShikiLanguage["__proto__"] %>\n'
        'own = <%= site.extensionToShikiLanguage.hasOwnProperty("__proto__") %>\n'
        'object = <%= site.extensionToShikiLanguage.toString() %>\n'
    )
    (site / 'content' / 'index.md').write_text(
        '---\ntitle: Home\n---\n\n[Source](./sample.__proto__)\n'
    )
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    page = (site / 'dist' / 'sample.__proto__.html').read_text()
    assert 'language-text' in page
    assert 'download="sample.__proto__"' in page
    assert (site / 'dist' / 'sample.__proto__').read_text() == (
        'mapping = text\nown = true\nobject = [object Object]\n'
    )
    index = (site / 'dist' / 'index.html').read_text()
    assert '<a href="./sample.__proto__.html" data-tada-page="">Source</a>' in index


@pytest.mark.parametrize('extension', ['JAVA', 'JaVa', 'java'])
@pytest.mark.parametrize('mapped', [True, False])
def test_java_download_prose_links_match_rendered_page(tmp_path, extension, mapped):
    site = init_site(tmp_path, bare=True)
    set_site_config(
        site,
        {
            'base': 'https://example.edu',
            'basePath': '/course',
            'extensionToShikiLanguage': {'java': 'java'} if mapped else {},
        },
    )
    code_dir = site / 'content' / 'examples'
    code_dir.mkdir()
    source = '/// See [Help](../help.html?view=source#part)\npublic class Sample {}\n'
    (code_dir / f'Sample.{extension}').write_text(source)
    (site / 'content' / 'help.md').write_text('---\ntitle: Help\n---\nHelp.\n')

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    downloaded = (site / 'dist' / 'examples' / f'Sample.{extension}').read_text()
    page = site / 'dist' / 'examples' / f'Sample.{extension}.html'
    if mapped:
        target = 'https://example.edu/course/help.html?view=source#part'
        assert f'/// See [Help]({target})\n' in downloaded
        assert target in html.unescape(page.read_text())
        assert f'download="Sample.{extension}"' in page.read_text()
    else:
        assert downloaded == source
        assert not page.exists()
    assert (code_dir / f'Sample.{extension}').read_text() == source


@pytest.mark.parametrize('extension_key', ['TS', 'tS'])
def test_mixed_case_extension_mapping_highlights_and_preserves_source(tmp_path, extension_key):
    site = init_site(tmp_path, bare=True)
    set_site_config(site, {'extensionToShikiLanguage': {extension_key: 'typescript'}})
    source = (
        f'// language: <%= site.extensionToShikiLanguage.{extension_key} %>\n'
        'const value: number = 3;\n'
    )
    (site / 'content' / 'Sample.tS').write_text(source)
    (site / 'content' / 'links.md').write_text('---\ntitle: Links\n---\n\n[Sample](./Sample.tS)\n')

    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    page = (site / 'dist' / 'Sample.tS.html').read_text()
    assert 'language-typescript' in page
    assert 'language-undefined' not in page
    assert '<span style=' in page
    assert 'download="Sample.tS"' in page
    assert 'href="/Sample.tS"' in page
    assert (site / 'dist' / 'Sample.tS').read_text() == (
        '// language: typescript\nconst value: number = 3;\n'
    )
    links = (site / 'dist' / 'links.html').read_text()
    assert '<a href="./Sample.tS.html" data-tada-page="">Sample</a>' in links


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
            config_file='site.prod.yaml',
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


class TestCodeSourceEsTemplateLiteral:
    """`${...}` in mapped source files is literal text, not Lodash syntax."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)
        set_site_config(site, {'vars': {'foobar': MARKER}})
        set_site_config(site, {'extensionToShikiLanguage': {'sh': 'shellscript'}})
        (site / 'content' / 'greet.sh').write_text('# <%= vars.foobar %>\necho "Home is ${HOME}"\n')
        yield site

    def test_code_page_keeps_dollar_brace_literal(self, built_dev_site):
        page = (built_dev_site / 'dist' / 'greet.sh.html').read_text()
        text = html.unescape(re.sub(r'<[^>]+>', '', page))
        assert 'echo "Home is ${HOME}"' in text
        assert MARKER in text

    def test_download_keeps_dollar_brace_literal(self, built_dev_site):
        source = (built_dev_site / 'dist' / 'greet.sh').read_text()
        assert source == f'# {MARKER}\necho "Home is ${{HOME}}"\n'


@pytest.mark.parametrize('html_owner', ['public', 'content'])
def test_public_source_link_keeps_raw_target_with_html_sibling(tmp_path, html_owner):
    site = init_site(tmp_path, bare=True)
    set_site_config(site, {'extensionToShikiLanguage': {'py': 'python'}, 'basePath': '/course'})
    (site / 'public' / 'sample.py').write_text('print("public")\n')
    (site / html_owner / 'sample.py.html').write_text(
        '---\ntitle: Unrelated\n---\n<p>Unrelated HTML page</p>\n'
    )
    (site / 'content' / 'owned.py').write_text('print("content")\n')
    (site / 'content' / 'links.md').write_text(
        '---\ntitle: Links\n---\n\n'
        '[Public absolute](/sample.py?view=1#code)\n\n'
        '[Public relative](./sample.py?view=1#code)\n\n'
        '[Content](./owned.py)\n'
    )
    result = run_tada('dev', cwd=str(site))
    assert result.returncode == 0, result.stdout + result.stderr
    html = (site / 'dist' / 'links.html').read_text()
    assert '<a href="/course/sample.py?view=1#code">Public absolute</a>' in html
    assert '<a href="./sample.py?view=1#code">Public relative</a>' in html
    assert '<a href="./owned.py.html" data-tada-page="">Content</a>' in html
