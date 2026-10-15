import re

import pytest
from conftest import (
    SITE_DEV_CONFIG_FILE,
    SITE_PROD_CONFIG_FILE,
    run_tada,
    set_site_config,
)

MARKDOWN_LINK = re.compile(r'\]\(([^)\s]+)\)')


def write(site_dir, rel_path, text):
    file_path = site_dir.joinpath('content', *rel_path.split('/'))
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(text, encoding='utf-8')
    return file_path


def read_export(site_dir, rel_path, out='exported'):
    return site_dir.joinpath(out, *rel_path.split('/')).read_text(encoding='utf-8')


class TestExport:
    """`tada export` writes content/ as plain GitHub Flavored Markdown."""

    @pytest.fixture
    def site_dir(self, site_dir):
        for config_file, course in [
            (SITE_DEV_CONFIG_FILE, 'Dev course'),
            (SITE_PROD_CONFIG_FILE, 'Prod course'),
        ]:
            set_site_config(
                site_dir,
                {
                    'vars': {'course': course},
                    'extensionToShikiLanguage': {'java': 'java'},
                    'shikiLanguages': ['java'],
                },
                config_file,
            )
        write(
            site_dir,
            'index.md',
            '---\ntitle: Home\n---\n\nWelcome to {{ course }}.\n\n'
            '[Lecture][Read first](/lectures/one.html)\n',
        )
        write(
            site_dir,
            'lectures/one.md',
            '---\ntitle: Lecture One\nauthor: alex\n---\n\n'
            '## Intro # Week 1\n\n'
            'See [[Home|the home page]] and [the code](Demo.java).\n\n'
            '!!! note\nRemember this.\n!!!\n\n'
            '{{{ _part.md }}}\n',
        )
        write(site_dir, 'lectures/_part.md', 'From a partial.\n')
        write(site_dir, 'lectures/Demo.java', '// {{ course }}\npublic class Demo {}\n')
        write(
            site_dir,
            'lectures/notes.html',
            '---\ntitle: Notes\n---\n\n<a href="/index.html">Home</a>\n',
        )
        write(site_dir, 'draft.md', '---\ntitle: Draft\nskip: true\n---\n\nDraft.\n')
        yield site_dir

    def test_requires_dev_or_prod(self, site_dir):
        for args in [(), ('--dev', '--prod')]:
            result = run_tada('export', *args, cwd=str(site_dir))
            assert result.returncode != 0
            assert 'Pass exactly one of --dev or --prod' in result.stderr
            assert not (site_dir / 'exported').exists()

    def test_writes_markdown_without_front_matter(self, site_dir):
        result = run_tada('export', '--dev', cwd=str(site_dir))
        assert result.returncode == 0, result.stdout + result.stderr
        assert 'Exported 3 pages' in result.stdout

        assert read_export(site_dir, 'index.md') == (
            '# Home\n\nWelcome to Dev course.\n\n[Lecture](lectures/one.md) - Read first\n'
        )
        assert read_export(site_dir, 'lectures/one.md') == (
            '# Lecture One\n\n'
            '## Intro - Week 1\n\n'
            'See [the home page](../index.md) and [the code](Demo.java).\n\n'
            '> [!NOTE]\n> Remember this.\n\n\n'
            'From a partial.\n'
        )
        assert read_export(site_dir, 'lectures/notes.html') == (
            '<h1>Notes</h1>\n\n<a href="../index.md">Home</a>\n'
        )
        assert read_export(site_dir, 'lectures/Demo.java') == (
            '// Dev course\npublic class Demo {}\n'
        )
        assert not (site_dir / 'exported' / 'lectures' / '_part.md').exists()
        assert not (site_dir / 'exported' / 'draft.md').exists()

    def test_relative_links_resolve(self, site_dir):
        run_tada('export', '--dev', cwd=str(site_dir), check=True)
        exported = site_dir / 'exported'
        for page in exported.rglob('*.md'):
            for target in MARKDOWN_LINK.findall(page.read_text(encoding='utf-8')):
                if '://' in target or target.startswith('#'):
                    continue
                assert (page.parent / target.split('#')[0]).exists(), (page, target)

    def test_uses_the_chosen_config(self, site_dir):
        run_tada('export', '--prod', '--out', 'out', cwd=str(site_dir), check=True)
        assert 'Welcome to Prod course.' in read_export(site_dir, 'index.md', 'out')

    def test_refuses_a_directory_that_is_not_empty(self, site_dir):
        (site_dir / 'exported').mkdir()
        (site_dir / 'exported' / 'old.md').write_text('old', encoding='utf-8')

        result = run_tada('export', '--dev', cwd=str(site_dir))
        assert result.returncode != 0
        assert 'is not empty; use --force to replace it' in result.stderr
        assert (site_dir / 'exported' / 'old.md').exists()

        result = run_tada('export', '--dev', '--force', cwd=str(site_dir))
        assert result.returncode == 0, result.stdout + result.stderr
        assert not (site_dir / 'exported' / 'old.md').exists()
        assert (site_dir / 'exported' / 'index.md').exists()

    def test_file_and_directory_clash_keeps_the_previous_export(self, site_dir):
        (site_dir / 'exported').mkdir()
        (site_dir / 'exported' / 'old.md').write_text('old', encoding='utf-8')
        # A file and a directory with the same path cannot both be written
        (site_dir / 'public' / 'notes').write_text('notes', encoding='utf-8')
        write(site_dir, 'notes/a.md', '---\ntitle: A\n---\n\nA.\n')

        result = run_tada('export', '--dev', '--force', cwd=str(site_dir))
        assert result.returncode != 0
        assert 'would be exported as a file where content/notes/a.md needs a directory' in (
            result.stderr
        )
        assert (site_dir / 'exported' / 'old.md').read_text(encoding='utf-8') == 'old'
        assert [p.name for p in site_dir.iterdir() if p.name.startswith('exported')] == ['exported']

    @pytest.mark.parametrize('out', ['content/out', 'Content', 'PUBLIC', '.'])
    def test_refuses_to_export_over_sources(self, site_dir, out):
        result = run_tada('export', '--dev', '--out', out, '--force', cwd=str(site_dir))
        assert result.returncode != 0
        assert 'overlaps content/ or public/' in result.stderr
        assert (site_dir / 'content' / 'index.md').exists()

    def test_refuses_a_file_as_the_output_directory(self, site_dir):
        (site_dir / 'notes.txt').write_text('notes', encoding='utf-8')
        result = run_tada('export', '--dev', '--out', 'notes.txt', cwd=str(site_dir))
        assert result.returncode != 0
        assert 'it is a file, not a directory' in result.stderr

    def test_fails_on_a_broken_internal_link(self, site_dir):
        write(site_dir, 'broken.md', '---\ntitle: Broken\n---\n\n[x](/missing.html)\n')
        result = run_tada('export', '--dev', cwd=str(site_dir))
        assert result.returncode != 0
        assert 'broken internal link: "/missing.html"' in result.stderr
        assert not (site_dir / 'exported').exists()

    def test_fails_when_two_sources_write_one_output(self, site_dir):
        write(site_dir, 'foo.md', '---\ntitle: Foo\n---\n\nFoo.\n')
        write(site_dir, 'foo.html', '---\ntitle: Foo too\n---\n\n<p>Foo.</p>\n')
        result = run_tada('export', '--dev', cwd=str(site_dir))
        assert result.returncode != 0
        assert 'content/foo.html, content/foo.md: both write foo.html' in result.stderr
        assert not (site_dir / 'exported').exists()

    def test_fails_when_two_sources_share_an_export_path(self, site_dir):
        (site_dir / 'public' / 'notes.md').write_text('notes', encoding='utf-8')
        write(site_dir, 'notes.md', '---\ntitle: Notes page\n---\n\nNotes.\n')
        result = run_tada('export', '--dev', cwd=str(site_dir))
        assert result.returncode != 0
        assert 'would both be exported as notes.md; rename one of them' in result.stderr

    def test_exports_literate_java_source(self, site_dir):
        write(
            site_dir,
            'lectures/Foo.java.md',
            '---\ntitle: Foo\n---\n\nA class.\n\n```java\npublic class Foo {}\n```\n',
        )
        write(site_dir, 'links.md', '---\ntitle: Links\n---\n\n[Download](/lectures/Foo.java)\n')
        result = run_tada('export', '--dev', cwd=str(site_dir))
        assert result.returncode == 0, result.stdout + result.stderr

        assert read_export(site_dir, 'lectures/Foo.java.md').startswith('# Foo\n\nA class.')
        assert 'public class Foo {}' in read_export(site_dir, 'lectures/Foo.java')
        assert '[Download](lectures/Foo.java)' in read_export(site_dir, 'links.md')

    def test_broken_wikilink_fails_without_writing(self, site_dir):
        write(site_dir, 'broken.md', '---\ntitle: Broken\n---\n\n[[Nope]]\n')
        result = run_tada('export', '--dev', cwd=str(site_dir))
        assert result.returncode != 0
        assert 'broken wikilink "[[Nope]]"' in result.stderr
        assert not (site_dir / 'exported').exists()
