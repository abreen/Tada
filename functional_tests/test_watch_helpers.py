from pathlib import Path
from types import SimpleNamespace

import pytest
import watch_helpers
from watch_helpers import WatchProcess


def test_timeout_includes_watch_process_diagnostics(tmp_path, monkeypatch):
    watch = WatchProcess.__new__(WatchProcess)
    watch.stdout_log_path = tmp_path / 'stdout.log'
    watch.stderr_log_path = tmp_path / 'stderr.log'
    watch.stdout_log_path.write_text('avatar added, rebuilding\npublication failed\n')
    watch.stderr_log_path.write_text('filesystem diagnostic\n')
    watch.proc = SimpleNamespace(poll=lambda: None)
    watch._stdout_cursor = 0
    monkeypatch.setattr(watch_helpers, 'REBUILD_TIMEOUT_SEC', 0)

    with pytest.raises(TimeoutError) as error:
        watch.wait_for_rebuild(tmp_path / 'missing.png', 'exists')

    message = str(error.value)
    assert 'missing.png' in message
    assert 'publication failed' in message
    assert 'filesystem diagnostic' in message
    assert 'running' in message


def test_file_snapshot_tolerates_file_directory_transitions(tmp_path):
    watch = WatchProcess.__new__(WatchProcess)
    parent = tmp_path / 'parent'
    parent.write_text('file')
    assert watch._file_snapshot(parent / 'child') is None
    parent.unlink()
    parent.mkdir()
    assert watch._file_snapshot(parent) is None


@pytest.mark.parametrize('directory_before_stat', [True, False])
def test_file_snapshot_handles_windows_directory_read(tmp_path, monkeypatch, directory_before_stat):
    watch = WatchProcess.__new__(WatchProcess)
    path = tmp_path / 'transition'
    if directory_before_stat:
        path.mkdir()
    else:
        path.write_text('file')

    def windows_read_bytes(self):
        if self.is_file():
            self.unlink()
            self.mkdir()
        raise PermissionError(13, 'Permission denied', str(self))

    monkeypatch.setattr(Path, 'read_bytes', windows_read_bytes)
    assert watch._file_snapshot(path) is None


def test_file_snapshot_preserves_file_permission_errors(tmp_path, monkeypatch):
    watch = WatchProcess.__new__(WatchProcess)
    path = tmp_path / 'file'
    path.write_text('file')

    def denied_read_bytes(self):
        raise PermissionError(13, 'Permission denied', str(self))

    monkeypatch.setattr(Path, 'read_bytes', denied_read_bytes)
    with pytest.raises(PermissionError):
        watch._file_snapshot(path)
