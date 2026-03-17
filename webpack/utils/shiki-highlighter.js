let highlighter = null;

async function initHighlighter(langs) {
  if (highlighter) {
    return;
  }
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
