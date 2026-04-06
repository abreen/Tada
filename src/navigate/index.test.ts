import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { JSDOM } from 'jsdom';

// Mock the lifecycle module so we can track calls
const mockTeardown = mock(() => {});
const mockMount = mock(async () => mockTeardown);
mock.module('./lifecycle', () => ({
  mountPerPageComponents: mockMount,
  teardownPerPageComponents: mockTeardown,
}));

import mount from './index';

function createDOM(bodyContent = '') {
  const html = `<html><head><title>Page One</title><meta name="description" content="desc one"></head><body class="default toc-is-active"><header><details><summary>Menu</summary><nav></nav></details></header><div class="container">${bodyContent}</div></body></html>`;
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  return dom.window;
}

describe('navigate', () => {
  beforeEach(() => {
    mockTeardown.mockClear();
    mockMount.mockClear();
  });

  test('mount returns a cleanup function', () => {
    const win = createDOM();
    const cleanup = mount(win);
    expect(typeof cleanup).toBe('function');
  });

  test('cleanup removes event listeners without throwing', () => {
    const win = createDOM();
    const cleanup = mount(win);
    cleanup!();
  });

  test('ignores clicks with modifier keys', () => {
    const win = createDOM('<a href="http://localhost/other.html">Link</a>');
    mount(win);

    const link = win.document.querySelector('a')!;
    const event = new win.MouseEvent('click', { bubbles: true, ctrlKey: true });
    const prevented = !link.dispatchEvent(event);
    expect(prevented).toBe(false);
  });

  test('ignores links with target attribute', () => {
    const win = createDOM(
      '<a href="http://localhost/other.html" target="_blank">Link</a>',
    );
    mount(win);

    const link = win.document.querySelector('a')!;
    const event = new win.MouseEvent('click', { bubbles: true });
    const prevented = !link.dispatchEvent(event);
    expect(prevented).toBe(false);
  });

  test('ignores external links', () => {
    const win = createDOM('<a href="https://example.com/page">Link</a>');
    mount(win);

    const link = win.document.querySelector('a')!;
    const event = new win.MouseEvent('click', { bubbles: true });
    const prevented = !link.dispatchEvent(event);
    expect(prevented).toBe(false);
  });

  test('ignores non-HTML resource links', () => {
    const win = createDOM('<a href="http://localhost/file.pdf">PDF</a>');
    mount(win);

    const link = win.document.querySelector('a')!;
    const event = new win.MouseEvent('click', { bubbles: true });
    const prevented = !link.dispatchEvent(event);
    expect(prevented).toBe(false);
  });
});
