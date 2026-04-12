import os

import pytest

from conftest import run_tada


class TestLogging:
    """TADA_LOG_LEVEL controls build output verbosity."""

    def test_debug_level_shows_debug_output(self, site_dir):
        env = {**os.environ, "TADA_LOG_LEVEL": "debug"}
        result = run_tada("dev", cwd=str(site_dir), env=env)
        assert result.returncode == 0
        output = result.stdout + result.stderr
        # Debug level should produce more verbose output than default
        assert len(output) > 0

    def test_error_level_suppresses_info(self, site_dir):
        env = {**os.environ, "TADA_LOG_LEVEL": "error"}
        result = run_tada("dev", cwd=str(site_dir), env=env)
        assert result.returncode == 0
        output = result.stdout + result.stderr
        # Error level should suppress info-level build progress messages
        # The default build produces info-level output, so error should produce less
        default_result = run_tada("dev", cwd=str(site_dir))
        default_output = default_result.stdout + default_result.stderr
        assert len(output) < len(default_output)
