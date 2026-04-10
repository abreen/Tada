import subprocess
import time
from pathlib import Path

import pytest
import urllib.request
import urllib.error

from conftest import (
    PACKAGE_DIR,
    _bun_command,
    get_free_ports,
    process_group_popen_kwargs,
    run_tada,
    terminate_process_group,
)


TADA_BIN = PACKAGE_DIR / "bin" / "tada.ts"


class TestServe:
    """Tests for the tada serve command."""

    @pytest.fixture
    def site_dir(self, tmp_path):
        result = run_tada(
            "init", "testsite", "--bare", "--no-interactive", cwd=str(tmp_path)
        )
        assert result.returncode == 0, f"init failed: {result.stderr}"
        site = tmp_path / "testsite"

        # Build so dist/ exists
        result = run_tada("dev", cwd=str(site))
        assert result.returncode == 0, f"dev build failed: {result.stderr}"

        yield site

    @pytest.fixture
    def server(self, site_dir):
        """Start tada serve on a free port, yield (site_dir, port), then kill."""
        port = get_free_ports(1)[0]
        proc = subprocess.Popen(
            _bun_command("serve", "--port", str(port)),
            cwd=str(site_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            **process_group_popen_kwargs(),
        )

        # Wait for server to be ready (poll with short requests)
        url = f"http://localhost:{port}/index.html"
        deadline = time.monotonic() + 10
        ready = False
        while time.monotonic() < deadline:
            try:
                urllib.request.urlopen(url, timeout=1)
                ready = True
                break
            except (urllib.error.URLError, ConnectionError, OSError):
                time.sleep(0.1)

        assert ready, "Server did not become ready within 10 seconds"

        yield site_dir, port

        terminate_process_group(proc)

    def test_serves_index_html(self, server):
        site_dir, port = server
        url = f"http://localhost:{port}/index.html"
        resp = urllib.request.urlopen(url, timeout=5)
        assert resp.status == 200
        body = resp.read().decode()
        assert "<html" in body

    def test_returns_404_for_missing_file(self, server):
        _, port = server
        url = f"http://localhost:{port}/nonexistent.html"
        try:
            urllib.request.urlopen(url, timeout=5)
            assert False, "Expected 404"
        except urllib.error.HTTPError as e:
            assert e.code == 404

    def test_returns_404_for_directory(self, server):
        """Requesting a directory path should return 404, not a listing."""
        site_dir, port = server
        # Ensure a subdirectory exists in dist
        (site_dir / "dist" / "subdir").mkdir(exist_ok=True)
        url = f"http://localhost:{port}/subdir"
        try:
            urllib.request.urlopen(url, timeout=5)
            assert False, "Expected 404"
        except urllib.error.HTTPError as e:
            assert e.code == 404

    def test_rejects_path_traversal(self, server):
        _, port = server
        url = f"http://localhost:{port}/../etc/passwd"
        try:
            urllib.request.urlopen(url, timeout=5)
            assert False, "Expected 404"
        except urllib.error.HTTPError as e:
            assert e.code == 404

    def test_returns_304_with_if_modified_since(self, server):
        _, port = server
        url = f"http://localhost:{port}/index.html"

        # First request to get Last-Modified
        resp = urllib.request.urlopen(url, timeout=5)
        last_modified = resp.headers.get("Last-Modified")
        assert last_modified is not None

        # Second request with If-Modified-Since
        req = urllib.request.Request(url)
        req.add_header("If-Modified-Since", last_modified)
        try:
            urllib.request.urlopen(req, timeout=5)
            # Some urllib versions raise on 304, some don't
        except urllib.error.HTTPError as e:
            assert e.code == 304

    def test_sets_no_cache_header(self, server):
        _, port = server
        url = f"http://localhost:{port}/index.html"
        resp = urllib.request.urlopen(url, timeout=5)
        assert resp.headers.get("Cache-Control") == "no-cache"

    def test_serves_nested_file(self, server):
        site_dir, port = server
        # Create a nested file in dist
        sub = site_dir / "dist" / "deep"
        sub.mkdir(exist_ok=True)
        (sub / "page.html").write_text("<p>deep</p>")

        url = f"http://localhost:{port}/deep/page.html"
        resp = urllib.request.urlopen(url, timeout=5)
        assert resp.status == 200
        body = resp.read().decode()
        assert "<p>deep</p>" in body

    def test_decodes_percent_encoded_path(self, server):
        site_dir, port = server
        (site_dir / "dist" / "my file.html").write_text("<p>ok</p>")

        url = f"http://localhost:{port}/my%20file.html"
        resp = urllib.request.urlopen(url, timeout=5)
        assert resp.status == 200
