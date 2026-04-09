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

  test('does nothing when no headings exist', () => {
    const win = create('<p>No headings here</p>');
    mount(win);

    const links = win.document.querySelectorAll('a.heading-anchor');
    expect(links.length).toBe(0);
  });
});
