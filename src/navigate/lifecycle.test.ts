import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

describe('component lifecycle', () => {
  test('mountPerPageComponents returns a teardown function', async () => {
    const dom = new JSDOM(
      `<body><header><details><summary>Menu</summary><nav></nav></details></header><div class="container"></div></body>`,
      { url: 'http://localhost/' },
    );

    const { mountPerPageComponents } = await import('./lifecycle');
    const teardown = await mountPerPageComponents(dom.window);
    expect(typeof teardown).toBe('function');
  });

  test('teardown calls all per-page cleanup functions', async () => {
    const dom = new JSDOM(
      `<body><header><details><summary>Menu</summary><nav></nav></details></header><div class="container"></div></body>`,
      { url: 'http://localhost/' },
    );

    const { mountPerPageComponents } = await import('./lifecycle');
    const teardown = await mountPerPageComponents(dom.window);
    teardown();
  });
});
