import json

import pytest

from conftest import run_tada
from watch_helpers import WatchProcess


class TestWatchEditContent:
    """Modifying a Markdown or HTML file triggers a build."""

    def test_editing_markdown_triggers_rebuild(self, watch, site_dir):
        index_md = site_dir / "content" / "index.md"
        index_html = site_dir / "dist" / "index.html"

        before_mtime = index_html.stat().st_mtime
        original = index_md.read_text()
        index_md.write_text(original + "\n\nNew paragraph added by test.\n")

        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)
        assert "New paragraph added by test." in index_html.read_text()

    def test_editing_html_content_triggers_rebuild(self, watch, site_dir):
        html_dir = site_dir / "content" / "test_html"
        html_dir.mkdir()
        html_file = html_dir / "index.html"
        html_file.write_text("---\ntitle: Test HTML\n---\n\n<p>Original</p>\n")
        dist_html = site_dir / "dist" / "test_html" / "index.html"

        watch.wait_for_rebuild(dist_html, "exists")
        assert "Original" in dist_html.read_text()

        before_mtime = dist_html.stat().st_mtime
        html_file.write_text("---\ntitle: Test HTML\n---\n\n<p>Edited</p>\n")
        watch.wait_for_rebuild(dist_html, "modified", before_mtime=before_mtime)
        assert "Edited" in dist_html.read_text()

    def test_atomic_save_on_markdown_triggers_rebuild(self, watch, site_dir):
        index_md = site_dir / "content" / "index.md"
        index_html = site_dir / "dist" / "index.html"

        before_mtime = index_html.stat().st_mtime
        original = index_md.read_text()
        temp_md = site_dir / "content" / ".index.md.tmp"
        temp_md.write_text(original + "\n\nAtomic save paragraph.\n")
        temp_md.replace(index_md)

        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)
        assert "Atomic save paragraph." in index_html.read_text()


class TestWatchAddContent:
    """Adding a new file to content/ triggers a build."""

    def test_adding_new_markdown_file(self, watch, site_dir):
        index_html = site_dir / "dist" / "index.html"
        before_index_mtime = index_html.stat().st_mtime
        new_md = site_dir / "content" / "new_page.md"
        new_md.write_text("---\ntitle: New Page\n---\n\nHello from new page.\n")

        new_html = site_dir / "dist" / "new_page.html"
        watch.wait_for_rebuild(new_html, "exists")
        assert "Hello from new page." in new_html.read_text()
        assert index_html.stat().st_mtime == before_index_mtime

    def test_adding_new_asset(self, watch, site_dir):
        new_asset = site_dir / "content" / "test_asset.txt"
        new_asset.write_text("test asset content")

        dist_asset = site_dir / "dist" / "test_asset.txt"
        watch.wait_for_rebuild(dist_asset, "exists")
        assert dist_asset.read_text() == "test asset content"


class TestWatchRemoveContent:
    """Removing a Markdown file triggers a build."""

    def test_removing_markdown_triggers_rebuild(self, watch, site_dir):
        md_file = site_dir / "content" / "markdown.md"
        md_file.write_text("---\ntitle: Markdown\n---\n\nSome content.\n")

        dist_md = site_dir / "dist" / "markdown.html"
        watch.wait_for_rebuild(dist_md, "exists")

        index_html = site_dir / "dist" / "index.html"
        before_mtime = index_html.stat().st_mtime
        md_file.unlink()
        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)
        watch.wait_for_rebuild(dist_md, "removed")

    def test_removing_copied_content_asset_removes_dist_file(self, watch, site_dir):
        asset = site_dir / "content" / "notes.txt"
        asset.write_text("asset body")

        dist_asset = site_dir / "dist" / "notes.txt"
        watch.wait_for_rebuild(dist_asset, "exists")
        assert dist_asset.read_text() == "asset body"

        asset.unlink()
        watch.wait_for_rebuild(dist_asset, "removed")

    def test_renaming_markdown_file_updates_output_paths(self, watch, site_dir):
        original_md = site_dir / "content" / "rename_me.md"
        original_md.write_text("---\ntitle: Rename Me\n---\n\nOriginal page.\n")

        original_html = site_dir / "dist" / "rename_me.html"
        watch.wait_for_rebuild(original_html, "exists")
        assert "Original page." in original_html.read_text()

        renamed_md = site_dir / "content" / "renamed.md"
        original_md.rename(renamed_md)

        renamed_html = site_dir / "dist" / "renamed.html"
        watch.wait_for_rebuild(renamed_html, "exists")
        watch.wait_for_rebuild(original_html, "removed")
        assert "Original page." in renamed_html.read_text()

    def test_replacing_copied_content_asset_with_public_file_keeps_output(
        self, watch, site_dir
    ):
        asset = site_dir / "content" / "logo.png"
        asset.write_bytes(b"content-version")

        dist_asset = site_dir / "dist" / "logo.png"
        watch.wait_for_rebuild(dist_asset, "exists")
        assert dist_asset.read_bytes() == b"content-version"

        public_asset = site_dir / "public" / "logo.png"
        asset.unlink()
        public_asset.write_bytes(b"public-version")

        watch.wait_for_reload()
        assert dist_asset.exists()
        assert dist_asset.read_bytes() == b"public-version"


