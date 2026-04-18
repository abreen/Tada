declare const __WEBSOCKET_PORT__: number;

(function () {
  function setLoading(loading: boolean): void {
    const header = document.querySelector('header');
    if (header) {
      header.classList.toggle('loading', loading);
    }
    document.body.classList.toggle('loading-cursor', loading);
  }

  const style = document.createElement('style');
  style.textContent = `body.loading-cursor,
body.loading-cursor * {
  cursor: wait !important;
}`;
  document.head.appendChild(style);

  const ws = new WebSocket(`ws://localhost:${__WEBSOCKET_PORT__}`);

  ws.onopen = () => {
    console.log('[watch-reload] connected to watcher');
  };

  ws.onmessage = event => {
    if (event.data === 'rebuilding') {
      console.log('[watch-reload] Rebuilding...');
      setLoading(true);
    } else if (event.data === 'reload') {
      console.log('[watch-reload] Reloading page...');
      setLoading(false);
      window.history.scrollRestoration = 'auto';
      window.location.reload();
    } else if (event.data === 'ready') {
      setLoading(false);
    } else if (event.data === 'error') {
      setLoading(false);
    }
  };

  ws.onclose = () => {
    console.warn('[watch-reload] connection closed');
  };

  ws.onerror = err => {
    console.error('[watch-reload] error:', err);
  };
})();
