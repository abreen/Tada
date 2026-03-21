import os
import subprocess
from pathlib import Path

import pytest

# Resolve the Tada package root (parent of functional_tests/)
PACKAGE_DIR = Path(__file__).resolve().parent.parent
TADA_BIN = PACKAGE_DIR / "bin" / "tada.ts"


def run_tada(*args, cwd=None, timeout=120, check=False, input=None):
    """Run a tada CLI command and return the CompletedProcess."""
    return subprocess.run(
        ["bun", str(TADA_BIN), *args],
        cwd=cwd or os.getcwd(),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=check,
        input=input,
    )


@pytest.fixture
def tada():
    """Provides the run_tada helper."""
    return run_tada


@pytest.fixture
def site_dir(tmp_path):
    """Create a fresh Tada site using init --default in a temp directory.

    Yields the Path to the site directory (tmp_path / 'testsite').
    """
    result = run_tada("init", "testsite", "--default", cwd=str(tmp_path))
    assert result.returncode == 0, f"init failed: {result.stderr}"
    site = tmp_path / "testsite"
    assert site.is_dir()
    yield site


@pytest.fixture
def built_dev_site(site_dir):
    """Create a site and build it with tada dev. Yields the site Path."""
    result = run_tada("dev", cwd=str(site_dir))
    assert result.returncode == 0, f"dev build failed: {result.stderr}"
    yield site_dir


@pytest.fixture
def built_prod_site(site_dir):
    """Create a site and build it with tada prod. Yields the site Path."""
    result = run_tada("prod", cwd=str(site_dir))
    assert result.returncode == 0, f"prod build failed: {result.stderr}"
    yield site_dir
