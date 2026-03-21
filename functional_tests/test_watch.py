import json
import os
import signal
import subprocess
import threading
import time
from pathlib import Path

import pytest
import websocket

from conftest import TADA_BIN

REBUILD_POLL_INTERVAL = 0.5  # seconds
REBUILD_TIMEOUT = 30  # seconds
INITIAL_BUILD_TIMEOUT = 60  # seconds


class WatchProcess:
    """Manages a tada watch subprocess for testing."""

    def __init__(self, site_dir: Path):
        self.site_dir = site_dir
        self.dist_dir = site_dir / "dist"
        self._stdout_file = open(site_dir / "watch_stdout.log", "w")
        self._stderr_file = open(site_dir / "watch_stderr.log", "w")
        self.proc = subprocess.Popen(
            ["bun", str(TADA_BIN), "watch"],
            cwd=str(site_dir),
            stdout=self._stdout_file,
            stderr=self._stderr_file,
            start_new_session=True,
        )

    def wait_for_initial_build(self):
        """Block until initial build is complete (dist/index.html exists)."""
        deadline = time.monotonic() + INITIAL_BUILD_TIMEOUT
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"Watch process exited early with code {self.proc.returncode}"
                )
            if (self.dist_dir / "index.html").exists():
                # Give a moment for the watcher to fully set up
                time.sleep(1)
                return
            time.sleep(REBUILD_POLL_INTERVAL)
        raise TimeoutError("Initial watch build did not complete in time")

    def wait_for_rebuild(self, path: Path, condition="modified", before_mtime=None):
        """Wait for a file to be created, modified, or removed.

        condition='exists': wait for path to exist
        condition='modified': wait for mtime to change from before_mtime
        condition='removed': wait for path to not exist

        For 'modified', before_mtime MUST be captured by the caller BEFORE
        making the file change, to avoid a race condition.
        """
        deadline = time.monotonic() + REBUILD_TIMEOUT
        if condition == "exists":
            while time.monotonic() < deadline:
                if path.exists():
                    return
                time.sleep(REBUILD_POLL_INTERVAL)
            raise TimeoutError(f"File {path} was not created within timeout")
        elif condition == "removed":
            while time.monotonic() < deadline:
                if not path.exists():
                    return
                time.sleep(REBUILD_POLL_INTERVAL)
            raise TimeoutError(f"File {path} was not removed within timeout")
        elif condition == "modified":
            if before_mtime is None:
                raise ValueError(
                    "before_mtime must be provided for 'modified' condition"
                )
            while time.monotonic() < deadline:
                if path.exists() and path.stat().st_mtime > before_mtime:
                    return
                time.sleep(REBUILD_POLL_INTERVAL)
            raise TimeoutError(f"File {path} was not modified within timeout")

    def stop(self):
        """Terminate the watch process and all children (serve, etc.)."""
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
    def test_removing_markdown_triggers_rebuild(self, watch, site_dir):
        md_file = site_dir / "content" / "markdown.md"
        index_html = site_dir / "dist" / "index.html"
        assert md_file.exists()

        # Tada does not currently delete stale HTML from dist/ when a
        # content file is removed. Instead, verify that a rebuild occurs
        # by checking that index.html is re-rendered (mtime changes).
        before_mtime = index_html.stat().st_mtime
        md_file.unlink()
        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)


class TestWatchPublicFiles:
    def test_editing_public_file(self, watch, site_dir):
        public_file = site_dir / "public" / "test.txt"
        dist_file = site_dir / "dist" / "test.txt"

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
    def test_config_change_triggers_full_rebuild(self, watch, site_dir):
        config_path = site_dir / "site.dev.json"
        index_html = site_dir / "dist" / "index.html"

        before_mtime = index_html.stat().st_mtime
        config = json.loads(config_path.read_text())
        config["title"] = "Updated Title For Test"
        config_path.write_text(json.dumps(config, indent=2))

        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)
        html = index_html.read_text()
        assert "Updated Title For Test" in html


WEBSOCKET_URL = "ws://localhost:35729"
WEBSOCKET_TIMEOUT = 15  # seconds


class TestWatchWebSocket:
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
            WEBSOCKET_URL,
            on_message=on_message,
            on_open=on_open,
        )
        ws_thread = threading.Thread(target=ws.run_forever, daemon=True)
        ws_thread.start()

        assert connected.wait(timeout=WEBSOCKET_TIMEOUT), (
            "WebSocket did not connect — server may not be listening on port 35729"
        )

        # Trigger a content change
        index_md = site_dir / "content" / "index.md"
        original = index_md.read_text()
        index_md.write_text(original + "\n\nWebSocket test paragraph.\n")

        assert done.wait(timeout=WEBSOCKET_TIMEOUT), (
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
            "watch-reload-client.bundle.js is empty or missing WebSocket code "
            "(possibly tree-shaken by bundler)"
        )
