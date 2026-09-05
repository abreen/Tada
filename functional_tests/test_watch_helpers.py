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
