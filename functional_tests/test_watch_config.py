import json

import pytest
from conftest import init_site, run_tada, set_site_config
from watch_helpers import WatchProcess


class TestWatchConfig:
    """Modifying the site config triggers a build."""

    def test_config_change_triggers_full_rebuild(self, watch, site_dir):
        index_html = site_dir / 'dist' / 'index.html'

        before_mtime = index_html.stat().st_mtime
        set_site_config(site_dir, {'title': 'Updated Title For Test'})

        watch.wait_for_rebuild(index_html, 'modified', before_mtime=before_mtime)
        assert 'Updated Title For Test' in index_html.read_text()

    def test_config_change_with_public_to_content_handoff_keeps_output(self, watch, site_dir):
        public_file = site_dir / 'public' / 'about.html'
        public_file.write_text('<p>From public</p>\n')

        dist_file = site_dir / 'dist' / 'about.html'
        watch.wait_for_rebuild(dist_file, 'exists')
        assert 'From public' in dist_file.read_text()

        public_file.unlink()
        watch.wait_for_rebuild(dist_file, 'removed')

        page = site_dir / 'content' / 'about.md'
        page.write_text('---\ntitle: About\n---\n\nFrom markdown.\n')

        watch.wait_for_rebuild(dist_file, 'exists')
        assert dist_file.exists()
        assert 'From markdown.' in dist_file.read_text()

        index_html = site_dir / 'dist' / 'index.html'
        before_config_mtime = index_html.stat().st_mtime
        set_site_config(site_dir, {'title': 'Updated Title For Handoff'})

        watch.wait_for_rebuild(index_html, 'modified', before_mtime=before_config_mtime)
        assert dist_file.exists()
        assert 'From markdown.' in dist_file.read_text()

    def test_config_change_rebuild_rejects_output_path_conflict(self, tmp_path):
        site_dir = init_site(tmp_path, bare=True)
        set_site_config(site_dir, {'extensionToShikiLanguage': {}})
        public_file = site_dir / 'public' / 'Test.java.html'
        public_file.write_text('<p>From public</p>\n')
        code_file = site_dir / 'content' / 'Test.java'
        code_file.write_text('public class Test {}\n')

        wp = WatchProcess(site_dir)
        try:
            wp.wait_for_initial_build()

            dist_file = site_dir / 'dist' / 'Test.java.html'
            assert dist_file.exists()
            before_text = dist_file.read_text()

            set_site_config(site_dir, {'extensionToShikiLanguage': {'java': 'java'}})

            wp.wait_for_error()
            assert wp.proc.poll() is None
            assert dist_file.read_text() == before_text
        finally:
            wp.stop()

    def test_base_path_change_updates_trace_manifest_urls(self, tmp_path):
        result = run_tada('init', 'testsite', '--no-interactive', cwd=str(tmp_path))
        assert result.returncode == 0, f'init failed: {result.stderr}'
        site_dir = tmp_path / 'testsite'

        wp = WatchProcess(site_dir)
        try:
            wp.wait_for_initial_build()

            lab_html = site_dir / 'dist' / 'labs' / '01' / 'index.html'
            assert lab_html.exists()
            before_html = lab_html.read_text()
            assert 'data-trace-manifest="/labs/01/_traces/TraceDemo/manifest.json"' in before_html
            before_mtime = lab_html.stat().st_mtime

            set_site_config(site_dir, {'basePath': '/course'})
            wp.wait_for_rebuild(lab_html, 'modified', before_mtime=before_mtime)

            after_html = lab_html.read_text()
            assert (
                'data-trace-manifest="/course/labs/01/_traces/TraceDemo/manifest.json"'
                in after_html
            )
            assert (
                'data-trace-manifest="/course/labs/01/_traces/SearchTreeDemo/manifest.json"'
                in after_html
            )
            assert (
                'data-trace-manifest="/course/labs/01/_traces/trace_demo/manifest.json"'
                in after_html
            )
        finally:
            wp.stop()


class TestWatchInitialConflict:
    """Watch startup should reject output-path conflicts before writing outputs."""

    def test_initial_build_rejects_content_public_output_conflict(self, tmp_path):
        site_dir = init_site(tmp_path, bare=True)

        public_file = site_dir / 'public' / 'about.html'
        public_file.write_text('<p>From public</p>\n')
        page = site_dir / 'content' / 'about.md'
        page.write_text('---\ntitle: About\n---\n\nFrom markdown.\n')

        wp = WatchProcess(site_dir)
        try:
            wp.wait_for_initial_build()
            assert wp.proc.poll() is None
            assert not (site_dir / 'dist' / 'about.html').exists()
        finally:
            wp.stop()


