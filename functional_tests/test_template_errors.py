import re

import pytest
from conftest import run_tada


class TestTemplateErrors:
    """Tests for template rendering error handling."""

    def test_undefined_variable_fails_build(self, site_dir):
        """A Markdown file referencing an undefined variable should fail."""
        (site_dir / 'content' / 'index.md').write_text(
            '---\ntitle: Home\n---\n\n<%= undefinedVariable.foo %>\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert 'index.md' in output

    def test_undefined_variable_in_html(self, site_dir):
        """An HTML file referencing an undefined variable should fail."""
        (site_dir / 'content' / 'index.html').write_text(
            '---\ntitle: Home\n---\n\n<p><%= undefinedVariable.foo %></p>\n'
        )
        # Remove the default index.md so there's no conflict
        index_md = site_dir / 'content' / 'index.md'
        if index_md.exists():
            index_md.unlink()

        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0

    def test_bad_expression_fails_build(self, site_dir):
        """A file containing an invalid template expression should fail."""
        (site_dir / 'content' / 'index.md').write_text('---\ntitle: Home\n---\n\n<%= oops. %>\n')
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert 'index.md' in output


class TestMissingFrontMatter:
    """Tests for required front matter field validation."""

    def test_missing_title_fails_build(self, site_dir):
        """A markdown page without a title field should fail the build."""
        (site_dir / 'content' / 'index.md').write_text('Some content.\n')
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        output = (result.stdout + result.stderr).lower()
        assert 'title' in output

    def test_empty_title_fails_build(self, site_dir):
        """A page with an empty title should fail the build."""
        (site_dir / 'content' / 'index.md').write_text('---\ntitle:\n---\n\nSome content.\n')
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0


class TestReservedFrontMatterKeys:
    """Front matter cannot set page variables that Tada assigns itself."""

    @pytest.mark.parametrize(
        'key',
        [
            'template',
            'titleHtml',
            'descriptionHtml',
            'tocHtml',
            'tocItems',
            'codeFilePath',
            'downloadName',
            'filePath',
        ],
    )
    def test_reserved_key_fails_markdown_page(self, site_dir, key):
        (site_dir / 'content' / 'exam.md').write_text(
            f'---\ntitle: Exam\n{key}: midterm\n---\n\nBody.\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        assert f'content/exam.md: front matter key "{key}" is reserved' in (
            result.stdout + result.stderr
        )
        assert not (site_dir / 'dist' / 'exam.html').exists()

    @pytest.mark.parametrize(
        'file_name,body',
        [
            ('exam.html', '<p>Body.</p>\n'),
            ('Exam.java.md', '```java\npublic class Exam {}\n```\n'),
        ],
    )
    def test_reserved_key_fails_other_page_types(self, site_dir, file_name, body):
        (site_dir / 'content' / file_name).write_text(
            f'---\ntitle: Exam\ntemplate: midterm\n---\n\n{body}'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        assert f'content/{file_name}: front matter key "template" is reserved' in (
            result.stdout + result.stderr
        )

    def test_custom_keys_are_still_page_variables(self, site_dir):
        (site_dir / 'content' / 'index.md').write_text(
            '---\ntitle: Home\ntoolName: Tada\n---\n\nBuilt by <%= page.toolName %>.\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, result.stdout + result.stderr
        assert 'Built by Tada.' in (site_dir / 'dist' / 'index.html').read_text()


def _text_content(html):
    """Return the text of an HTML document with tags removed."""
    return re.sub(r'<[^>]+>', '', html)


class TestEsTemplateLiteralSyntax:
    """`${...}` is literal text; only `<% %>` delimiters are Lodash template syntax."""

    def test_markdown_keeps_dollar_brace_literal(self, site_dir):
        (site_dir / 'content' / 'index.md').write_text(
            "---\ntitle: Home\ndescription: 'Costs ${price}'\n---\n\n"
            'Run `echo ${name}` in <%= page.title %>.\n\n'
            '```\n'
            'const greeting = `Hello, ${name}!`;\n'
            '```\n\n'
            '{{{ _part.md }}}\n'
        )
        (site_dir / 'content' / '_part.md').write_text('Partial prints `${HOME}`.\n')
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, result.stdout + result.stderr

        html = (site_dir / 'dist' / 'index.html').read_text()
        assert '<code>echo ${name}</code>' in html
        assert 'in Home.' in html
        assert 'const greeting = `Hello, ${name}!`;' in _text_content(html)
        assert '<code>${HOME}</code>' in html
        assert '<meta name="description" content="Costs ${price}">' in html
