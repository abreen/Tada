declare const __WEBSOCKET_PORT__: number;

(function () {
  const style = document.createElement('style');
  style.textContent = [
    'body.loading-cursor,',
    'body.loading-cursor * {',
    '  cursor: wait !important;',
    '}',
  ].join('\n');
  document.head.appendChild(style);

  const ws = new WebSocket(`ws://localhost:${__WEBSOCKET_PORT__}`);

  ws.onopen = () => {
    console.log('[watch-reload] connected to watcher');
  };

  ws.onmessage = event => {
    if (event.data === 'rebuilding') {
      console.log('[watch-reload] Rebuilding...');
      const header = document.querySelector('header');
      if (header) {
        header.classList.add('loading');
      }
      document.body.classList.add('loading-cursor');
    } else if (event.data === 'reload') {
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
