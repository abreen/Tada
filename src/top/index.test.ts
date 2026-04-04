import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import mount from './index';

function create(html = '') {
  const dom = new JSDOM(`<body>${html}</body>`, { url: 'http://localhost/' });
  return dom.window;
}

describe('top', () => {
  test('creates a back-to-top link in the body', () => {
    const win = create();
    mount(win);

    const link = win.document.querySelector('a.button');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('#');
  });

  test('mounts link inside #to-top-container when present', () => {
    const win = create('<div id="to-top-container"></div>');
    mount(win);

    const container = win.document.getElementById('to-top-container')!;
    const link = container.querySelector('a.button');
    expect(link).not.toBeNull();
  });

  test('link starts hidden (no is-visible class)', () => {
    const win = create();
    mount(win);

    const link = win.document.querySelector('a.button')!;
    expect(link.classList.contains('is-visible')).toBe(false);
    expect(link.getAttribute('tabindex')).toBe('-1');
  });

  test('cleanup removes scroll listener', () => {
    const win = create();
    const cleanup = mount(win);

    expect(typeof cleanup).toBe('function');
    // Should not throw
    cleanup!();
  });
});
