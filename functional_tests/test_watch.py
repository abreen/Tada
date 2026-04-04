import json
import os
import signal
import subprocess
import threading
import time
from pathlib import Path

import pytest
import websocket

from conftest import TADA_BIN, get_free_ports, run_tada, set_site_config, _bun_command

REBUILD_TIMEOUT_SEC = 30
INITIAL_BUILD_TIMEOUT_SEC = 60
WEBSOCKET_TIMEOUT_SEC = 15
WS_EVENT_WAIT_SEC = 0.5


class WatchProcess:
    """Manages a tada watch subprocess for testing."""

    def __init__(self, site_dir: Path):
        self.site_dir = site_dir
        self.dist_dir = site_dir / "dist"
        http_port, self.ws_port = get_free_ports(2)
        self._stdout_file = open(site_dir / "watch_stdout.log", "w")
        self._stderr_file = open(site_dir / "watch_stderr.log", "w")
        self.proc = subprocess.Popen(
            _bun_command(
                "watch",
                "--port",
                str(http_port),
                "--ws-port",
                str(self.ws_port),
            ),
            cwd=str(site_dir),
            stdout=self._stdout_file,
            stderr=self._stderr_file,
            start_new_session=True,
        )

        # WebSocket state for detecting rebuilds and readiness
        self._reload_event = threading.Event()
        self._ready_event = threading.Event()
        self._error_event = threading.Event()
        self._ws_connected = threading.Event()

        def on_message(ws, message):
            if message == "reload":
                self._reload_event.set()
            elif message == "ready":
                self._ready_event.set()
            elif message == "error":
                self._error_event.set()

        def on_open(ws):
            self._ws_connected.set()

        def on_close(ws, close_status_code, close_msg):
            self._ws_connected.clear()

        self._ws = websocket.WebSocketApp(
            f"ws://localhost:{self.ws_port}",
            on_message=on_message,
            on_open=on_open,
            on_close=on_close,
        )
        self._ws_thread = threading.Thread(
            target=lambda: self._ws.run_forever(reconnect=0.1),
            daemon=True,
        )
        self._ws_thread.start()

    def wait_for_initial_build(self):
        """Block until the watcher is fully ready (initial build + file watching)."""
        deadline = time.monotonic() + INITIAL_BUILD_TIMEOUT_SEC
        saw_error = False
        while time.monotonic() < deadline:
            if self._ready_event.wait(timeout=WS_EVENT_WAIT_SEC):
                return
            if self._error_event.is_set():
                saw_error = True
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"Watch process exited early with code {self.proc.returncode}"
                )
        detail = " (received 'error' WebSocket message during wait)" if saw_error else ""
        raise TimeoutError(f"Initial watch build did not complete in time{detail}")

    def wait_for_error(self):
        """Block until an 'error' WebSocket message is received."""
        deadline = time.monotonic() + REBUILD_TIMEOUT_SEC
        while time.monotonic() < deadline:
            if self._error_event.wait(timeout=WS_EVENT_WAIT_SEC):
                self._error_event.clear()
                return
            if self._reload_event.is_set():
                self._reload_event.clear()
                raise AssertionError(
                    "Expected 'error' WebSocket message but received 'reload' instead"
                )
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"Watch process exited with code {self.proc.returncode}"
                )
        raise TimeoutError("Did not receive 'error' message within timeout")

    def wait_for_rebuild(self, path: Path, condition="modified", before_mtime=None):
        """Wait for a file to be created, modified, or removed.

        Waits for WebSocket 'reload' signals to detect rebuild completion,
        then verifies the file condition.

        condition='exists': wait for path to exist
        condition='modified': wait for mtime to change from before_mtime
        condition='removed': wait for path to not exist

        For 'modified', before_mtime MUST be captured by the caller BEFORE
        making the file change, to avoid a race condition.
        """
        if condition == "modified" and before_mtime is None:
            raise ValueError(
                "before_mtime must be provided for 'modified' condition"
            )

        deadline = time.monotonic() + REBUILD_TIMEOUT_SEC

        def _check():
            if condition == "exists":
                return path.exists()
            elif condition == "removed":
                return not path.exists()
            elif condition == "modified":
                return path.exists() and path.stat().st_mtime > before_mtime
            return False

        self._reload_event.clear()
        while time.monotonic() < deadline:
            if _check():
                return
            if self._reload_event.wait(timeout=WS_EVENT_WAIT_SEC):
                self._reload_event.clear()
                if _check():
                    return
            if self._error_event.is_set():
                self._error_event.clear()
                raise AssertionError(
                    "Expected 'reload' WebSocket message but received 'error' instead"
                )
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"Watch process exited with code {self.proc.returncode}"
                )
        raise TimeoutError(
            f"File {path} did not meet condition '{condition}' within timeout"
        )

    def stop(self):
        """Terminate the watch process and all children (serve, etc.)."""
        if self._ws is not None:
            self._ws.close()
            self._ws = None

        if self.proc.poll() is None:
            pgid = os.getpgid(self.proc.pid)
            os.killpg(pgid, signal.SIGTERM)
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(pgid, signal.SIGKILL)
                self.proc.wait(timeout=5)
        self._stdout_file.close()
        self._stderr_file.close()


