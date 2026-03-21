declare const __WEBSOCKET_PORT__: number;

(function () {
  const style = document.createElement('style');
  style.textContent = [
    '@keyframes tada-shimmer {',
    '  0%, 25% { background-position: 200% 0; }',
    '  100% { background-position: -200% 0; }',
    '}',
    'header.tada-rebuilding {',
    '  background-image: linear-gradient(',
    '    90deg,',
    '    transparent 25%,',
    '    var(--bg2-color) 50%,',
    '    transparent 75%',
    '  ) !important;',
    '  background-color: var(--bg-color-translucent) !important;',
    '  background-size: 200% 100% !important;',
    '  background-repeat: no-repeat !important;',
    '  animation: tada-shimmer 2s ease-in-out infinite !important;',
    '}',
    'body.tada-rebuilding-cursor,',
    'body.tada-rebuilding-cursor * {',
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
        header.classList.add('tada-rebuilding');
      }
      document.body.classList.add('tada-rebuilding-cursor');
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
