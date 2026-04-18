import os

import pytest

from conftest import run_tada


class TestLogging:
    """TADA_LOG_LEVEL controls build output verbosity."""

    def test_debug_level_shows_debug_output(self, site_dir):
        env = {**os.environ, "TADA_LOG_LEVEL": "debug"}
        result = run_tada("dev", cwd=str(site_dir), env=env)
        assert result.returncode == 0
        assert "Compiling templates" in result.stderr
        assert "Finding reachable pages for search index" in result.stderr

    def test_error_level_suppresses_info(self, site_dir):
        env = {**os.environ, "TADA_LOG_LEVEL": "error"}
        result = run_tada("dev", cwd=str(site_dir), env=env)
        assert result.returncode == 0
        default_result = run_tada("dev", cwd=str(site_dir))
        assert default_result.returncode == 0
        default_output = default_result.stdout + default_result.stderr
        assert "Building search index for 1 page" in default_output
        error_output = result.stdout + result.stderr
        assert "Building search index for 1 page" not in error_output