@pytest.fixture
def watch(site_dir):
    """Start tada watch, wait for initial build, yield WatchProcess, then stop."""
    wp = WatchProcess(site_dir)
    try:
        wp.wait_for_initial_build()
        yield wp
    finally:
        wp.stop()


class TestWatchEditContent:
    """Modifying a Markdown or HTML file triggers a build."""

    def test_editing_markdown_triggers_rebuild(self, watch, site_dir):
        index_md = site_dir / "content" / "index.md"
        index_html = site_dir / "dist" / "index.html"

        before_mtime = index_html.stat().st_mtime
        original = index_md.read_text()
        index_md.write_text(original + "\n\nNew paragraph added by test.\n")

        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)
        html = index_html.read_text()
        assert "New paragraph added by test." in html

    def test_editing_html_content_triggers_rebuild(self, watch, site_dir):
        # Create a new non-skipped HTML content file
        # (problem_sets/index.html has skip: true, so we can't use it)
        html_dir = site_dir / "content" / "test_html"
        html_dir.mkdir()
        html_file = html_dir / "index.html"
        html_file.write_text("title: Test HTML\n\n<p>Original</p>\n")
        dist_html = site_dir / "dist" / "test_html" / "index.html"

        watch.wait_for_rebuild(dist_html, "exists")
        assert "Original" in dist_html.read_text()

        before_mtime = dist_html.stat().st_mtime
        html_file.write_text("title: Test HTML\n\n<p>Edited</p>\n")
        watch.wait_for_rebuild(dist_html, "modified", before_mtime=before_mtime)
        assert "Edited" in dist_html.read_text()


class TestWatchAddContent:
    """Adding a new file to content/ triggers a build."""

    def test_adding_new_markdown_file(self, watch, site_dir):
        new_md = site_dir / "content" / "new_page.md"
        new_md.write_text("title: New Page\n\nHello from new page.\n")

        new_html = site_dir / "dist" / "new_page.html"
        watch.wait_for_rebuild(new_html, "exists")
        html = new_html.read_text()
        assert "Hello from new page." in html

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
        md_file.write_text("title: Markdown\n\nSome content.\n")

        dist_md = site_dir / "dist" / "markdown.html"
        watch.wait_for_rebuild(dist_md, "exists")

        index_html = site_dir / "dist" / "index.html"
        before_mtime = index_html.stat().st_mtime
        md_file.unlink()
        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)


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


class TestWatchConfig:
    """Modifying the site config triggers a build."""

    def test_config_change_triggers_full_rebuild(self, watch, site_dir):
        index_html = site_dir / "dist" / "index.html"

        before_mtime = index_html.stat().st_mtime
        set_site_config(site_dir, {"title": "Updated Title For Test"})

        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)
        html = index_html.read_text()
        assert "Updated Title For Test" in html


class TestWatchWebSocket:
    """Watch mode uses a WebSocket to tell the client to reload."""

    def test_receives_reload_message_on_content_change(self, watch, site_dir):
        """Connect to the watch WebSocket and verify a 'reload' message is
        broadcast when a content file changes."""
        messages = []
        connected = threading.Event()
        done = threading.Event()

        def on_message(ws, message):
            messages.append(message)
            if message == "reload":
                done.set()

        def on_open(ws):
            connected.set()

        ws = websocket.WebSocketApp(
            f"ws://localhost:{watch.ws_port}",
            on_message=on_message,
            on_open=on_open,
        )
        ws_thread = threading.Thread(target=ws.run_forever, daemon=True)
        ws_thread.start()

        assert connected.wait(timeout=WEBSOCKET_TIMEOUT_SEC), (
            f"WebSocket did not connect on port {watch.ws_port}"
        )

        # Trigger a content change
        index_md = site_dir / "content" / "index.md"
        original = index_md.read_text()
        index_md.write_text(original + "\n\nWebSocket test paragraph.\n")

        assert done.wait(timeout=WEBSOCKET_TIMEOUT_SEC), (
            f"Did not receive 'reload' message; got: {messages}"
        )
        assert "reload" in messages
        ws.close()

    def test_watch_build_includes_reload_client(self, watch, site_dir):
        """Watch mode must produce a non-empty watch-reload-client bundle
        that contains the WebSocket client code."""
        client_bundle = site_dir / "dist" / "watch-reload-client.bundle.js"
        assert client_bundle.exists(), "watch-reload-client.bundle.js not in dist/"
        content = client_bundle.read_text()
        assert "WebSocket" in content, (
            "watch-reload-client.bundle.js is empty or missing WebSocket code"
        )


