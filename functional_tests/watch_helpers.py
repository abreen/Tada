import subprocess
import threading
import time
from pathlib import Path

import pytest
import websocket

from conftest import (
    _bun_command,
    get_free_ports,
    process_group_popen_kwargs,
    terminate_process_group,
)

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
            **process_group_popen_kwargs(),
        )

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
        # Drop a stale reload from a prior successful build step.
        self._reload_event.clear()
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
        """Wait for a file to be created, modified, or removed."""
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

    def wait_for_reload(self):
        """Block until a 'reload' WebSocket message is received."""
        deadline = time.monotonic() + REBUILD_TIMEOUT_SEC
        # Drop a stale error from a prior failing build step.
        self._error_event.clear()
        self._reload_event.clear()
        while time.monotonic() < deadline:
            if self._reload_event.wait(timeout=WS_EVENT_WAIT_SEC):
                self._reload_event.clear()
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
        raise TimeoutError("Did not receive 'reload' message within timeout")

    def assert_no_reload(self, timeout_sec=3):
        """Assert that no 'reload' WebSocket message is received for a period."""
        deadline = time.monotonic() + timeout_sec
        self._reload_event.clear()
        while time.monotonic() < deadline:
            if self._reload_event.wait(timeout=WS_EVENT_WAIT_SEC):
                self._reload_event.clear()
                raise AssertionError("Expected no 'reload' WebSocket message")
            if self._error_event.is_set():
                self._error_event.clear()
                raise AssertionError(
                    "Expected no rebuild outcome but received 'error' instead"
                )
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"Watch process exited with code {self.proc.returncode}"
                )

    def stop(self):
        """Terminate the watch process and all children (serve, etc.)."""
        if self._ws is not None:
            self._ws.close()
            self._ws = None
        if self._ws_thread is not None and self._ws_thread.is_alive():
            self._ws_thread.join(timeout=2)

        terminate_process_group(self.proc)
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
