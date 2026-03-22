import { describe, expect, test } from 'bun:test';
import createGlobals from './globals';
import type { SiteVariables } from './types';

const baseSite: SiteVariables = {
  base: 'http://localhost:8080',
  basePath: '/',
  title: 'Test',
  titlePostfix: ' - Test',
  defaultTimeZone: 'America/New_York',
};

function makeGlobals(subPath = 'index', site: Partial<SiteVariables> = {}) {
  return createGlobals({}, { ...baseSite, ...site }, subPath);
}

describe('createGlobals', () => {
  test('isHomePage is true when subPath is "index"', () => {
    expect(makeGlobals('index').isHomePage).toBe(true);
  });

  test('isHomePage is false for other paths', () => {
    expect(makeGlobals('about').isHomePage).toBe(false);
    expect(makeGlobals('docs/guide').isHomePage).toBe(false);
  });

  test('cx is an alias for classNames', () => {
    const g = makeGlobals();
    expect(g.cx).toBe(g.classNames);
  });

  test('timezoneChooser includes noscript when defaultTimeZone is set', () => {
    const g = makeGlobals('index', { defaultTimeZone: 'America/New_York' });
    expect(g.timezoneChooser).toContain('noscript');
    expect(g.timezoneChooser).toContain('select');
  });

  test('timezoneChooser has no noscript when defaultTimeZone is not in list', () => {
    const g = makeGlobals('index', { defaultTimeZone: 'Nonexistent/Zone' });
    expect(g.timezoneChooser).toContain('select');
    expect(g.timezoneChooser).not.toContain('noscript');
  });
});

describe('isoDate', () => {
  test('converts date string to ISO date', () => {
    const g = makeGlobals();
    expect(g.isoDate('2025-06-15')).toBe('2025-06-15');
  });

  test('converts full datetime to date only', () => {
    const g = makeGlobals();
    expect(g.isoDate('2025-06-15T12:30:00Z')).toBe('2025-06-15');
  });

  test('returns null for null/undefined/empty', () => {
    const g = makeGlobals();
    expect(g.isoDate(null)).toBe(null);
    expect(g.isoDate(undefined)).toBe(null);
    expect(g.isoDate('')).toBe(null);
  });
});

describe('readableDate', () => {
  test('formats date as Month Day, Year', () => {
    const g = makeGlobals();
    expect(g.readableDate('2025-01-15T00:00:00Z')).toBe('January 15, 2025');
  });

  test('strips leading zeros from day and month', () => {
    const g = makeGlobals();
    expect(g.readableDate('2025-03-05T00:00:00Z')).toBe('March 5, 2025');
  });

  test('handles Date objects', () => {
    const g = makeGlobals();
    const result = g.readableDate(new Date('2025-12-25T00:00:00Z'));
    expect(result).toBe('December 25, 2025');
  });

  test('returns empty string for null/undefined/empty', () => {
    const g = makeGlobals();
    expect(g.readableDate(null)).toBe('');
    expect(g.readableDate(undefined)).toBe('');
    expect(g.readableDate('')).toBe('');
  });
});

describe('classNames', () => {
  test('returns truthy keys joined by space', () => {
    const g = makeGlobals();
    expect(g.classNames({ foo: true, bar: false, baz: 1 })).toBe('foo baz');
  });

  test('returns empty string when all falsy', () => {
    const g = makeGlobals();
    expect(g.classNames({ a: false, b: 0, c: '' })).toBe('');
  });

  test('returns empty string for empty object', () => {
    const g = makeGlobals();
    expect(g.classNames({})).toBe('');
  });
});
