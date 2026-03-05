(function () {
  const ws = new WebSocket('ws://localhost:35729');

  ws.onopen = () => {
    console.log('[watch-reload] connected to watcher');
  };

  ws.onmessage = event => {
    if (event.data === 'reload') {
      console.log('[watch-reload] Reloading page...');
      window.location.reload();
    }
  };

  ws.onclose = () => {
    console.warn('[watch-reload] connection closed');
  };

  ws.onerror = err => {
    console.error('[watch-reload] error:', err);
  };
})();
