import re

import pytest
from conftest import run_tada, set_site_config


class TestVariableErrors:
    """Tests for site variable substitution errors."""

    def test_undefined_variable_fails_build(self, site_dir):
        """A Markdown file referencing an undefined variable should fail."""
        (site_dir / 'content' / 'index.md').write_text(
            '---\ntitle: Home\n---\n\n{{ undefinedVariable.foo }}\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert 'index.md: unknown variable "{{ undefinedVariable.foo }}"' in output

    def test_undefined_variable_in_html(self, site_dir):
        """An HTML file referencing an undefined variable should fail."""
        (site_dir / 'content' / 'index.html').write_text(
            '---\ntitle: Home\n---\n\n<p>{{ undefinedVariable }}</p>\n'
        )
        # Remove the default index.md so there's no conflict
        index_md = site_dir / 'content' / 'index.md'
        if index_md.exists():
            index_md.unlink()

        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert 'index.html: unknown variable "{{ undefinedVariable }}"' in output

    def test_object_variable_fails_build(self, site_dir):
        """Inserting an object-valued variable should fail."""
        set_site_config(site_dir, {'vars': {'course': {'code': 'CS 112'}}})
        (site_dir / 'content' / 'index.md').write_text('---\ntitle: Home\n---\n\n{{ course }}\n')
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        output = result.stdout + result.stderr
        assert 'index.md: variable "{{ course }}" is an object' in output

    def test_variables_substitute_in_page_and_front_matter(self, site_dir):
        set_site_config(
            site_dir, {'vars': {'courseName': 'Intro to CS', 'course': {'code': 'CS 112'}}}
        )
        (site_dir / 'content' / 'index.md').write_text(
            '---\ntitle: Home\ndescription: About {{ courseName }}\n---\n\n'
            'Welcome to {{ courseName }} ({{ course.code }}). Write \\{{ courseName }}.\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, result.stdout + result.stderr

        html = (site_dir / 'dist' / 'index.html').read_text()
        assert 'Welcome to Intro to CS (CS 112). Write {{ courseName }}.' in html
        assert '<meta name="description" content="About Intro to CS"' in html


class TestMissingFrontMatter:
    """Tests for required front matter field validation."""

    def test_missing_title_fails_build(self, site_dir):
        """A markdown page other than the home page needs a title field."""
        (site_dir / 'content' / 'about.md').write_text('Some content.\n')
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        output = (result.stdout + result.stderr).lower()
        assert 'title' in output

    def test_empty_title_fails_build(self, site_dir):
        """A page other than the home page with an empty title should fail the build."""
        (site_dir / 'content' / 'about.md').write_text('---\ntitle:\n---\n\nSome content.\n')
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
            'parent',
            'parentLabel',
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
    @pytest.mark.parametrize('key', ['template', 'parent', 'parentLabel'])
    def test_reserved_key_fails_other_page_types(self, site_dir, file_name, body, key):
        (site_dir / 'content' / file_name).write_text(
            f'---\ntitle: Exam\n{key}: midterm\n---\n\n{body}'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        assert f'content/{file_name}: front matter key "{key}" is reserved' in (
            result.stdout + result.stderr
        )

    def test_unknown_keys_warn_and_are_ignored(self, site_dir):
        (site_dir / 'content' / 'index.md').write_text(
            '---\ntitle: Home\ntoolName: Tada\n---\n\nBuilt by Tada.\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        output = result.stdout + result.stderr
        assert result.returncode == 0, output
        assert 'ignoring unknown front matter field "toolName"' in output
        assert 'Built by Tada.' in (site_dir / 'dist' / 'index.html').read_text()


def _text_content(html):
    """Return the text of an HTML document with tags removed."""
    return re.sub(r'<[^>]+>', '', html)


class TestLiteralTemplateSyntax:
    """`${...}` and Lodash `<% %>` are literal text; only `{{ name }}` is a variable."""

    def test_markdown_keeps_dollar_brace_literal(self, site_dir):
        (site_dir / 'content' / 'index.md').write_text(
            "---\ntitle: Home\ndescription: 'Costs ${price}'\n---\n\n"
            'Run `echo ${name}` in {{ foobar }}.\n\n'
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
        assert 'in 123.' in html
        assert 'const greeting = `Hello, ${name}!`;' in _text_content(html)
        assert '<code>${HOME}</code>' in html
        assert '<meta name="description" content="Costs ${price}"' in html

    def test_markdown_keeps_lodash_syntax_literal(self, site_dir):
        (site_dir / 'content' / 'index.md').write_text(
            "---\ntitle: Home\ndescription: 'Made with <%= site.title %>'\n---\n\n"
            'Shown <%= page.title %> and <% if (true) { %>.\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, result.stdout + result.stderr

        html = (site_dir / 'dist' / 'index.html').read_text()
        assert 'Shown &lt;%= page.title %&gt; and &lt;% if (true) { %&gt;.' in html
        assert 'content="Made with &lt;%= site.title %&gt;"' in html

    def test_code_samples_substitute_and_escape(self, site_dir):
        """Variables work in code; a backslash keeps other template syntax literal."""
        (site_dir / 'content' / 'index.md').write_text(
            '---\ntitle: Home\n---\n\n'
            'Vue uses `\\{{ message }}`; run `ssh {{ foobar }}`.\n\n'
            '```text\n<p>\\{{ message }}</p> {{ foobar }}\n```\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode == 0, result.stdout + result.stderr

        html = (site_dir / 'dist' / 'index.html').read_text()
        assert '<code>{{ message }}</code>; run <code>ssh 123</code>.' in html
        text = _text_content(html)
        assert '{{ message }}' in text.split('ssh 123')[1]
        assert '{{ foobar }}' not in text

    def test_unescaped_code_sample_variable_fails_build(self, site_dir):
        (site_dir / 'content' / 'index.md').write_text(
            '---\ntitle: Home\n---\n\n```text\n<p>{{ message }}</p>\n```\n'
        )
        result = run_tada('dev', cwd=str(site_dir))
        assert result.returncode != 0
        assert 'unknown variable "{{ message }}"' in result.stdout + result.stderr
