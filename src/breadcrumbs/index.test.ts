import { describe, expect, test } from 'bun:test';
import { isTrailStuck } from './index';

describe('isTrailStuck', () => {
  test('is stuck at or above its sticky offset', () => {
    expect(isTrailStuck(45, { top: 45, height: 36 })).toBe(true);
    expect(isTrailStuck(45, { top: 45.4, height: 36 })).toBe(true);
  });

  test('is not stuck below its sticky offset', () => {
    expect(isTrailStuck(45, { top: 57, height: 36 })).toBe(false);
    expect(isTrailStuck(45, { top: 45.6, height: 36 })).toBe(false);
  });

  test('is not stuck when hidden or without a sticky offset', () => {
    expect(isTrailStuck(45, { top: 0, height: 0 })).toBe(false);
    expect(isTrailStuck(Number.NaN, { top: 0, height: 36 })).toBe(false);
  });
});
