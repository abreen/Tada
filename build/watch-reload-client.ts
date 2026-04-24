import {
  WATCH_RELOAD_MESSAGE_REBUILDING,
  WATCH_RELOAD_MESSAGE_RELOAD,
  WATCH_RELOAD_PATH,
} from './watch/reload';

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

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(
    `${protocol}//${window.location.host}${WATCH_RELOAD_PATH}`,
  );

  ws.onopen = () => {
    console.log('[watch-reload] connected to watcher');
  };

  ws.onmessage = event => {
    if (event.data === WATCH_RELOAD_MESSAGE_REBUILDING) {
      console.log('[watch-reload] Rebuilding...');
      setLoading(true);
    } else if (event.data === WATCH_RELOAD_MESSAGE_RELOAD) {
      console.log('[watch-reload] Reloading page...');
      setLoading(false);
      window.history.scrollRestoration = 'auto';
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
