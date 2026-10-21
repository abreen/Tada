import re

import pytest
from conftest import run_tada, set_site_config, write_structured_file


def breadcrumb_nav(html):
    """Return the inner HTML of the page's breadcrumb trail, or None.

    Drops the client router's page link marker so assertions show only links.
    """
    match = re.search(r'<nav class="breadcrumbs"[^>]*>(.*?)</nav>', html, re.S)
    return match[1].replace(' data-tada-page=""', '') if match else None


def build(site_dir):
    return run_tada('dev', cwd=str(site_dir))


def assert_build_fails(site_dir, *fragments):
    result = build(site_dir)
    output = result.stdout + result.stderr
    assert result.returncode != 0, output
    for fragment in fragments:
        assert fragment in output, output


@pytest.fixture
def guide_site(site_dir):
    """A guide tree: index.md > (install.md, topics/index.md > topics/deep.md)."""
    guide = site_dir / 'content' / 'guide'
    (guide / 'topics').mkdir(parents=True)
    (guide / 'index.md').write_text('---\ntitle: The *Guide*\n---\n\nGuide.\n')
    (guide / 'install.md').write_text('---\ntitle: Install\n---\n\nInstall.\n')
    (guide / 'topics' / 'index.md').write_text(
        '---\ntitle: "{{ topicsName }} & more"\n---\n\nTopics.\n'
    )
    (guide / 'topics' / 'deep.md').write_text('---\ntitle: Deep\n---\n\nDeep.\n')
    (site_dir / 'content' / 'unindexed.md').write_text(
        '---\ntitle: Unindexed\n---\n\nNot indexed.\n'
    )
    write_structured_file(
        guide / 'index.yml',
        {
            'page': 'index.md',
            'children': [
                'install.md',
                {'page': 'topics/index.md', 'children': ['topics/deep.md']},
            ],
        },
    )
    set_site_config(site_dir, {'vars': {'topicsName': 'Topics'}})
    yield site_dir


class TestDocumentIndexPages:
    """Indexed pages show their ancestors in the index instead of breadcrumbs."""

    def test_indexed_and_unindexed_pages_have_no_breadcrumbs(self, guide_site):
        result = build(guide_site)
        assert result.returncode == 0, result.stdout + result.stderr
        dist = guide_site / 'dist'
        for page in [
            dist / 'guide' / 'index.html',
            dist / 'guide' / 'install.html',
            dist / 'guide' / 'topics' / 'index.html',
            dist / 'guide' / 'topics' / 'deep.html',
            dist / 'unindexed.html',
            dist / 'index.html',
        ]:
            assert breadcrumb_nav(page.read_text()) is None, page

    def test_index_files_are_not_copied(self, guide_site):
        result = build(guide_site)
        assert result.returncode == 0, result.stdout + result.stderr
        assert not (guide_site / 'dist' / 'guide' / 'index.yml').exists()

    def test_index_json_is_ordinary_content(self, guide_site):
        (guide_site / 'content' / 'guide' / 'index.json').write_text('{"data": 1}\n')
        result = build(guide_site)
        assert result.returncode == 0, result.stdout + result.stderr
        assert (guide_site / 'dist' / 'guide' / 'index.json').read_text() == '{"data": 1}\n'

    def test_other_casings_are_ordinary_content(self, guide_site):
        data = guide_site / 'content' / 'data'
        data.mkdir()
        (data / 'Index.yml').write_text('rows: 1\n')
        result = build(guide_site)
        assert result.returncode == 0, result.stdout + result.stderr
        assert (guide_site / 'dist' / 'data' / 'Index.yml').read_text() == 'rows: 1\n'

    def test_authored_breadcrumbs_on_indexed_page_fail(self, guide_site):
        (guide_site / 'content' / 'guide' / 'install.md').write_text(
            '---\ntitle: Install\nbreadcrumbs:\n'
            '  - label: Home\n    url: /index.html\n---\n\nInstall.\n'
        )
        assert_build_fails(
            guide_site,
            'install.md: front matter "breadcrumbs" is not allowed',
            'guide/index.yml',
        )

    def test_encodes_filenames_in_ancestor_urls(self, site_dir):
        content = site_dir / 'content'
        (content / 'a%20b.md').write_text('---\ntitle: Percent\n---\n\nPercent.\n')
        (content / 'child.md').write_text('---\ntitle: Child\n---\n\nChild.\n')
        write_structured_file(
            content / 'index.yaml',
            {
                'page': 'index.md',
                'children': [{'page': 'a%20b.md', 'children': ['child.md']}],
            },
        )
        result = build(site_dir)
        assert result.returncode == 0, result.stdout + result.stderr
        index = document_nav((site_dir / 'dist' / 'child.html').read_text(), 'document-index')
        assert 'href="/a%2520b.html">Percent</a>' in index
        assert 'href="/index.html">Home</a>' in index

    def test_literate_java_page_has_no_breadcrumbs(self, site_dir):
        content = site_dir / 'content'
        (content / 'Hello.java.md').write_text(
            '---\ntitle: Hello\n---\n\n```java\nclass Hello {}\n```\n'
        )
        write_structured_file(
            content / 'index.yml', {'page': 'index.md', 'children': ['Hello.java.md']}
        )
        result = build(site_dir)
        assert result.returncode == 0, result.stdout + result.stderr
        html = (site_dir / 'dist' / 'Hello.java.html').read_text()
        assert breadcrumb_nav(html) is None
        assert 'href="/index.html">Home</a>' in document_nav(html, 'document-index')


