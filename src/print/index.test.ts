import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import mount from './index';

function create(html: string) {
  const dom = new JSDOM(`<body>${html}</body>`);
  return dom.window;
}

describe('print', () => {
  test('opens closed details on beforeprint', () => {
    const win = create('<details><summary>S</summary>Content</details>');
    mount(win);

    const details = win.document.querySelector('details')!;
    expect(details.open).toBe(false);

    win.dispatchEvent(new win.Event('beforeprint'));
    expect(details.open).toBe(true);
    expect(details.getAttribute('data-was-closed')).toBe('true');
  });

  test('restores closed details on afterprint', () => {
    const win = create('<details><summary>S</summary>Content</details>');
    mount(win);

    win.dispatchEvent(new win.Event('beforeprint'));
    win.dispatchEvent(new win.Event('afterprint'));

    const details = win.document.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details.hasAttribute('data-was-closed')).toBe(false);
  });

  test('leaves already-open details open after print', () => {
    const win = create('<details open><summary>S</summary>Content</details>');
    mount(win);

    win.dispatchEvent(new win.Event('beforeprint'));
    win.dispatchEvent(new win.Event('afterprint'));

    const details = win.document.querySelector('details')!;
    expect(details.open).toBe(true);
  });

  test('skips details inside header', () => {
    const win = create(
      '<header><details><summary>Nav</summary>Menu</details></header>' +
        '<details><summary>S</summary>Content</details>',
    );
    mount(win);

    win.dispatchEvent(new win.Event('beforeprint'));

    const headerDetails = win.document.querySelector('header details')!;
    const bodyDetails = win.document.querySelectorAll('details')[1];
    expect(headerDetails.hasAttribute('data-was-closed')).toBe(false);
    expect(bodyDetails.open).toBe(true);
  });

  test('cleanup removes event listeners', () => {
    const win = create('<details><summary>S</summary>Content</details>');
    const cleanup = mount(win);

    cleanup!();

    win.dispatchEvent(new win.Event('beforeprint'));
    const details = win.document.querySelector('details')!;
    expect(details.open).toBe(false);
  });
});
