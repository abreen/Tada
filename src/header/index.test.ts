import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import mount from './index';

function create(open = false) {
  const dom = new JSDOM(
    `<body><header><details${open ? ' open' : ''}><summary>Menu</summary><nav>Links</nav></details></header></body>`,
  );
  return dom.window as unknown as Window & typeof globalThis;
}

describe('header', () => {
  test('closes open details on outside click', () => {
    const win = create(true);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(true);

    win.document.body.dispatchEvent(
      new win.MouseEvent('click', { bubbles: true }),
    );
    expect(details.open).toBe(false);
  });

  test('does not close details when clicking inside', () => {
    const win = create(true);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    details.dispatchEvent(new win.MouseEvent('click', { bubbles: false }));
    expect(details.open).toBe(true);
  });

  test('closes on Escape key when details is open', () => {
    const win = create(true);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    const summary = win.document.querySelector('summary')!;

    // Focus the summary so activeElement is inside details
    summary.focus();

    win.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(details.open).toBe(false);
  });

  test('ignores Escape when details is closed', () => {
    const win = create(false);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    win.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(details.open).toBe(false);
  });

  test('ignores other keys', () => {
    const win = create(true);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    const summary = win.document.querySelector('summary')!;
    summary.focus();

    win.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    );
    expect(details.open).toBe(true);
  });

  test('keeps details open when focusout has no related target', () => {
    const win = create(true);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    const summary = win.document.querySelector('summary')!;
    summary.dispatchEvent(
      new win.FocusEvent('focusout', { bubbles: true, relatedTarget: null }),
    );

    expect(details.open).toBe(true);
  });

  test('closes details when focus moves outside', () => {
    const win = create(true);
    mount(win);

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    const summary = win.document.querySelector('summary')!;
    summary.dispatchEvent(
      new win.FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: win.document.body,
      }),
    );

    expect(details.open).toBe(false);
  });

  test('cleanup removes event listeners', () => {
    const win = create(true);
    const cleanup = mount(win);

    cleanup!();

    win.document.body.dispatchEvent(
      new win.MouseEvent('click', { bubbles: true }),
    );

    const details = win.document.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(true);
  });
});
