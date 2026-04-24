import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

async function loadRealLifecycleModule(): Promise<
  typeof import('./lifecycle')
> {
  // Other navigation tests mock ./lifecycle; import the real module here so
  // this file still exercises the actual component mount/teardown behavior.
  const realModulePath: string = './lifecycle.ts?real=1';
  return import(realModulePath) as Promise<typeof import('./lifecycle')>;
}

describe('component lifecycle', () => {
  test('mountPerPageComponents returns a teardown function', async () => {
    const dom = new JSDOM(
      `<body><header><details><summary>Menu</summary><nav></nav></details></header><div class="container"></div></body>`,
      { url: 'http://localhost/' },
    );

    const { mountPerPageComponents } = await loadRealLifecycleModule();
    const teardown = await mountPerPageComponents(dom.window);
    expect(typeof teardown).toBe('function');
  });

  test('teardown calls all per-page cleanup functions', async () => {
    const dom = new JSDOM(
      `<body><header><details><summary>Menu</summary><nav></nav></details></header><div class="container"><div class="slides-header"><button type="button" data-slides-present>Present</button></div><div class="slide-deck" data-slides-root><div class="slide" data-slide-index="0"><h1>One</h1></div></div></div></body>`,
      { url: 'http://localhost/' },
    );

    const { mountPerPageComponents } = await loadRealLifecycleModule();
    const teardown = await mountPerPageComponents(dom.window);
    const present = dom.window.document.querySelector(
      '[data-slides-present]',
    ) as HTMLButtonElement;

    present.click();
    expect(dom.window.document.body.classList.contains('is-presenting')).toBe(
      true,
    );
    expect(
      dom.window.document.querySelector('[data-slides-overlay]'),
    ).not.toBeNull();

    teardown();

    expect(dom.window.document.body.classList.contains('is-presenting')).toBe(
      false,
    );
    expect(
      dom.window.document.querySelector('[data-slides-overlay]'),
    ).toBeNull();
  });
});
