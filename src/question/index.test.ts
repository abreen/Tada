import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import mount from './index';

function create(html: string) {
  const dom = new JSDOM(`<body>${html}</body>`);
  return dom.window;
}

describe('question', () => {
  test('sets ARIA attributes on answer body', () => {
    const win = create('<div class="question-a-body">Answer</div>');
    mount(win);

    const el = win.document.querySelector('.question-a-body')!;
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.getAttribute('aria-label')).toBe('Click to reveal answer');
  });

  test('reveals answer on click', () => {
    const win = create('<div class="question-a-body">Answer</div>');
    mount(win);

    const el = win.document.querySelector('.question-a-body')!;
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    expect(el.hasAttribute('data-revealed')).toBe(true);
    expect(el.hasAttribute('role')).toBe(false);
    expect(el.hasAttribute('tabindex')).toBe(false);
    expect(el.hasAttribute('aria-label')).toBe(false);
  });

  test('reveals answer on Enter key', () => {
    const win = create('<div class="question-a-body">Answer</div>');
    mount(win);

    const el = win.document.querySelector('.question-a-body')!;
    el.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(el.hasAttribute('data-revealed')).toBe(true);
  });

  test('reveals answer on Space key', () => {
    const win = create('<div class="question-a-body">Answer</div>');
    mount(win);

    const el = win.document.querySelector('.question-a-body')!;
    el.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: ' ', bubbles: true }),
    );

    expect(el.hasAttribute('data-revealed')).toBe(true);
  });

  test('does not reveal on other keys', () => {
    const win = create('<div class="question-a-body">Answer</div>');
    mount(win);

    const el = win.document.querySelector('.question-a-body')!;
    el.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    );

    expect(el.hasAttribute('data-revealed')).toBe(false);
  });

  test('handles multiple question bodies', () => {
    const win = create(
      '<div class="question-a-body">A1</div><div class="question-a-body">A2</div>',
    );
    mount(win);

    const els = win.document.querySelectorAll('.question-a-body');
    expect(els.length).toBe(2);
    els.forEach(el => {
      expect(el.getAttribute('role')).toBe('button');
    });
  });
});
