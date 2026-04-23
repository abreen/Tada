import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { createGlobals } from './globals.test';
import { formatDuration, removeClass, getElement, applyBasePath } from './util';

function mockGlobals(basePath = '/'): void {
  mock.module('./globals', () => ({
    globals: createGlobals({
      getSiteBasePath() {
        return basePath;
      },
    }),
  }));
}

function create(html: string) {
  const dom = new JSDOM(`<body>${html}</body>`);
  return dom.window;
}

beforeEach(() => {
  mockGlobals('/');
});

describe('formatDuration', () => {
  test('formats sub-millisecond values', () => {
    expect(formatDuration(0.5)).toBe('0.5000ms');
  });

  test('formats small millisecond values', () => {
    expect(formatDuration(3.14159)).toBe('3.1416ms');
  });

  test('formats tens of milliseconds', () => {
    expect(formatDuration(42.7)).toBe('42.700ms');
  });

  test('formats hundreds of milliseconds', () => {
    expect(formatDuration(456.12)).toBe('456.12ms');
  });

  test('formats exactly 1 second', () => {
    expect(formatDuration(1000)).toBe('1.00000s');
  });

  test('formats seconds under 10', () => {
    expect(formatDuration(5432)).toBe('5.43200s');
  });

  test('formats seconds 10 and above', () => {
    expect(formatDuration(12345)).toBe('12.3450s');
  });

  test('formats exactly 1 minute', () => {
    expect(formatDuration(60000)).toBe('1m0.000s');
  });

  test('formats minutes with seconds', () => {
    expect(formatDuration(90000)).toBe('1m30.00s');
  });

  test('formats large durations', () => {
    expect(formatDuration(600000)).toBe('10m0.00s');
  });

  test('formats zero', () => {
    expect(formatDuration(0)).toBe('0.0000ms');
  });

  test('formats negative values with sign', () => {
    expect(formatDuration(-500)).toBe('-500.00ms');
  });

  test('formats negative seconds', () => {
    expect(formatDuration(-5000)).toBe('-5.00000s');
  });

  test('formats milliseconds that round up to 1 second', () => {
    // 999.999ms rounds to 1000.0ms, should switch to seconds format
    expect(formatDuration(999.999)).toBe('1.00000s');
  });

  test('formats seconds that round from under 10 to 10', () => {
    // 9.999995 seconds rounds to 10.00000 at 5 decimals, should switch
    // to 4-decimal format
    expect(formatDuration(9999.995)).toBe('10.0000s');
  });

  test('formats seconds that round up to exactly 60', () => {
    // 59.99999s at 4 decimals rounds to 60.0000, should switch to minutes
    expect(formatDuration(59999.999)).toBe('1m0.000s');
  });

  test('formats minutes where seconds round up to 60', () => {
    // 1m59.9999s where seconds round to 60
    const ms = 1 * 60000 + 59999.999;
    const result = formatDuration(ms);
    expect(result).toBe('2m0.000s');
  });
});

describe('removeClass', () => {
  test('removes a class from an element', () => {
    const win = create('<div class="foo bar">X</div>');
    const el = win.document.querySelector('div') as HTMLElement;
    removeClass(el, 'foo');
    expect(el.classList.contains('foo')).toBe(false);
    expect(el.classList.contains('bar')).toBe(true);
  });

  test('removes the class attribute when no classes remain', () => {
    const win = create('<div class="only">X</div>');
    const el = win.document.querySelector('div') as HTMLElement;
    removeClass(el, 'only');
    expect(el.hasAttribute('class')).toBe(false);
  });

  test('keeps class attribute when other classes remain', () => {
    const win = create('<div class="a b">X</div>');
    const el = win.document.querySelector('div') as HTMLElement;
    removeClass(el, 'a');
    expect(el.hasAttribute('class')).toBe(true);
    expect(el.className).toBe('b');
  });
});

describe('getElement', () => {
  test('returns the matching element', () => {
    const win = create('<div id="target">Hello</div>');
    const el = getElement(win.document, '#target');
    expect(el.textContent).toBe('Hello');
  });

  test('throws when no element matches', () => {
    const win = create('<div>No match</div>');
    expect(() => getElement(win.document, '#missing')).toThrow(
      'no element matching "#missing"',
    );
  });

  test('works with a parent element scope', () => {
    const win = create(
      '<div id="a"><span class="inner">A</span></div><div id="b"><span class="inner">B</span></div>',
    );
    const parent = win.document.getElementById('b')!;
    const el = getElement(parent, '.inner');
    expect(el.textContent).toBe('B');
  });
});

describe('applyBasePath', () => {
  test('prepends the base path to a subpath', () => {
    mockGlobals('/docs/');
    expect(applyBasePath('/page.html')).toBe('/docs/page.html');
  });

  test('handles base path without trailing slash', () => {
    mockGlobals('/docs');
    expect(applyBasePath('/page.html')).toBe('/docs/page.html');
  });

  test('handles root base path', () => {
    mockGlobals('/');
    expect(applyBasePath('/page.html')).toBe('/page.html');
  });

  test('throws for subpath not starting with /', () => {
    mockGlobals('/docs');
    expect(() => applyBasePath('page.html')).toThrow(
      'invalid internal path, must start with "/"',
    );
  });
});