class TestDocumentIndexErrors:
    """Invalid index files fail the build with a diagnostic naming the file."""

    def write_index(self, site_dir, value, name='index.yml', subdir=''):
        directory = site_dir / 'content' / subdir
        directory.mkdir(parents=True, exist_ok=True)
        write_structured_file(directory / name, value)

    def test_unknown_source(self, site_dir):
        self.write_index(site_dir, {'page': 'index.md', 'children': ['missing.md']})
        assert_build_fails(site_dir, 'content/index.yml', 'missing.md')

    def test_duplicate_source(self, site_dir):
        self.write_index(site_dir, {'page': 'index.md', 'children': ['index.md']})
        assert_build_fails(site_dir, 'content/index.yml', 'listed more than once', 'index.md')

    @pytest.mark.parametrize(
        'source', ['/index.md', '../index.md', './index.md', 'a\\b.md', 'index.md#top']
    )
    def test_invalid_source_path(self, site_dir, source):
        self.write_index(site_dir, {'page': 'index.md', 'children': [source]})
        assert_build_fails(site_dir, 'content/index.yml')

    def test_malformed_index(self, site_dir):
        self.write_index(site_dir, {'page': 'index.md', 'children': []})
        assert_build_fails(site_dir, 'content/index.yml', 'failed validation')

    def test_source_that_is_not_a_page(self, site_dir):
        content = site_dir / 'content'
        (content / '_partial.md').write_text('Partial.\n')
        (content / 'skipped.md').write_text('---\ntitle: Skipped\nskip: true\n---\n\nSkip.\n')
        (content / 'data.txt').write_text('Data.\n')
        for source in ['_partial.md', 'skipped.md', 'data.txt']:
            self.write_index(site_dir, {'page': 'index.md', 'children': [source]})
            assert_build_fails(site_dir, 'content/index.yml', source, 'does not build a page')

    def test_source_in_two_indexes(self, site_dir):
        guide = site_dir / 'content' / 'guide'
        guide.mkdir()
        (guide / 'index.md').write_text('---\ntitle: Guide\n---\n\nGuide.\n')
        (guide / 'page.md').write_text('---\ntitle: Page\n---\n\nPage.\n')
        self.write_index(site_dir, {'page': 'index.md', 'children': ['page.md']}, subdir='guide')
        self.write_index(site_dir, {'page': 'index.md', 'children': ['guide/page.md']})
        assert_build_fails(
            site_dir, 'guide/page.md', 'content/index.yml', 'content/guide/index.yml'
        )

    def test_both_extensions_in_one_directory(self, site_dir):
        value = {'page': 'index.md', 'children': []}
        (site_dir / 'content' / 'page.md').write_text('---\ntitle: Page\n---\n\nPage.\n')
        value['children'] = ['page.md']
        self.write_index(site_dir, value, name='index.yml')
        self.write_index(site_dir, value, name='index.yaml')
        assert_build_fails(site_dir, 'index.yaml', 'index.yml', 'keep only one')

    def test_reports_errors_in_every_index_file(self, site_dir):
        content = site_dir / 'content'
        (content / 'labs').mkdir()
        (content / 'labs' / 'index.md').write_text('---\ntitle: Labs\n---\n\nLabs.\n')
        (content / 'labs' / 'index.yml').write_text('page: [index.md\n')
        self.write_index(site_dir, {'page': 'index.md', 'children': ['missing.md']})
        assert_build_fails(site_dir, 'content/labs/index.yml', 'no such source: "missing.md"')

    def test_title_without_text(self, site_dir):
        content = site_dir / 'content'
        (content / 'logo.png').write_bytes(b'png')
        (content / 'pictured.md').write_text('---\ntitle: "![Logo](logo.png)"\n---\n\nP.\n')
        self.write_index(site_dir, {'page': 'index.md', 'children': ['pictured.md']})
        assert_build_fails(site_dir, 'content/index.yml', '"pictured.md" has no title')

    def test_untitled_home_page(self, site_dir):
        content = site_dir / 'content'
        (content / 'index.md').write_text('Welcome.\n')
        (content / 'page.md').write_text('---\ntitle: Page\n---\n\nPage.\n')
        self.write_index(site_dir, {'page': 'index.md', 'children': ['page.md']})
        assert_build_fails(site_dir, 'content/index.yml', 'index.md', 'title')


