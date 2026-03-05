import { describe, expect, test } from 'bun:test';
import { detectPeriodStyle, to12Hour, normalizeHM } from './index';

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
    expect(detectPeriodStyle('no time here')).toEqual(['a.m.', 'p.m.']);
  });

  test('returns default for empty string', () => {
    expect(detectPeriodStyle('')).toEqual(['a.m.', 'p.m.']);
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
