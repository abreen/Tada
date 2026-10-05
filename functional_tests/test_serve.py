import http.client
import re
import socket
import subprocess
import time
import urllib.error
import urllib.request

import pytest
from conftest import (
    PACKAGE_DIR,
    _bun_command,
    process_group_popen_kwargs,
    terminate_process_group,
)

TADA_BIN = PACKAGE_DIR / 'bin' / 'tada.ts'


def test_serve_instances_avoid_port_reservation_races(built_dev_site, tmp_path, monkeypatch):
    servers = []
    with socket.socket() as reserved:
        reserved.bind(('127.0.0.1', 0))
        reserved.listen()
        reserved_port = reserved.getsockname()[1]
        monkeypatch.setattr(f'{__name__}.get_free_ports', lambda n: [reserved_port], raising=False)
        try:
            ports = []
            for index in range(2):
                logs = tmp_path / str(index)
                logs.mkdir()
                server = TestServe.server.__wrapped__(TestServe(), built_dev_site, logs)
                servers.append(server)
                _, port = next(server)
                ports.append(port)
            assert ports[0] != ports[1]
            assert reserved_port not in ports
        finally:
            for server in servers:
                server.close()


class TestServe:
    """Tests for the tada serve command."""

    @pytest.fixture
    def server(self, built_dev_site, tmp_path):
        """Start tada serve on a kernel-assigned port, then always stop it."""
        log_path = tmp_path / 'serve.log'
        with log_path.open('w') as output:
            proc = subprocess.Popen(
                _bun_command('serve', '--port', '0'),
                cwd=str(built_dev_site),
                stdout=output,
                stderr=subprocess.STDOUT,
                **process_group_popen_kwargs(),
            )
            try:
                deadline = time.monotonic() + 10
                ready = False
                while time.monotonic() < deadline:
                    log = log_path.read_text(encoding='utf-8', errors='replace')
                    assert proc.poll() is None, f'Serve process exited early:\n{log}'
                    match = re.search(r'http://localhost:(\d+)/index\.html', log)
                    if match:
                        port = int(match.group(1))
                        try:
                            with urllib.request.urlopen(
                                f'http://localhost:{port}/index.html', timeout=1
                            ):
                                ready = True
                                break
                        except (urllib.error.URLError, ConnectionError, OSError):
                            pass
                    time.sleep(0.1)

                assert ready, (
                    'Server did not become ready within 10 seconds:\n'
                    + log_path.read_text(encoding='utf-8', errors='replace')
                )
                yield built_dev_site, port
            finally:
                terminate_process_group(proc)

    def test_serves_index_html(self, server):
        site_dir, port = server
        url = f'http://localhost:{port}/index.html'
        resp = urllib.request.urlopen(url, timeout=5)
        assert resp.status == 200
        body = resp.read().decode()
        assert '<html' in body

    def test_returns_404_for_missing_file(self, server):
        _, port = server
        url = f'http://localhost:{port}/nonexistent.html'
        try:
            urllib.request.urlopen(url, timeout=5)
            assert False, 'Expected 404'
        except urllib.error.HTTPError as e:
            assert e.code == 404

    def test_returns_404_for_directory(self, server):
        """Requesting a directory path should return 404, not a listing."""
        site_dir, port = server
        # Ensure a subdirectory exists in dist
        (site_dir / 'dist' / 'subdir').mkdir(exist_ok=True)
        url = f'http://localhost:{port}/subdir'
        try:
            urllib.request.urlopen(url, timeout=5)
            assert False, 'Expected 404'
        except urllib.error.HTTPError as e:
            assert e.code == 404

    def test_rejects_path_traversal(self, server):
        site_dir, port = server
        escaped_dir = site_dir / 'etc'
        escaped_dir.mkdir(exist_ok=True)
        (escaped_dir / 'passwd').write_text('should not be served')

        url = f'http://localhost:{port}/..%2Fetc/passwd'
        try:
            urllib.request.urlopen(url, timeout=5)
            assert False, 'Expected 404'
        except urllib.error.HTTPError as e:
            assert e.code == 404

    def test_returns_304_with_if_modified_since(self, server):
        _, port = server
        url = f'http://localhost:{port}/index.html'

        # First request to get Last-Modified
        resp = urllib.request.urlopen(url, timeout=5)
        last_modified = resp.headers.get('Last-Modified')
        assert last_modified is not None

        # Second request with If-Modified-Since
        req = urllib.request.Request(url)
        req.add_header('If-Modified-Since', last_modified)
        try:
            resp = urllib.request.urlopen(req, timeout=5)
        except urllib.error.HTTPError as e:
            assert e.code == 304
        else:
            assert resp.status == 304

    def test_sets_no_cache_header(self, server):
        _, port = server
        url = f'http://localhost:{port}/index.html'
        resp = urllib.request.urlopen(url, timeout=5)
        assert resp.headers.get('Cache-Control') == 'no-cache'

    def test_head_returns_last_modified_without_body(self, server):
        _, port = server
        conn = http.client.HTTPConnection('localhost', port, timeout=5)
        try:
            conn.request('HEAD', '/index.html')
            resp = conn.getresponse()
            body = resp.read()
        finally:
            conn.close()

        assert resp.status == 200
        assert resp.getheader('Last-Modified') is not None
        assert body == b''

    def test_head_returns_304_with_if_modified_since(self, server):
        _, port = server

        conn = http.client.HTTPConnection('localhost', port, timeout=5)
        try:
            conn.request('HEAD', '/index.html')
            first = conn.getresponse()
            first.read()
            last_modified = first.getheader('Last-Modified')
        finally:
            conn.close()

        assert last_modified is not None

        conn = http.client.HTTPConnection('localhost', port, timeout=5)
        try:
            conn.request(
                'HEAD',
                '/index.html',
                headers={'If-Modified-Since': last_modified},
            )
            resp = conn.getresponse()
            body = resp.read()
        finally:
            conn.close()

        assert resp.status == 304
        assert body == b''

    def test_serves_nested_file(self, server):
        site_dir, port = server
        # Create a nested file in dist
        sub = site_dir / 'dist' / 'deep'
        sub.mkdir(exist_ok=True)
        (sub / 'page.html').write_text('<p>deep</p>')

        url = f'http://localhost:{port}/deep/page.html'
        resp = urllib.request.urlopen(url, timeout=5)
        assert resp.status == 200
        body = resp.read().decode()
        assert '<p>deep</p>' in body

    def test_decodes_percent_encoded_path(self, server):
        site_dir, port = server
        (site_dir / 'dist' / 'my file.html').write_text('<p>ok</p>')

        url = f'http://localhost:{port}/my%20file.html'
        resp = urllib.request.urlopen(url, timeout=5)
        assert resp.status == 200
        body = resp.read().decode()
        assert '<p>ok</p>' in body
