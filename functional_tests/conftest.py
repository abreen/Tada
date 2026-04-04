import json
import os
import socket
import subprocess
from pathlib import Path

import pytest

# Resolve the Tada package root (parent of functional_tests/)
PACKAGE_DIR = Path(__file__).resolve().parent.parent
TADA_BIN = PACKAGE_DIR / "bin" / "tada.ts"


def pytest_configure(config):
    """When AGENT is set, reduce output verbosity."""
    if os.environ.get("AGENT", ""):
        config.option.verbose = -1
        config.option.tbstyle = "line"
        config.option.durations = None
        config.option.no_header = True


def get_free_ports(n=2):
    """Allocate n free TCP ports by binding to port 0."""
    sockets = []
    ports = []
    for _ in range(n):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('127.0.0.1', 0))
        ports.append(s.getsockname()[1])
        sockets.append(s)
    for s in sockets:
        s.close()
    return ports


def set_site_config(site_dir, overrides, config_file="site.dev.json"):
    """Read a site config file, deep-merge overrides, and write it back."""
    config_path = site_dir / config_file
    config = json.loads(config_path.read_text())
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(config.get(key), dict):
            config[key].update(value)
        else:
            config[key] = value
    config_path.write_text(json.dumps(config, indent=2) + "\n")


COVERAGE_PRELOAD = PACKAGE_DIR / "scripts" / "coverage-preload.ts"


def _bun_command(*args):
    """Build the bun command, injecting --preload for coverage if enabled."""
    cmd = ["bun"]
    if os.environ.get("TADA_COVERAGE"):
        cmd.extend(["--preload", str(COVERAGE_PRELOAD)])
    cmd.append(str(TADA_BIN))
    cmd.extend(args)
    return cmd


def run_tada(*args, cwd=None, timeout=120, check=False, input=None):
    """Run a tada CLI command and return the CompletedProcess."""
    return subprocess.run(
        _bun_command(*args),
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
    """Create a bare Tada site using init --bare --no-interactive in a temp directory.

    Yields the Path to the site directory (tmp_path / 'testsite').
    """
    result = run_tada("init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path))
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
