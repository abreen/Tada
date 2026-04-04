import { describe, expect, test } from 'bun:test';
import { formatDuration } from './util';

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
});