class TestWatchBadConfigAtStart:
    """Starting watch with an invalid config does not crash; fixing it recovers."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Break the config by removing the required "title" field
        config_path = site / "site.dev.json"
        config = json.loads(config_path.read_text())
        del config["title"]
        config_path.write_text(json.dumps(config, indent=2) + "\n")

        yield site

    def test_bad_config_no_crash_then_fix(self, site_dir):
        wp = WatchProcess(site_dir)
        try:
            wp.wait_for_initial_build()  # "ready" is broadcast regardless of build success

            # The deferred "error" event should have been broadcast before "ready"
            assert wp._error_event.is_set()
            wp._error_event.clear()

            # Initial build should have failed, so no dist output
            assert not (site_dir / "dist" / "index.html").exists()

            # Process must still be running
            assert wp.proc.poll() is None

            # Fix the config by restoring the title
            set_site_config(site_dir, {"title": "Recovered Title"})

            # Wait for the successful rebuild
            index_html = site_dir / "dist" / "index.html"
            wp.wait_for_rebuild(index_html, "exists")

            html = index_html.read_text()
            assert "Recovered Title" in html
        finally:
            wp.stop()


class TestWatchConfigBreakAndRecover:
    """Breaking the config mid-watch causes an error event; fixing it recovers."""

    def test_break_config_then_fix(self, watch, site_dir):
        index_html = site_dir / "dist" / "index.html"
        assert index_html.exists()
        before_mtime = index_html.stat().st_mtime

        # Break the config by removing the required "title" field
        config_path = site_dir / "site.dev.json"
        config = json.loads(config_path.read_text())
        original_title = config["title"]
        del config["title"]
        config_path.write_text(json.dumps(config, indent=2) + "\n")

        # Should receive an error event (not a crash)
        watch.wait_for_error()

        # Process must still be running
        assert watch.proc.poll() is None

        # Fix the config
        config["title"] = original_title
        config_path.write_text(json.dumps(config, indent=2) + "\n")

        # Wait for the successful rebuild
        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)

        html = index_html.read_text()
        assert original_title in html


class TestWatchConfigFileDetection:
    """Deleting/moving & re-adding config files re-builds and doesn't crash."""

    def test_editing_nav_json_triggers_rebuild(self, watch, site_dir):
        index_html = site_dir / "dist" / "index.html"
        before_mtime = index_html.stat().st_mtime

        nav_path = site_dir / "nav.json"
        nav = json.loads(nav_path.read_text())
        nav_path.write_text(json.dumps(nav, indent=2) + "\n")

        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)

    def test_deleting_nav_json_triggers_error_then_restore_recovers(self, watch, site_dir):
        index_html = site_dir / "dist" / "index.html"
        assert index_html.exists()
        before_mtime = index_html.stat().st_mtime

        nav_path = site_dir / "nav.json"
        nav_backup = nav_path.read_text()
        nav_path.unlink()

        watch.wait_for_error()
        assert watch.proc.poll() is None

        nav_path.write_text(nav_backup)
        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)

    def test_missing_nav_json_at_start_then_create_recovers(self, tmp_path):
        result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site_dir = tmp_path / "testsite"

        nav_path = site_dir / "nav.json"
        nav_backup = nav_path.read_text()
        nav_path.unlink()

        wp = WatchProcess(site_dir)
        try:
            wp.wait_for_initial_build()
            assert wp._error_event.is_set()
            wp._error_event.clear()
            assert not (site_dir / "dist" / "index.html").exists()
            assert wp.proc.poll() is None

            nav_path.write_text(nav_backup)

            index_html = site_dir / "dist" / "index.html"
            wp.wait_for_rebuild(index_html, "exists")
            assert index_html.exists()
        finally:
            wp.stop()

    def test_deleting_site_config_triggers_error_then_restore_recovers(self, watch, site_dir):
        index_html = site_dir / "dist" / "index.html"
        assert index_html.exists()
        before_mtime = index_html.stat().st_mtime

        config_path = site_dir / "site.dev.json"
        config_backup = config_path.read_text()
        config_path.unlink()

        watch.wait_for_error()
        assert watch.proc.poll() is None

        config_path.write_text(config_backup)
        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)


    def test_creating_authors_json_triggers_rebuild(self, watch, site_dir):
        index_html = site_dir / "dist" / "index.html"
        before_mtime = index_html.stat().st_mtime

        # Create the avatar file so the authors.json avatar path is valid
        avatar_dir = site_dir / "public" / "avatars"
        avatar_dir.mkdir(parents=True)
        (avatar_dir / "jdoe.png").write_bytes(b"")

        watch.wait_for_rebuild(site_dir / "dist" / "avatars" / "jdoe.png", "exists")
        before_mtime = index_html.stat().st_mtime

        authors_path = site_dir / "authors.json"
        assert not authors_path.exists()
        authors_path.write_text(json.dumps({"jdoe": {"name": "Jane Doe", "avatar": "/avatars/jdoe.png"}}) + "\n")

        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)


