import threading

import websocket
from watch_helpers import WEBSOCKET_TIMEOUT_SEC


class TestWatchRuntime:
    """Watch mode serves the reload client used by the dev page."""

    def test_receives_reload_message_on_content_change(self, watch, site_dir):
        messages = []
        connected = threading.Event()
        done = threading.Event()

        def on_message(ws, message):
            messages.append(message)
            if message == 'reload':
                done.set()

        def on_open(ws):
            connected.set()

        ws = websocket.WebSocketApp(
            f'ws://localhost:{watch.ws_port}',
            on_message=on_message,
            on_open=on_open,
        )
        ws_thread = threading.Thread(target=ws.run_forever, daemon=True)
        ws_thread.start()

        try:
            assert connected.wait(timeout=WEBSOCKET_TIMEOUT_SEC), (
                f'WebSocket did not connect on port {watch.ws_port}'
            )

            index_md = site_dir / 'content' / 'index.md'
            original = index_md.read_text()
            index_md.write_text(original + '\n\nWebSocket test paragraph.\n')

            assert done.wait(timeout=WEBSOCKET_TIMEOUT_SEC), (
                f"Did not receive 'reload' message; got: {messages}"
            )
            assert 'reload' in messages
        finally:
            ws.close()
            ws_thread.join(timeout=2)

    def test_watch_build_includes_reload_client(self, watch, site_dir):
        client_bundle = site_dir / 'dist' / 'watch-reload-client.bundle.js'
        assert client_bundle.exists(), 'watch-reload-client.bundle.js not in dist/'
        content = client_bundle.read_text()
        assert 'WebSocket' in content
        assert 'reload' in content