class TestWatchBadConfigAtStart:
    """Starting watch with an invalid config does not crash; fixing it recovers."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        site = init_site(tmp_path, bare=True)

        config_path = site / 'site.dev.json'
        config = json.loads(config_path.read_text())
        del config['title']
        config_path.write_text(json.dumps(config, indent=2) + '\n')

        yield site

    def test_bad_config_no_crash_then_fix(self, site_dir):
        wp = WatchProcess(site_dir)
        try:
            wp.wait_for_initial_build()

            assert not (site_dir / 'dist' / 'index.html').exists()
            assert wp.proc.poll() is None

            set_site_config(site_dir, {'title': 'Recovered Title'})

            index_html = site_dir / 'dist' / 'index.html'
            wp.wait_for_rebuild(index_html, 'exists')

            assert 'Recovered Title' in index_html.read_text()
        finally:
            wp.stop()


class TestWatchConfigBreakAndRecover:
    """Breaking the config mid-watch causes an error event; fixing it recovers."""

    def test_failed_full_rebuild_from_broken_config_leaves_dist_unchanged(self, watch, site_dir):
        index_html = site_dir / 'dist' / 'index.html'
        before_text = index_html.read_text()

        config_path = site_dir / 'site.dev.json'
        config = json.loads(config_path.read_text())
        del config['title']
        config_path.write_text(json.dumps(config, indent=2) + '\n')

        watch.wait_for_error()
        assert watch.proc.poll() is None
        assert index_html.read_text() == before_text

    def test_break_config_then_fix(self, watch, site_dir):
        index_html = site_dir / 'dist' / 'index.html'
        before_html = index_html.read_text()

        config_path = site_dir / 'site.dev.json'
        config = json.loads(config_path.read_text())
        original_title = config['title']
        del config['title']
        config_path.write_text(json.dumps(config, indent=2) + '\n')

        watch.wait_for_error()
        assert watch.proc.poll() is None

        config['title'] = original_title
        config_path.write_text(json.dumps(config, indent=2) + '\n')

        watch.wait_for_successful_rebuild()
        assert index_html.read_text() == before_html


class TestWatchConfigFileDetection:
    """Deleting/moving & re-adding config files re-builds and doesn't crash."""

    def test_editing_nav_json_updates_nav_output(self, watch, site_dir):
        index_html = site_dir / 'dist' / 'index.html'
        before_html = index_html.read_text()
        before_mtime = index_html.stat().st_mtime

        nav_path = site_dir / 'nav.json'
        nav = json.loads(nav_path.read_text())
        nav[0]['links'].append({'text': 'Docs', 'internal': '/index.html'})
        nav_path.write_text(json.dumps(nav, indent=2) + '\n')

        watch.wait_for_rebuild(index_html, 'modified', before_mtime=before_mtime)
        after_html = index_html.read_text()
        assert 'Docs' in after_html
        assert after_html != before_html

    def test_deleting_nav_json_triggers_error_then_restore_recovers(self, watch, site_dir):
        index_html = site_dir / 'dist' / 'index.html'
        before_html = index_html.read_text()

        nav_path = site_dir / 'nav.json'
        nav_backup = nav_path.read_text()
        nav_path.unlink()

        watch.wait_for_error()
        assert watch.proc.poll() is None

        nav_path.write_text(nav_backup)
        watch.wait_for_successful_rebuild()
        assert index_html.read_text() == before_html

    def test_missing_nav_json_at_start_then_create_recovers(self, tmp_path):
        site_dir = init_site(tmp_path, bare=True)

        nav_path = site_dir / 'nav.json'
        nav_backup = nav_path.read_text()
        nav_path.unlink()

        wp = WatchProcess(site_dir)
        try:
            wp.wait_for_initial_build()
            assert not (site_dir / 'dist' / 'index.html').exists()
            assert wp.proc.poll() is None

            nav_path.write_text(nav_backup)

            index_html = site_dir / 'dist' / 'index.html'
            wp.wait_for_rebuild(index_html, 'exists')
            assert index_html.exists()
        finally:
            wp.stop()

    def test_deleting_site_config_triggers_error_then_restore_recovers(self, watch, site_dir):
        index_html = site_dir / 'dist' / 'index.html'
        before_html = index_html.read_text()

        config_path = site_dir / 'site.dev.json'
        config_backup = config_path.read_text()
        config_path.unlink()

        watch.wait_for_error()
        assert watch.proc.poll() is None

        config_path.write_text(config_backup)
        watch.wait_for_successful_rebuild()
        assert index_html.read_text() == before_html

    def test_creating_authors_json_builds_pages_that_require_it(self, watch, site_dir):
        avatar_dir = site_dir / 'public' / 'avatars'
        avatar_dir.mkdir(parents=True)
        (avatar_dir / 'jdoe.png').write_bytes(b'')

        watch.wait_for_rebuild(site_dir / 'dist' / 'avatars' / 'jdoe.png', 'exists')

        author_page = site_dir / 'content' / 'author_page.md'
        author_page.write_text('---\ntitle: Author Page\nauthor: jdoe\n---\n\nAuthor content.\n')
        author_html = site_dir / 'dist' / 'author_page.html'

        watch.wait_for_error()
        assert watch.proc.poll() is None
        assert not author_html.exists()

        authors_path = site_dir / 'authors.json'
        authors_path.write_text(
            json.dumps({'jdoe': {'name': 'Jane Doe', 'avatar': '/avatars/jdoe.png'}}) + '\n'
        )

        watch.wait_for_rebuild(author_html, 'exists')
        html = author_html.read_text()
        assert 'Jane Doe' in html
        assert '/avatars/jdoe.png' in html

    def test_editing_authors_json_only_rebuilds_author_pages(self, watch, site_dir):
        avatar = site_dir / 'public' / 'avatar.png'
        avatar.write_bytes(b'avatar')
        watch.wait_for_rebuild(site_dir / 'dist' / 'avatar.png', 'exists')

        index_html = site_dir / 'dist' / 'index.html'
        before_index_mtime = index_html.stat().st_mtime

        authors_path = site_dir / 'authors.json'
        authors_path.write_text(
            json.dumps({'alex': {'name': 'Alex', 'avatar': '/avatar.png'}}) + '\n'
        )
        watch.wait_for_rebuild(index_html, 'modified', before_mtime=before_index_mtime)

        author_page = site_dir / 'content' / 'author_page.md'
        author_page.write_text('---\ntitle: Author Page\nauthor: alex\n---\n\nAuthor content.\n')
        author_html = site_dir / 'dist' / 'author_page.html'
        watch.wait_for_rebuild(author_html, 'exists')

        plain_page = site_dir / 'content' / 'plain_page.md'
        plain_page.write_text('---\ntitle: Plain Page\n---\n\nPlain content.\n')
        plain_html = site_dir / 'dist' / 'plain_page.html'
        watch.wait_for_rebuild(plain_html, 'exists')

        before_author_mtime = author_html.stat().st_mtime
        before_plain_snapshot = watch.snapshot(plain_html)

        authors = json.loads(authors_path.read_text())
        authors['alex']['name'] = 'Alex Updated'
        authors_path.write_text(json.dumps(authors, indent=2) + '\n')

        watch.wait_for_rebuild(author_html, 'modified', before_mtime=before_author_mtime)
        assert 'Alex Updated' in author_html.read_text()
        assert watch.snapshot(plain_html) == before_plain_snapshot

    def test_editing_authors_json_rebuilds_literate_java_author_pages(self, watch, site_dir):
        avatar = site_dir / 'public' / 'avatar.png'
        avatar.write_bytes(b'avatar')
        watch.wait_for_rebuild(site_dir / 'dist' / 'avatar.png', 'exists')

        index_html = site_dir / 'dist' / 'index.html'
        before_index_mtime = index_html.stat().st_mtime

        authors_path = site_dir / 'authors.json'
        authors_path.write_text(
            json.dumps({'alex': {'name': 'Alex', 'avatar': '/avatar.png'}}) + '\n'
        )
        watch.wait_for_rebuild(index_html, 'modified', before_mtime=before_index_mtime)

        java_page = site_dir / 'content' / 'AuthorExample.java.md'
        java_page.write_text(
            '---\n'
            'title: Author Example\n'
            'author: alex\n'
            'toc: false\n'
            '---\n\n'
            '```java\n'
            'public class AuthorExample {\n'
            '  public static void main(String[] args) {\n'
            '    System.out.println("hello");\n'
            '  }\n'
            '}\n'
            '```\n'
        )
        java_html = site_dir / 'dist' / 'AuthorExample.java.html'
        watch.wait_for_rebuild(java_html, 'exists')

        plain_page = site_dir / 'content' / 'plain_page.md'
        plain_page.write_text('---\ntitle: Plain Page\n---\n\nPlain content.\n')
        plain_html = site_dir / 'dist' / 'plain_page.html'
        watch.wait_for_rebuild(plain_html, 'exists')

        before_java_mtime = java_html.stat().st_mtime
        before_plain_snapshot = watch.snapshot(plain_html)

        authors = json.loads(authors_path.read_text())
        authors['alex']['name'] = 'Alex Updated'
        authors_path.write_text(json.dumps(authors, indent=2) + '\n')

        watch.wait_for_rebuild(java_html, 'modified', before_mtime=before_java_mtime)
        assert watch.snapshot(plain_html) == before_plain_snapshot
        assert 'Alex Updated' in java_html.read_text()