def document_nav(html, css_class):
    """Return the inner HTML of a document navigation element, or None."""
    match = re.search(rf'<nav class="{css_class}"[^>]*>(.*?)</nav>', html, re.S)
    if not match:
        return None
    return re.sub(r'>\s+<', '><', match[1].replace(' data-tada-page=""', ''))


class TestDocumentIndexNavigation:
    """Indexed pages show the tree and previous and next links."""

    def test_sidebar_and_pagination_use_rendered_titles(self, site_dir):
        set_site_config(
            site_dir,
            {'extensionToShikiLanguage': {'java': 'java'}, 'shikiLanguages': ['java']},
        )
        content = site_dir / 'content'
        (content / 'types.md').write_text(
            '---\ntitle: "Using `List<String>` & [**bold**](https://example.com)"\n---\n\nTypes.\n'
        )
        (content / 'Foo.java').write_text('class Foo {}\n')
        write_structured_file(
            content / 'index.yml', {'page': 'index.md', 'children': ['types.md', 'Foo.java']}
        )
        result = build(site_dir)
        assert result.returncode == 0, result.stdout + result.stderr

        home = (site_dir / 'dist' / 'index.html').read_text()
        label = 'Using <code>List&lt;String&gt;</code> &amp; <strong>bold</strong>'
        index = document_nav(home, 'document-index')
        assert f'<a href="/types.html">{label}</a>' in index
        assert '<a href="/index.html" aria-current="page">Home</a>' in index
        assert 'example.com' not in index
        assert f'<span class="visually-hidden">Next: </span>{label}</span>' in document_nav(
            home, 'document-pagination'
        )

        code = (site_dir / 'dist' / 'Foo.java.html').read_text()
        assert (
            '<a class="code-page" href="/Foo.java.html" aria-current="page">'
            '<code>Foo.java</code></a>' in document_nav(code, 'document-index')
        )
        assert 'class="button previous" rel="prev" href="/types.html"' in document_nav(
            code, 'document-pagination'
        )
        assert breadcrumb_nav(code) is None
        assert 'document-index-is-active' in code

    def test_code_page_file_name_is_escaped(self, site_dir):
        set_site_config(
            site_dir,
            {'extensionToShikiLanguage': {'java': 'java'}, 'shikiLanguages': ['java']},
        )
        content = site_dir / 'content'
        (content / 'x&lt;.java').write_text('class X {}\n')
        write_structured_file(
            content / 'index.yml', {'page': 'index.md', 'children': ['x&lt;.java']}
        )
        result = build(site_dir)
        assert result.returncode == 0, result.stdout + result.stderr
        home = (site_dir / 'dist' / 'index.html').read_text()
        assert '<code>x&amp;lt;.java</code></a>' in document_nav(home, 'document-index')
        code = (site_dir / 'dist' / 'x&lt;.java.html').read_text()
        assert '<code>x&amp;lt;.java</code></h1>' in code

    def test_title_images_work_on_other_pages(self, site_dir):
        set_site_config(site_dir, {'basePath': '/course'})
        guide = site_dir / 'content' / 'guide'
        guide.mkdir()
        (guide / 'logo.png').write_bytes(b'png')
        (guide / 'logo2.png').write_bytes(b'png')
        (guide / 'index.md').write_text(
            '---\ntitle: \'Guide <img src="logo.png" srcset="logo2.png 2x" alt="">\'\n'
            '---\n\nGuide.\n'
        )
        write_structured_file(
            site_dir / 'content' / 'index.yml',
            {'page': 'index.md', 'children': ['guide/index.md']},
        )
        result = build(site_dir)
        assert result.returncode == 0, result.stdout + result.stderr
        home = (site_dir / 'dist' / 'index.html').read_text()
        index = document_nav(home, 'document-index')
        assert '<img src="/course/guide/logo.png" alt="">' in index
        assert 'srcset' not in index

    def test_numeric_title_must_be_quoted_when_indexed(self, site_dir):
        content = site_dir / 'content'
        (content / 'lab.md').write_text('---\ntitle: 1.10\n---\n\nLab.\n')
        result = build(site_dir)
        assert result.returncode == 0, result.stdout + result.stderr
        write_structured_file(content / 'index.yml', {'page': 'index.md', 'children': ['lab.md']})
        assert_build_fails(site_dir, 'lab.md: "title" must be text', 'title: "1.10"')

    def test_quoted_numeric_title_keeps_its_text(self, site_dir):
        content = site_dir / 'content'
        (content / 'lab.md').write_text('---\ntitle: "1.10"\n---\n\nLab.\n')
        write_structured_file(content / 'index.yml', {'page': 'index.md', 'children': ['lab.md']})
        result = build(site_dir)
        assert result.returncode == 0, result.stdout + result.stderr
        home = (site_dir / 'dist' / 'index.html').read_text()
        assert '<a href="/lab.html">1.10</a>' in document_nav(home, 'document-index')

    def test_title_image_without_source(self, site_dir):
        content = site_dir / 'content'
        (content / 'icon.png').write_bytes(b'png')
        (content / 'empty.md').write_text('---\ntitle: "![logo]() Empty"\n---\n\nE.\n')
        (content / 'set.md').write_text(
            '---\ntitle: \'<img srcset="icon.png 1x, big.png 2x" alt=""> Set\'\n---\n\nS.\n'
        )
        write_structured_file(
            content / 'index.yml',
            {'page': 'index.md', 'children': ['empty.md', 'set.md']},
        )
        result = build(site_dir)
        assert result.returncode == 0, result.stdout + result.stderr
        home = document_nav((site_dir / 'dist' / 'index.html').read_text(), 'document-index')
        assert '<img src="" alt="logo"> Empty</a>' in home
        assert '<img alt="" src="/icon.png"> Set</a>' in home

    def test_unindexed_page_has_no_document_navigation(self, guide_site):
        result = build(guide_site)
        assert result.returncode == 0, result.stdout + result.stderr
        html = (guide_site / 'dist' / 'unindexed.html').read_text()
        assert document_nav(html, 'document-index') is None
        assert document_nav(html, 'document-pagination') is None
        assert 'document-index-is-active' not in html


class TestDocumentIndexSearch:
    """Pagefind gets the root title of a page's tree for search results."""

    def test_descendants_carry_their_root_title(self, guide_site):
        result = build(guide_site)
        assert result.returncode == 0, result.stdout + result.stderr
        dist = guide_site / 'dist'
        for page in [dist / 'guide' / 'install.html', dist / 'guide' / 'topics' / 'deep.html']:
            body = re.search(r'<body[^>]*>', page.read_text())[0]
            assert 'document_root[data-document-root]' in body
            assert 'data-document-root="The Guide"' in body
        for page in [dist / 'guide' / 'index.html', dist / 'unindexed.html']:
            body = re.search(r'<body[^>]*>', page.read_text())[0]
            assert 'document_root' not in body
            assert 'data-document-root' not in body
