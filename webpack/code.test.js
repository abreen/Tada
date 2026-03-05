const { describe, expect, test, beforeAll } = require('bun:test');
const { initHighlighter } = require('./utils/shiki-highlighter');
const { renderCodeWithComments } = require('./utils/code');

beforeAll(async () => {
  await initHighlighter(['java', 'text', 'plaintext']);
});

describe('renderCodeWithComments', () => {
  test('renders build-time line rows for code segments', () => {
    const html = renderCodeWithComments('alpha\n\nbeta\n', 'java', {
      basePath: '/',
      internalDomains: [],
    });

    expect(html).toContain('<span class="code-row">');
    expect(html).toContain('id="L1" href="#L1"');
    expect(html).toContain('id="L2" href="#L2"');
    expect(html).toContain('id="L3" href="#L3"');
    expect(html).not.toContain('id="L4" href="#L4"');
    expect(html).toContain('<code class="shiki language-java">');
  });
});
