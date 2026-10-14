import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import mount from './index';

function create(html: string) {
  return new JSDOM(`<body>${html}</body>`).window;
}

function click(win: ReturnType<typeof create>, element: Element) {
  const event = new win.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
  return event;
}

const DETAILS =
  '<main><details open><summary>S</summary><p>Body</p></details></main>';

describe('details', () => {
  test('closes an open details from its summary', () => {
    const win = create(DETAILS);
    mount(win);

    const event = click(win, win.document.querySelector('summary')!);

    expect(event.defaultPrevented).toBe(true);
    expect(win.document.querySelector('details')!.open).toBe(false);
  });

  test('leaves opening, header menus, and interactive content alone', () => {
    const win = create(
      '<header><details open><summary>Nav</summary></details></header>' +
        '<main><details><summary>Closed</summary></details>' +
        '<details open><summary><a href="#x">Link</a> ' +
        '<button>Button</button> <input type="checkbox"> ' +
        '<label>Label</label></summary></details></main>',
    );
    mount(win);

    for (const element of win.document.querySelectorAll(
      'header summary, main details:not([open]) > summary, summary a, ' +
        'summary button, summary input, summary label',
    )) {
      expect(click(win, element).defaultPrevented).toBe(false);
    }
  });

  test('closes from a link without an href, like the browser', () => {
    const win = create(
      '<main><details open><summary><a>Text</a></summary></details></main>',
    );
    mount(win);

    click(win, win.document.querySelector('summary a')!);

    expect(win.document.querySelector('details')!.open).toBe(false);
  });

  test('leaves a click that a document listener prevented alone', () => {
    const win = create(DETAILS);
    mount(win);
    win.document.addEventListener('click', event => event.preventDefault());

    click(win, win.document.querySelector('summary')!);

    expect(win.document.querySelector('details')!.open).toBe(true);
  });

  test('stops listening on cleanup', () => {
    const win = create(DETAILS);
    const cleanup = mount(win);

    cleanup();
    const event = click(win, win.document.querySelector('summary')!);

    expect(event.defaultPrevented).toBe(false);
  });
});
