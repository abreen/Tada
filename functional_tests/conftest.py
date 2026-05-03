import json
import os
import signal
import socket
import stat
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

pytest_plugins = ['watch_helpers']

# Resolve the Tada package root (parent of functional_tests/)
PACKAGE_DIR = Path(__file__).resolve().parent.parent
TADA_BIN = PACKAGE_DIR / 'bin' / 'tada.ts'
SITE_DEV_CONFIG_FILE = 'site.dev.yaml'
SITE_PROD_CONFIG_FILE = 'site.prod.yaml'
NAV_CONFIG_FILE = 'nav.yaml'
AUTHORS_CONFIG_FILE = 'authors.yaml'


def pytest_addoption(parser):
    parser.addoption(
        '--shard', type=int, default=None, help='1-indexed shard number (requires --num-shards)'
    )
    parser.addoption(
        '--num-shards', type=int, default=1, help='Total number of shards to split tests across'
    )
    parser.addoption(
        '--coverage',
        action='store_true',
        default=False,
        help='Collect Tada Istanbul coverage while running functional tests',
    )


COVERAGE_ENABLED = False


def pytest_configure(config):
    global COVERAGE_ENABLED
    COVERAGE_ENABLED = config.getoption('--coverage')


def pytest_collection_modifyitems(config, items):
    """Split collected tests by file across shards using round-robin."""
    shard = config.getoption('--shard')
    num_shards = config.getoption('--num-shards')
    if shard is None or num_shards <= 1:
        return
    files = sorted(set(str(item.fspath) for item in items))
    shard_files = set(f for i, f in enumerate(files) if i % num_shards == shard - 1)
    items[:] = [item for item in items if str(item.fspath) in shard_files]


def init_site(tmp_path, *, bare=True, extra_args=None):
    """Create a Tada site and return the site directory path."""
    args = ['init', 'testsite']
    if bare:
        args.append('--bare')
    args.append('--no-interactive')
    if extra_args:
        args.extend(extra_args)

    result = run_tada(*args, cwd=str(tmp_path))
    assert result.returncode == 0, f'init failed: {result.stderr}'

    site = tmp_path / 'testsite'
    assert site.is_dir()
    return site


def load_structured_file(file_path):
    return yaml.safe_load(file_path.read_text())


def write_structured_file(file_path, value):
    if file_path.suffix == '.json':
        file_path.write_text(json.dumps(value, indent=2) + '\n')
    else:
        file_path.write_text(yaml.safe_dump(value, sort_keys=False))


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


def set_site_config(site_dir, overrides, config_file=SITE_DEV_CONFIG_FILE):
    """Read a site config file, deep-merge overrides, and write it back."""
    config_path = site_dir / config_file
    config = load_structured_file(config_path)
    for key, value in overrides.items():
        if value == {}:
            config[key] = {}
        elif isinstance(value, dict) and isinstance(config.get(key), dict):
            config[key].update(value)
        else:
            config[key] = value
    write_structured_file(config_path, config)


COVERAGE_PRELOAD = PACKAGE_DIR / 'scripts' / 'coverage-preload-functional.ts'


def _bun_command(*args):
    """Build the bun command, injecting --preload for coverage if enabled."""
    cmd = ['bun']
    if COVERAGE_ENABLED:
        cmd.extend(['--preload', str(COVERAGE_PRELOAD)])
    cmd.append(str(TADA_BIN))
    cmd.extend(args)
    return cmd


def run_tada(*args, cwd=None, timeout=120, check=False, input=None, env=None):
    """Run a tada CLI command and return the CompletedProcess."""
    return subprocess.run(
        _bun_command(*args),
        cwd=cwd or os.getcwd(),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=check,
        input=input,
        env=env,
    )


def process_group_popen_kwargs():
    """subprocess.Popen kwargs that put the child in its own process group
    so it can be terminated as a tree. Cross-platform: uses
    CREATE_NEW_PROCESS_GROUP on Windows and start_new_session on POSIX.
    """
    if sys.platform == 'win32':
        return {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP}
    return {'start_new_session': True}


def terminate_process_group(proc, timeout=5):
    """Terminate a child process started with process_group_popen_kwargs()
    and wait for it to exit. Force-kill on timeout.

    On POSIX this sends SIGTERM to the whole process group. On Windows it
    sends CTRL_BREAK_EVENT to the new process group, then falls back to a
    hard kill on timeout.
    """
    if proc.poll() is not None:
        return
    if sys.platform == 'win32':
        try:
            proc.send_signal(signal.CTRL_BREAK_EVENT)
        except (OSError, ValueError):
            proc.kill()
    else:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        if sys.platform == 'win32':
            proc.kill()
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        proc.wait(timeout=timeout)


def make_fake_failing_command(directory, name):
    """Create a fake executable named `name` in `directory` that always
    exits with code 1. Cross-platform.

    On POSIX writes a `name` shell script with a shebang and sets +x.
    On Windows writes both `name.cmd` (for spawn implementations that
    search PATHEXT or go through cmd.exe) and an empty `name.exe` (so
    direct CreateProcess lookups find a file that fails with
    ERROR_BAD_EXE_FORMAT). Either path causes Tada's checkJavac /
    assertMutoolAvailable to throw and conclude the tool is not present.

    Returns the primary fake path.
    """
    if sys.platform == 'win32':
        fake_cmd = directory / f'{name}.cmd'
        fake_cmd.write_text('@exit 1\r\n')
        fake_exe = directory / f'{name}.exe'
        fake_exe.write_bytes(b'')
        return fake_cmd
    fake = directory / name
    fake.write_text('#!/bin/sh\nexit 1\n')
    fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
    return fake


@pytest.fixture
def site_dir(tmp_path):
    """Create a bare Tada site using init --bare --no-interactive in a temp directory.

    Yields the Path to the site directory (tmp_path / 'testsite').
    """
    site = init_site(tmp_path, bare=True)
    yield site


@pytest.fixture
def built_dev_site(site_dir):
    """Create a site and build it with tada dev. Yields the site Path."""
    result = run_tada('dev', cwd=str(site_dir))
    assert result.returncode == 0, f'dev build failed: {result.stderr}'
    yield site_dir


@pytest.fixture
def built_prod_site(site_dir):
    """Create a site and build it with tada prod. Yields the site Path."""
    result = run_tada('prod', cwd=str(site_dir))
    assert result.returncode == 0, f'prod build failed: {result.stderr}'
    yield site_dir
