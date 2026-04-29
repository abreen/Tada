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

  test('consumes only the click that reveals the answer', () => {
    const win = create('<div class="question-a-body">Answer</div>');
    mount(win);

    const el = win.document.querySelector('.question-a-body')!;
    let bodyClicks = 0;
    win.document.body.addEventListener('click', () => {
      bodyClicks += 1;
    });

    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    expect(el.hasAttribute('data-revealed')).toBe(true);
    expect(bodyClicks).toBe(1);
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

  test('sets button attributes on multiple choice options without replacing their accessible names', () => {
    const win = create(
      '<div class="question-multiple-choice"><div class="question-multiple-choice-option"><strong>Answer A</strong></div></div>',
    );
    mount(win);

    const el = win.document.querySelector('.question-multiple-choice-option')!;
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.hasAttribute('aria-label')).toBe(false);
    expect(el.textContent).toBe('Answer A');
  });

  test('selects a correct multiple choice option on click', () => {
    const win = create(
      '<div class="question-multiple-choice"><div class="question-multiple-choice-option" data-correct="">A</div><div class="question-multiple-choice-option">B</div></div>',
    );
    mount(win);

    const block = win.document.querySelector('.question-multiple-choice')!;
    const option = win.document.querySelector(
      '.question-multiple-choice-option[data-correct]',
    )!;
    option.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    expect(block.hasAttribute('data-revealed')).toBe(true);
    expect(option.hasAttribute('data-selected')).toBe(true);
    expect(option.hasAttribute('role')).toBe(false);
    expect(option.hasAttribute('tabindex')).toBe(false);
    expect(option.hasAttribute('aria-label')).toBe(false);
    expect(
      option.querySelector('.question-multiple-choice-result')?.textContent,
    ).toBe('Selected answer, correct');
    expect(option.textContent).toBe('ASelected answer, correct');
  });

  test('selects an incorrect multiple choice option and reveals the correct option', () => {
    const win = create(
      '<div class="question-multiple-choice"><div class="question-multiple-choice-option" data-correct="">A</div><div class="question-multiple-choice-option">B</div></div>',
    );
    mount(win);

    const block = win.document.querySelector('.question-multiple-choice')!;
    const options = win.document.querySelectorAll(
      '.question-multiple-choice-option',
    );
    options[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    expect(block.hasAttribute('data-revealed')).toBe(true);
    expect(options[0].hasAttribute('data-correct')).toBe(true);
    expect(options[0].hasAttribute('data-selected')).toBe(false);
    expect(options[0].hasAttribute('aria-label')).toBe(false);
    expect(
      options[0].querySelector('.question-multiple-choice-result')?.textContent,
    ).toBe('Correct answer');
    expect(options[1].hasAttribute('data-selected')).toBe(true);
    expect(options[1].hasAttribute('aria-label')).toBe(false);
    expect(
      options[1].querySelector('.question-multiple-choice-result')?.textContent,
    ).toBe('Selected answer, incorrect');
  });

  test('consumes only the click that selects a multiple choice option', () => {
    const win = create(
      '<div class="question-multiple-choice"><div class="question-multiple-choice-option" data-correct="">A</div><div class="question-multiple-choice-option">B</div></div>',
    );
    mount(win);

    const option = win.document.querySelector(
      '.question-multiple-choice-option',
    )!;
    let bodyClicks = 0;
    win.document.body.addEventListener('click', () => {
      bodyClicks += 1;
    });

    option.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    option.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    expect(bodyClicks).toBe(1);
  });

  test('prevents linked multiple choice options from navigating only while selecting', () => {
    const win = create(
      '<div class="question-multiple-choice"><div class="question-multiple-choice-option" data-correct=""><a href="/next.html">A</a></div></div>',
    );
    mount(win);

    const link = win.document.querySelector('a')!;
    const firstClick = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    const secondClick = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });

    link.dispatchEvent(firstClick);
    link.dispatchEvent(secondClick);

    expect(firstClick.defaultPrevented).toBe(true);
    expect(secondClick.defaultPrevented).toBe(false);
  });

  test('selects a multiple choice option on Enter and Space keys', () => {
    const win = create(
      '<div class="question-multiple-choice"><div class="question-multiple-choice-option" data-correct="">A</div><div class="question-multiple-choice-option">B</div></div>',
    );
    mount(win);

    const options = win.document.querySelectorAll(
      '.question-multiple-choice-option',
    );
    options[0].dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    options[1].dispatchEvent(
      new win.KeyboardEvent('keydown', { key: ' ', bubbles: true }),
    );

    expect(options[0].hasAttribute('data-selected')).toBe(true);
    expect(options[1].hasAttribute('data-selected')).toBe(false);
  });
});
