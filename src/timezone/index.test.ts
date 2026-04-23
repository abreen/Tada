import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { createGlobals } from '../globals.test';
import mount, { detectPeriodStyle, to12Hour, normalizeHM } from './index';

const TIMEZONES: TimeZone[] = [
  { value: 'America/New_York', label: 'US Eastern', abbreviation: 'ET' },
  { value: 'America/Chicago', label: 'US Central', abbreviation: 'CT' },
  { value: 'America/Los_Angeles', label: 'US Pacific', abbreviation: 'PT' },
];

function mockGlobals(overrides: Partial<import('../globals').Globals> = {}) {
  mock.module('../globals', () => ({
    globals: createGlobals({
      getSiteDefaultTimezone() {
        return 'America/New_York';
      },
      getSiteTimezones() {
        return TIMEZONES;
      },
      ...overrides,
    }),
  }));
}

function dom(bodyHtml: string) {
  return new JSDOM(`<body>${bodyHtml}</body>`, { url: 'http://localhost/' });
}

function createPage(times: string[], selectedTz?: string) {
  const options = TIMEZONES.map(
    tz => `<option value="${tz.value}">${tz.label}</option>`,
  ).join('');
  const timeEls = times
    .map(t => `<time datetime="${t}">${to12Hour(...parseHM(t))}</time>`)
    .join('\n');
  const html = `<select class="time-zone">${options}</select>${timeEls}`;
  const jsdom = dom(html);
  if (selectedTz) {
    try {
      jsdom.window.localStorage.setItem('timezoneSelection', selectedTz);
    } catch {
      // ignored
    }
  }
  return jsdom.window;
}

function parseHM(hhmm: string): [number, number] {
  const [h, m] = hhmm.split(':').map(Number);
  return [h, m];
}

beforeEach(() => {
  mockGlobals();
});

describe('detectPeriodStyle', () => {
  test('detects uppercase "PM"', () => {
    expect(detectPeriodStyle('5:40 PM')).toEqual(['AM', 'PM']);
  });

  test('detects uppercase "AM"', () => {
    expect(detectPeriodStyle('10:00 AM')).toEqual(['AM', 'PM']);
  });

  test('detects lowercase dotted "p.m."', () => {
    expect(detectPeriodStyle('5:40 p.m.')).toEqual(['a.m.', 'p.m.']);
  });

  test('detects lowercase dotted "a.m."', () => {
    expect(detectPeriodStyle('9:15 a.m.')).toEqual(['a.m.', 'p.m.']);
  });

  test('detects lowercase "pm"', () => {
    expect(detectPeriodStyle('5:40 pm')).toEqual(['am', 'pm']);
  });

  test('detects lowercase "am"', () => {
    expect(detectPeriodStyle('8:00 am')).toEqual(['am', 'pm']);
  });

  test('detects uppercase dotted "P.M."', () => {
    expect(detectPeriodStyle('5:40 P.M.')).toEqual(['A.M.', 'P.M.']);
  });

  test('detects uppercase dotted "A.M."', () => {
    expect(detectPeriodStyle('7:30 A.M.')).toEqual(['A.M.', 'P.M.']);
  });

  test('returns default for text with no AM/PM', () => {
    expect(detectPeriodStyle('no time here')).toBeNull();
  });

  test('returns default for empty string', () => {
    expect(detectPeriodStyle('')).toBeNull();
  });
});

describe('to12Hour', () => {
  test('formats afternoon time with default style', () => {
    expect(to12Hour(17, 40)).toBe('5:40 p.m.');
  });

  test('formats morning time with default style', () => {
    expect(to12Hour(9, 5)).toBe('9:05 a.m.');
  });

  test('formats with uppercase style', () => {
    expect(to12Hour(17, 40, ['AM', 'PM'])).toBe('5:40 PM');
  });

  test('formats with lowercase style', () => {
    expect(to12Hour(0, 0, ['am', 'pm'])).toBe('12:00 am');
  });

  test('noon is p.m.', () => {
    expect(to12Hour(12, 0)).toBe('12:00 p.m.');
  });

  test('formats 12:30 p.m.', () => {
    expect(to12Hour(12, 30)).toBe('12:30 p.m.');
  });

  test('midnight is a.m.', () => {
    expect(to12Hour(0, 0)).toBe('12:00 a.m.');
  });

  test('formats 23:59', () => {
    expect(to12Hour(23, 59)).toBe('11:59 p.m.');
  });

  test('omits period when style is null', () => {
    expect(to12Hour(14, 0, null)).toBe('2:00');
  });
});

