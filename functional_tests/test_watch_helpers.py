import os
from pathlib import Path
from types import SimpleNamespace

import pytest
import watch_helpers
from watch_helpers import WatchProcess


def completed_rebuild(tmp_path):
    watch = WatchProcess.__new__(WatchProcess)
    watch.stdout_log_path = tmp_path / 'stdout.log'
    watch.stderr_log_path = tmp_path / 'stderr.log'
    watch.stdout_log_path.write_text('Page modified, rebuilding\nBuilt! 🎉\n')
    watch.stderr_log_path.write_text('')
    watch.proc = SimpleNamespace(poll=lambda: None)
    watch._stdout_cursor = 0
    output = tmp_path / 'index.html'
    output.write_text('Original page')
    os.utime(output, (1, 1))
    before_mtime = output.stat().st_mtime
    output.write_text('Updated page')
    return watch, output, before_mtime


def test_modified_wait_accepts_rebuild_completed_before_wait(tmp_path, monkeypatch):
    watch, output, before_mtime = completed_rebuild(tmp_path)
    monkeypatch.setattr(watch_helpers, 'REBUILD_TIMEOUT_SEC', 0.1)

    watch.wait_for_rebuild(output, 'modified', before_mtime=before_mtime)
    assert watch._stdout_cursor == len(watch.stdout_log_path.read_text())


def test_no_rebuild_detects_modification_completed_before_wait(tmp_path):
    watch, output, before_mtime = completed_rebuild(tmp_path)

    with pytest.raises(AssertionError, match='Expected no rebuild'):
        watch.assert_no_rebuild(output, before_mtime, timeout_sec=0.1)


def test_modified_wait_requires_started_rebuild_to_succeed(tmp_path, monkeypatch):
    watch, output, before_mtime = completed_rebuild(tmp_path)
    watch.stdout_log_path.write_text('Page modified, rebuilding\n')
    monkeypatch.setattr(watch_helpers, 'REBUILD_TIMEOUT_SEC', 0.1)

    with pytest.raises(TimeoutError, match="did not meet condition 'modified'"):
        watch.wait_for_rebuild(output, 'modified', before_mtime=before_mtime)


@pytest.mark.parametrize('rebuild_completed', [False, True])
def test_modified_wait_snapshot_requires_output_change(tmp_path, monkeypatch, rebuild_completed):
    watch, output, _ = completed_rebuild(tmp_path)
    before_snapshot = watch.snapshot(output)
    if not rebuild_completed:
        watch.stdout_log_path.write_text('Watching for changes...\n')
    monkeypatch.setattr(watch_helpers, 'REBUILD_TIMEOUT_SEC', 0.1)

    with pytest.raises(TimeoutError, match="did not meet condition 'modified'"):
        watch.wait_for_rebuild(output, 'modified', before_mtime=before_snapshot)


def test_modified_wait_snapshot_detects_same_mtime_content_change(tmp_path):
    watch, output, _ = completed_rebuild(tmp_path)
    before_snapshot = watch.snapshot(output)
    output.write_text('Another page')
    os.utime(output, ns=(before_snapshot['mtime_ns'], before_snapshot['mtime_ns']))

    watch.wait_for_rebuild(output, 'modified', before_mtime=before_snapshot)
    assert watch._stdout_cursor == len(watch.stdout_log_path.read_text())


def test_no_rebuild_accepts_unchanged_snapshot(tmp_path):
    watch, output, _ = completed_rebuild(tmp_path)

    watch.assert_no_rebuild(output, watch.snapshot(output), timeout_sec=0.1)


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