class TestWatchPartials:
    """Editing a partial triggers a rebuild of pages that include it."""

    def test_editing_partial_triggers_rebuild(self, watch, site_dir):
        # Create a partial and a page that includes it
        partial = site_dir / "content" / "_greeting.md"
        partial.write_text("Hello from partial")

        page = site_dir / "content" / "with_partial.md"
        page.write_text("title: Test Partial\n\n<%= include('_greeting.md') %>\n")

        page_html = site_dir / "dist" / "with_partial.html"
        watch.wait_for_rebuild(page_html, "exists")
        assert "Hello from partial" in page_html.read_text()

        # Now edit the partial and verify the page is rebuilt
        before_mtime = page_html.stat().st_mtime
        partial.write_text("Updated greeting")
        watch.wait_for_rebuild(page_html, "modified", before_mtime=before_mtime)
        assert "Updated greeting" in page_html.read_text()

    def test_editing_transitive_partial_in_subdir_triggers_rebuild(self, watch, site_dir):
        # Create a nested partial structure:
        # page.md -> subdir/_outer.md -> subdir/_inner.html
        subdir = site_dir / "content" / "subdir"
        subdir.mkdir()

        inner = subdir / "_inner.html"
        inner.write_text("<p>Inner partial</p>")

        outer = subdir / "_outer.md"
        outer.write_text("Outer then <%= include('_inner.html') %>")

        page = site_dir / "content" / "transitive.md"
        page.write_text("title: Transitive\n\n<%= include('subdir/_outer.md') %>\n")

        page_html = site_dir / "dist" / "transitive.html"
        watch.wait_for_rebuild(page_html, "exists")
        assert "Inner partial" in page_html.read_text()

        # Edit the deeply nested partial and verify the page rebuilds
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

            # The lab page that calls renderTrace('TraceDemo.java') should exist
            lab_html = site_dir / "dist" / "labs" / "01" / "index.html"
            assert lab_html.exists()

            # Trace chunks should exist from the initial build
            manifest_path = (
                site_dir / "dist" / "labs" / "01" / "_traces" / "TraceDemo" / "manifest.json"
            )
            assert manifest_path.exists()
            old_manifest = json.loads(manifest_path.read_text())
            old_steps = old_manifest["totalSteps"]

            before_mtime = manifest_path.stat().st_mtime

            # Edit the Java file to change the trace output
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
            # The trace should have been re-run (different step count)
            assert new_manifest["totalSteps"] != old_steps
            assert '"changed"' in new_manifest["source"]
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

            # Pair.java.md should have been compiled and rendered
            pair_html = site_dir / "dist" / "lectures" / "01" / "Pair.java.html"
            assert pair_html.exists()
            before_mtime = pair_html.stat().st_mtime

            # Introduce a compilation error
            pair_md = site_dir / "content" / "lectures" / "01" / "Pair.java.md"
            original = pair_md.read_text()
            pair_md.write_text(
                "title: Pair\n\n"
                "```java\n"
                "public class Pair { this is not valid java }\n"
                "```\n"
            )

            # Should receive an error event (not a crash)
            wp.wait_for_error()
            assert wp.proc.poll() is None

            # Restore the original file
            pair_md.write_text(original)

            # Wait for successful rebuild
            wp.wait_for_rebuild(pair_html, "modified", before_mtime=before_mtime)
            assert pair_html.exists()
        finally:
            wp.stop()