class TestWatchPublicFiles:
    """Editing/adding a file to public/ triggers a build."""

    def test_editing_public_file(self, watch, site_dir):
        public_file = site_dir / "public" / "test.txt"
        dist_file = site_dir / "dist" / "test.txt"

        public_file.write_text("initial public content")
        watch.wait_for_rebuild(dist_file, "exists")

        before_mtime = dist_file.stat().st_mtime
        public_file.write_text("updated public content")

        watch.wait_for_rebuild(dist_file, "modified", before_mtime=before_mtime)
        assert dist_file.read_text() == "updated public content"

    def test_adding_new_public_file(self, watch, site_dir):
        new_public = site_dir / "public" / "new_public.txt"
        new_public.write_text("new public file")

        dist_file = site_dir / "dist" / "new_public.txt"
        watch.wait_for_rebuild(dist_file, "exists")
        assert dist_file.read_text() == "new public file"

    def test_removing_public_file_removes_dist_file(self, watch, site_dir):
        public_file = site_dir / "public" / "gone.txt"
        public_file.write_text("temporary")

        dist_file = site_dir / "dist" / "gone.txt"
        watch.wait_for_rebuild(dist_file, "exists")
        assert dist_file.read_text() == "temporary"

        public_file.unlink()
        watch.wait_for_rebuild(dist_file, "removed")

    def test_public_file_conflicting_with_content_output_errors_and_recovers(
        self, watch, site_dir
    ):
        page = site_dir / "content" / "about.md"
        page.write_text("---\ntitle: About\n---\n\nFrom markdown.\n")

        dist_file = site_dir / "dist" / "about.html"
        watch.wait_for_rebuild(dist_file, "exists")
        assert "From markdown." in dist_file.read_text()

        before_text = dist_file.read_text()
        public_file = site_dir / "public" / "about.html"
        public_file.write_text("<p>From public</p>\n")

        watch.wait_for_error()
        assert watch.proc.poll() is None
        assert dist_file.read_text() == before_text

        public_file.unlink()
        watch.wait_for_reload()
        assert "From markdown." in dist_file.read_text()

    def test_deleting_conflict_side_rebuilds_from_surviving_content(self, watch, site_dir):
        page = site_dir / "content" / "about.md"
        page.write_text("---\ntitle: About\n---\n\nOriginal markdown.\n")

        dist_file = site_dir / "dist" / "about.html"
        watch.wait_for_rebuild(dist_file, "exists")
        assert "Original markdown." in dist_file.read_text()

        page.write_text("---\ntitle: About\n---\n\nUpdated markdown.\n")
        public_file = site_dir / "public" / "about.html"
        public_file.write_text("<p>From public</p>\n")

        watch.wait_for_error()
        assert watch.proc.poll() is None
        assert "Original markdown." in dist_file.read_text()

        public_file.unlink()
        watch.wait_for_reload()
        assert "Updated markdown." in dist_file.read_text()

    def test_replacing_public_file_with_content_page_keeps_output(self, watch, site_dir):
        public_file = site_dir / "public" / "about.html"
        public_file.write_text("<p>From public</p>\n")

        dist_file = site_dir / "dist" / "about.html"
        watch.wait_for_rebuild(dist_file, "exists")
        assert "From public" in dist_file.read_text()

        page = site_dir / "content" / "about.md"
        public_file.unlink()
        page.write_text("---\ntitle: About\n---\n\nFrom markdown.\n")

        watch.wait_for_reload()
        assert dist_file.exists()
        assert "From markdown." in dist_file.read_text()

    def test_content_change_conflicting_with_existing_public_file_errors_without_mutating(
        self, watch, site_dir
    ):
        public_file = site_dir / "public" / "about.html"
        public_file.write_text("<p>From public</p>\n")

        dist_file = site_dir / "dist" / "about.html"
        watch.wait_for_rebuild(dist_file, "exists")
        before_text = dist_file.read_text()

        page = site_dir / "content" / "about.md"
        page.write_text("---\ntitle: About\n---\n\nFrom markdown.\n")

        watch.wait_for_error()
        assert watch.proc.poll() is None
        assert dist_file.read_text() == before_text

    def test_mixed_content_and_public_conflict_does_not_partially_update_dist(
        self, watch, site_dir
    ):
        page = site_dir / "content" / "about.md"
        page.write_text("---\ntitle: About\n---\n\nOriginal markdown.\n")

        dist_file = site_dir / "dist" / "about.html"
        watch.wait_for_rebuild(dist_file, "exists")
        before_text = dist_file.read_text()
        assert "Original markdown." in before_text

        page.write_text("---\ntitle: About\n---\n\nUpdated markdown.\n")
        public_file = site_dir / "public" / "about.html"
        public_file.write_text("<p>From public</p>\n")

        watch.wait_for_error()
        assert watch.proc.poll() is None
        assert dist_file.read_text() == before_text


