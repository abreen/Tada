const { makeLogger } = require('../log');

const log = makeLogger(__filename);

let highlighter = null;

async function initHighlighter(langs) {
  if (highlighter) {
    return;
  }
  log.debug`Initializing syntax highlighter`;
  const { createHighlighter } = await import('shiki');
  highlighter = await createHighlighter({
    themes: ['github-light', 'github-dark'],
    langs,
  });
}

function getHighlighter() {
  if (!highlighter) {
    throw new Error('Shiki highlighter not initialized');
  }
  return highlighter;
}

module.exports = { initHighlighter, getHighlighter };