describe('normalizeHM', () => {
  test('normalizes minutes exceeding a day', () => {
    expect(normalizeHM(1500)).toEqual([1, 0]);
  });

  test('normalizes negative minutes', () => {
    expect(normalizeHM(-60)).toEqual([23, 0]);
  });

  test('handles zero', () => {
    expect(normalizeHM(0)).toEqual([0, 0]);
  });

  test('handles exact day boundary', () => {
    expect(normalizeHM(1440)).toEqual([0, 0]);
  });

  test('handles normal value', () => {
    expect(normalizeHM(750)).toEqual([12, 30]);
  });
});

describe('timezone mount', () => {
  test('unhides and enables the select element', () => {
    const win = createPage(['09:00']);
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    expect(sel.hidden).toBe(false);
    expect(sel.disabled).toBe(false);
  });

  test('sets select value to default timezone', () => {
    const win = createPage(['09:00']);
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    expect(sel.value).toBe('America/New_York');
  });

  test('wraps select in a timezone-wrapper div', () => {
    const win = createPage(['09:00']);
    mount(win);

    const wrapper = win.document.querySelector('.timezone-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.querySelector('select.time-zone')).not.toBeNull();
  });

  test('adds a reset button inside the wrapper', () => {
    const win = createPage(['09:00']);
    mount(win);

    const btn = win.document.querySelector('.timezone-wrapper button');
    expect(btn).not.toBeNull();
    expect(btn!.classList.contains('icon-button')).toBe(true);
  });

  test('reset button is initially invisible for default timezone', () => {
    const win = createPage(['09:00']);
    mount(win);

    const btn = win.document.querySelector(
      '.timezone-wrapper button',
    ) as HTMLButtonElement;
    expect(btn.classList.contains('is-hidden')).toBe(true);
    expect(btn.disabled).toBe(true);
    expect(btn.tabIndex).toBe(-1);
    expect(btn.getAttribute('aria-hidden')).toBe('true');
  });

  test('restores timezone from localStorage', () => {
    const win = createPage(['09:00'], 'America/Chicago');
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    expect(sel.value).toBe('America/Chicago');
  });

  test('reset button is visible when non-default timezone is stored', () => {
    const win = createPage(['09:00'], 'America/Chicago');
    mount(win);

    const btn = win.document.querySelector(
      '.timezone-wrapper button',
    ) as HTMLButtonElement;
    expect(btn.classList.contains('is-hidden')).toBe(false);
    expect(btn.disabled).toBe(false);
    expect(btn.tabIndex).toBe(0);
    expect(btn.getAttribute('aria-hidden')).toBe('false');
  });

  test('adds an accessible label to unlabeled timezone selects', () => {
    const win = createPage(['09:00']);
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    expect(sel.getAttribute('aria-label')).toBe('Time zone');
  });

  test('keeps an existing select accessible name', () => {
    const options = TIMEZONES.map(
      tz => `<option value="${tz.value}">${tz.label}</option>`,
    ).join('');
    const win = dom(
      `<select class="time-zone" aria-label="Preferred time zone">${options}</select><time datetime="09:00">9:00 a.m.</time>`,
    ).window;
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    expect(sel.getAttribute('aria-label')).toBe('Preferred time zone');
  });

  test('marks the reset icon as decorative', () => {
    const win = createPage(['09:00'], 'America/Chicago');
    mount(win);

    const svg = win.document.querySelector(
      '.timezone-wrapper button svg',
    ) as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
  });

  test('changing select updates time elements', () => {
    const win = createPage(['12:00']);
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    const time = win.document.querySelector('time') as HTMLTimeElement;

    const before = time.innerHTML;

    sel.value = 'America/Los_Angeles';
    sel.dispatchEvent(new win.Event('change'));

    // The time text should have changed
    expect(time.innerHTML).not.toBe(before);
  });

  test('changing to non-default timezone adds is-modified class', () => {
    const win = createPage(['12:00']);
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    const time = win.document.querySelector('time') as HTMLTimeElement;

    sel.value = 'America/Los_Angeles';
    sel.dispatchEvent(new win.Event('change'));

    expect(time.classList.contains('is-modified')).toBe(true);
  });

  test('changing back to default removes is-modified class', () => {
    const win = createPage(['12:00']);
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    const time = win.document.querySelector('time') as HTMLTimeElement;

    sel.value = 'America/Los_Angeles';
    sel.dispatchEvent(new win.Event('change'));
    expect(time.classList.contains('is-modified')).toBe(true);

    sel.value = 'America/New_York';
    sel.dispatchEvent(new win.Event('change'));
    expect(time.classList.contains('is-modified')).toBe(false);
  });

  test('reset button restores default timezone', () => {
    const win = createPage(['12:00'], 'America/Chicago');
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    const btn = win.document.querySelector(
      '.timezone-wrapper button',
    ) as HTMLButtonElement;

    expect(sel.value).toBe('America/Chicago');

    btn.click();

    expect(sel.value).toBe('America/New_York');
  });

  test('reset button removes localStorage entry', () => {
    const win = createPage(['12:00'], 'America/Chicago');
    mount(win);

    const btn = win.document.querySelector(
      '.timezone-wrapper button',
    ) as HTMLButtonElement;
    btn.click();

    expect(win.localStorage.getItem('timezoneSelection')).toBeNull();
  });

  test('changing timezone saves to localStorage', () => {
    const win = createPage(['12:00']);
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    sel.value = 'America/Chicago';
    sel.dispatchEvent(new win.Event('change'));

    expect(win.localStorage.getItem('timezoneSelection')).toBe(
      'America/Chicago',
    );
  });

  test('selecting default timezone removes localStorage entry', () => {
    const win = createPage(['12:00'], 'America/Chicago');
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    sel.value = 'America/New_York';
    sel.dispatchEvent(new win.Event('change'));

    expect(win.localStorage.getItem('timezoneSelection')).toBeNull();
  });

  test('time element gets title with original time on change', () => {
    const win = createPage(['14:00']);
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    const time = win.document.querySelector('time') as HTMLTimeElement;

    sel.value = 'America/Chicago';
    sel.dispatchEvent(new win.Event('change'));

    expect(time.title).toContain('ET');
  });

  test('time element title is cleared when returning to default', () => {
    const win = createPage(['14:00']);
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    const time = win.document.querySelector('time') as HTMLTimeElement;

    sel.value = 'America/Chicago';
    sel.dispatchEvent(new win.Event('change'));
    expect(time.title).not.toBe('');

    sel.value = 'America/New_York';
    sel.dispatchEvent(new win.Event('change'));
    expect(time.title).toBe('');
  });

  test('ignores stored timezone not in the timezone list', () => {
    const win = createPage(['09:00']);
    try {
      win.localStorage.setItem('timezoneSelection', 'Mars/Olympus_Mons');
    } catch {
      // ignored
    }
    mount(win);

    const sel = win.document.querySelector(
      'select.time-zone',
    ) as HTMLSelectElement;
    expect(sel.value).toBe('America/New_York');
  });

  test('returns a cleanup function', () => {
    const win = createPage(['09:00']);
    const cleanup = mount(win);
    expect(typeof cleanup).toBe('function');
  });

  test('multiple select elements stay in sync', () => {
    const options = TIMEZONES.map(
      tz => `<option value="${tz.value}">${tz.label}</option>`,
    ).join('');
    const html =
      `<select class="time-zone">${options}</select>` +
      `<select class="time-zone">${options}</select>` +
      '<time datetime="12:00">12:00 p.m.</time>';
    const win = dom(html).window;
    mount(win);

    const selects = win.document.querySelectorAll(
      'select.time-zone',
    ) as NodeListOf<HTMLSelectElement>;

    selects[0].value = 'America/Chicago';
    selects[0].dispatchEvent(new win.Event('change'));

    expect(selects[1].value).toBe('America/Chicago');
  });
});