class TestWatchPartials:
    """Editing a partial triggers a rebuild of pages that include it."""

    def test_editing_partial_triggers_rebuild(self, watch, site_dir):
        partial = site_dir / "content" / "_greeting.md"
        partial.write_text("Hello from partial")

        page = site_dir / "content" / "with_partial.md"
        page.write_text("---\ntitle: Test Partial\n---\n\n<%= include('_greeting.md') %>\n")

        page_html = site_dir / "dist" / "with_partial.html"
        watch.wait_for_rebuild(page_html, "exists")
        assert "Hello from partial" in page_html.read_text()

        before_mtime = page_html.stat().st_mtime
        partial.write_text("Updated greeting")
        watch.wait_for_rebuild(page_html, "modified", before_mtime=before_mtime)
        assert "Updated greeting" in page_html.read_text()

    def test_editing_transitive_partial_in_subdir_triggers_rebuild(self, watch, site_dir):
        subdir = site_dir / "content" / "subdir"
        subdir.mkdir()

        inner = subdir / "_inner.html"
        inner.write_text("<p>Inner partial</p>")

        outer = subdir / "_outer.md"
        outer.write_text("Outer then <%= include('_inner.html') %>")

        page = site_dir / "content" / "transitive.md"
        page.write_text("---\ntitle: Transitive\n---\n\n<%= include('subdir/_outer.md') %>\n")

        page_html = site_dir / "dist" / "transitive.html"
        watch.wait_for_rebuild(page_html, "exists")
        assert "Inner partial" in page_html.read_text()

        before_mtime = page_html.stat().st_mtime
        inner.write_text("<p>Updated inner</p>")
        watch.wait_for_rebuild(page_html, "modified", before_mtime=before_mtime)
        assert "Updated inner" in page_html.read_text()


class TestWatchTraceRebuildsOnJavaChange:
    """Editing a Java file used by renderTrace re-runs the trace."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        yield tmp_path / "testsite"

    def test_trace_rerun_on_java_edit(self, site_dir):
        wp = WatchProcess(site_dir)
        try:
            wp.wait_for_initial_build()

            lab_html = site_dir / "dist" / "labs" / "01" / "index.html"
            assert lab_html.exists()

            manifest_path = (
                site_dir / "dist" / "labs" / "01" / "_traces" / "TraceDemo" / "manifest.json"
            )
            assert manifest_path.exists()
            old_manifest = json.loads(manifest_path.read_text())
            old_steps = old_manifest["totalSteps"]

            before_mtime = manifest_path.stat().st_mtime

            java_file = site_dir / "content" / "labs" / "01" / "TraceDemo.java"
            java_file.write_text(
                "public class TraceDemo {\n"
                "    public static void main(String[] args) {\n"
                '        String s = "changed";\n'
                "    }\n"
                "}\n"
            )

            wp.wait_for_rebuild(manifest_path, "modified", before_mtime=before_mtime)

            new_manifest = json.loads(manifest_path.read_text())
            assert new_manifest["totalSteps"] != old_steps
            assert '"changed"' in new_manifest["source"]
        finally:
            wp.stop()

    def test_editing_trace_page_preserves_trace_artifacts(self, site_dir):
        wp = WatchProcess(site_dir)
        try:
            wp.wait_for_initial_build()

            lab_html = site_dir / "dist" / "labs" / "01" / "index.html"
            assert lab_html.exists()
            before_lab_mtime = lab_html.stat().st_mtime

            trace_manifest = (
                site_dir / "dist" / "labs" / "01" / "_traces" / "TraceDemo" / "manifest.json"
            )
            trace_chunk = (
                site_dir / "dist" / "labs" / "01" / "_traces" / "TraceDemo" / "chunk-0.json"
            )
            assert trace_manifest.exists()
            assert trace_chunk.exists()

            page = site_dir / "content" / "labs" / "01" / "index.md"
            page.write_text(page.read_text() + "\n<!-- keep trace artifacts -->\n")

            wp.wait_for_rebuild(lab_html, "modified", before_mtime=before_lab_mtime)

            assert trace_manifest.exists()
            assert trace_chunk.exists()
        finally:
            wp.stop()


class TestWatchLiterateJavaError:
    """A Java compilation error should stop the build but not crash watch mode."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        yield tmp_path / "testsite"

    def test_compilation_error_no_crash_then_fix(self, site_dir):
        wp = WatchProcess(site_dir)
        try:
            wp.wait_for_initial_build()

            pair_html = site_dir / "dist" / "lectures" / "01" / "Pair.java.html"
            assert pair_html.exists()
            before_mtime = pair_html.stat().st_mtime

            pair_md = site_dir / "content" / "lectures" / "01" / "Pair.java.md"
            original = pair_md.read_text()
            pair_md.write_text(
                "---\ntitle: Pair\n---\n\n"
                "```java\n"
                "public class Pair { this is not valid java }\n"
                "```\n"
            )

            wp.wait_for_error()
            assert wp.proc.poll() is None

            pair_md.write_text(original)

            wp.wait_for_rebuild(pair_html, "modified", before_mtime=before_mtime)
            assert pair_html.exists()
        finally:
            wp.stop()
