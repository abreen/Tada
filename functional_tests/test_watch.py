import json
import os
import signal
import subprocess
import threading
import time
from pathlib import Path

import pytest
import websocket

from conftest import TADA_BIN, get_free_ports, run_tada

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
            [
                "bun",
                str(TADA_BIN),
                "watch",
                "--port",
                str(http_port),
                "--ws-port",
                str(self.ws_port),
            ],
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
        while time.monotonic() < deadline:
            if self._ready_event.wait(timeout=WS_EVENT_WAIT_SEC):
                return
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"Watch process exited early with code {self.proc.returncode}"
                )
        raise TimeoutError("Initial watch build did not complete in time")

    def wait_for_error(self):
        """Block until an 'error' WebSocket message is received."""
        deadline = time.monotonic() + REBUILD_TIMEOUT_SEC
        while time.monotonic() < deadline:
            if self._error_event.wait(timeout=WS_EVENT_WAIT_SEC):
                self._error_event.clear()
                return
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
        md_file.write_text("title: Markdown\n\nSome content.\n")

        dist_md = site_dir / "dist" / "markdown.html"
        watch.wait_for_rebuild(dist_md, "exists")

        index_html = site_dir / "dist" / "index.html"
        before_mtime = index_html.stat().st_mtime
        md_file.unlink()
        watch.wait_for_rebuild(index_html, "modified", before_mtime=before_mtime)


class TestWatchPublicFiles:
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

            # Initial build should have failed — no dist output
            assert not (site_dir / "dist" / "index.html").exists()

            # Process must still be running
            assert wp.proc.poll() is None

            # Fix the config by restoring the title
            config_path = site_dir / "site.dev.json"
            config = json.loads(config_path.read_text())
            config["title"] = "Recovered Title"
            config_path.write_text(json.dumps(config, indent=2) + "\n")

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
