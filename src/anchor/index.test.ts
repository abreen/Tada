import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import mount from './index';

function create(html: string) {
  const dom = new JSDOM(`<body>${html}</body>`);
  return dom.window;
}

describe('anchor', () => {
  test('wraps heading content in an anchor link', () => {
    const win = create('<h2 id="intro">Introduction</h2>');
    mount(win);

    const h2 = win.document.querySelector('h2')!;
    const link = h2.querySelector('a.heading-anchor')!;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('#intro');
    expect(link.textContent).toBe('Introduction');
    expect(link.querySelector('svg')).not.toBeNull();
    expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('sets title on anchor link', () => {
    const win = create('<h3 id="setup">Setup</h3>');
    mount(win);

    const link = win.document.querySelector('a.heading-anchor')!;
    expect(link.getAttribute('title')).toBe('Link to this heading');
  });

  test('skips headings without an id', () => {
    const win = create('<h2>No ID</h2>');
    mount(win);

    const link = win.document.querySelector('a.heading-anchor');
    expect(link).toBeNull();
  });

  test('handles multiple headings', () => {
    const win = create('<h1 id="a">A</h1><h2 id="b">B</h2><h3>C</h3>');
    mount(win);

    const links = win.document.querySelectorAll('a.heading-anchor');
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toBe('#a');
    expect(links[1].getAttribute('href')).toBe('#b');
  });

  test('preserves child elements inside heading', () => {
    const win = create('<h2 id="x"><em>Bold</em> text</h2>');
    mount(win);

    const link = win.document.querySelector('a.heading-anchor')!;
    expect(link.querySelector('em')).not.toBeNull();
    expect(link.textContent).toBe('Bold text');
  });

  test('adds hash link and present button to slide title with id', () => {
    const win = create(`
      <div class="slide-deck" data-slides-root>
        <div class="slide" data-slide-index="2">
          <h2 id="topic">Topic</h2>
        </div>
      </div>
    `);

    mount(win);

    const h2 = win.document.querySelector('h2')!;
    const link = h2.querySelector('a.heading-anchor')!;
    const button = h2.querySelector(
      'button.heading-present-button',
    ) as HTMLButtonElement;

    expect(link.getAttribute('href')).toBe('#topic');
    expect(link.querySelector('svg')).not.toBeNull();
    expect(button).not.toBeNull();
    expect(button.classList.contains('icon-button')).toBe(false);
    expect(button.disabled).toBe(false);
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Present from this slide');
    expect(button.getAttribute('title')).toBe('Present from this slide');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  test('adds only present button to eligible slide title without id', () => {
    const win = create(`
      <div class="slide-deck" data-slides-root>
        <div class="slide" data-slide-index="1">
          <h2>Topic</h2>
        </div>
      </div>
    `);

    mount(win);

    const h2 = win.document.querySelector('h2')!;
    expect(h2.querySelector('a.heading-anchor')).toBeNull();
    expect(h2.querySelector('button.heading-present-button')).not.toBeNull();
  });

  test('does not add present button to non-slide headings', () => {
    const win = create(`
      <h2>Outside</h2>
      <div class="slide"><p>Intro</p><h2>Not first</h2></div>
      <section class="slide"><h2>Wrong parent</h2></section>
      <div class="slide"><h3>Wrong level</h3></div>
    `);

    mount(win);

    expect(win.document.querySelector('.heading-present-button')).toBeNull();
  });

  test('present button dispatches slide presentation event', () => {
    const win = create(`
      <div class="slide-deck" data-slides-root>
        <div class="slide" data-slide-index="3">
          <h2>Topic</h2>
        </div>
      </div>
    `);
    const root = win.document.querySelector('[data-slides-root]')!;
    let detail: unknown;
    root.addEventListener('tada:slides-present', event => {
      detail = (event as CustomEvent).detail;
    });

    mount(win);

    (
      win.document.querySelector(
        'button.heading-present-button',
      ) as HTMLButtonElement
    ).click();

    expect(detail).toEqual({ mode: 'fullscreen', slideIndex: 3 });
  });

  test('does nothing when no headings exist', () => {
    const win = create('<p>No headings here</p>');
    mount(win);

    const links = win.document.querySelectorAll('a.heading-anchor');
    expect(links.length).toBe(0);
  });
});
