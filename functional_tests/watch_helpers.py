import re
import subprocess
import time
from pathlib import Path

import pytest

from conftest import (
    _bun_command,
    get_free_ports,
    process_group_popen_kwargs,
    terminate_process_group,
)

REBUILD_TIMEOUT_SEC = 30
INITIAL_BUILD_TIMEOUT_SEC = 60
WEBSOCKET_TIMEOUT_SEC = 15
POLL_SEC = 0.05
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


class WatchProcess:
    """Manages a tada watch subprocess for testing."""

    def __init__(self, site_dir: Path):
        self.site_dir = site_dir
        self.dist_dir = site_dir / "dist"
        self.stdout_log_path = site_dir / "watch_stdout.log"
        self.stderr_log_path = site_dir / "watch_stderr.log"
        http_port, self.ws_port = get_free_ports(2)
        self._stdout_file = open(self.stdout_log_path, "w")
        self._stderr_file = open(self.stderr_log_path, "w")
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
        self._stdout_cursor = 0

    def _stdout_text(self) -> str:
        try:
            return self.stdout_log_path.read_text()
        except FileNotFoundError:
            return ""

    def _stdout_len(self) -> int:
        return len(self._stdout_text())

    def _stdout_since(self, start: int) -> str:
        return self._stdout_text()[start:]

    def _clean(self, text: str) -> str:
        return ANSI_RE.sub("", text)

    def _has_error_since(self, start: int) -> bool:
        return " error " in self._clean(self._stdout_since(start)).lower()

    def _advance_stdout_cursor(self) -> None:
        self._stdout_cursor = self._stdout_len()

    def wait_for_initial_build(self):
        """Block until watch mode is active after its initial build attempt."""
        deadline = time.monotonic() + INITIAL_BUILD_TIMEOUT_SEC
        index_html = self.dist_dir / "index.html"
        while time.monotonic() < deadline:
            stdout = self._stdout_text()
            watching_started = "Watching for changes..." in stdout
            if watching_started and index_html.exists():
                self._advance_stdout_cursor()
                return
            if watching_started and self._has_error_since(0):
                self._advance_stdout_cursor()
                return
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"Watch process exited early with code {self.proc.returncode}"
                )
            time.sleep(POLL_SEC)
        raise TimeoutError("Initial watch build did not complete in time")

    def wait_for_error(self, after: int | None = None):
        """Block until the watch process logs a new build error."""
        deadline = time.monotonic() + REBUILD_TIMEOUT_SEC
        start = self._stdout_cursor if after is None else after
        while time.monotonic() < deadline:
            if self._has_error_since(start):
                self._advance_stdout_cursor()
                return
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"Watch process exited with code {self.proc.returncode}"
                )
            time.sleep(POLL_SEC)
        raise TimeoutError("Did not observe a build error within timeout")

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
            if condition == "removed":
                return not path.exists()
            if condition == "modified":
                return path.exists() and path.stat().st_mtime > before_mtime
            return False

        while time.monotonic() < deadline:
            if _check():
                self._advance_stdout_cursor()
                return
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"Watch process exited with code {self.proc.returncode}"
                )
            time.sleep(POLL_SEC)
        raise TimeoutError(
            f"File {path} did not meet condition '{condition}' within timeout"
        )

    def assert_no_rebuild(self, path: Path, before_mtime: float, timeout_sec=3):
        """Assert that a file is not modified for a period."""
        deadline = time.monotonic() + timeout_sec
        while time.monotonic() < deadline:
            if path.stat().st_mtime > before_mtime:
                raise AssertionError(f"Expected no rebuild for {path}")
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"Watch process exited with code {self.proc.returncode}"
                )
            time.sleep(POLL_SEC)

    def stop(self):
        """Terminate the watch process and all children (serve, etc.)."""
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
