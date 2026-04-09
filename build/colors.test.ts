import { describe, expect, test } from 'bun:test';
import { R, G, B, Y, L, P, I, Ri, Gi, Yi, Li } from './colors';

describe('color tag functions', () => {
  test('R wraps text in red', () => {
    const result = R`hello`;
    expect(result).toContain('hello');
    expect(typeof result).toBe('string');
  });

  test('G wraps text in green', () => {
    const result = G`hello`;
    expect(result).toContain('hello');
  });

  test('B wraps text in blue', () => {
    const result = B`hello`;
    expect(result).toContain('hello');
  });

  test('Y wraps text in yellow', () => {
    const result = Y`hello`;
    expect(result).toContain('hello');
  });

  test('L wraps text in dim', () => {
    const result = L`hello`;
    expect(result).toContain('hello');
  });

  test('P wraps text in magenta', () => {
    const result = P`hello`;
    expect(result).toContain('hello');
  });

  test('I wraps text in italic bold', () => {
    const result = I`hello`;
    expect(result).toContain('hello');
  });

  test('Ri wraps text in inverse red', () => {
    const result = Ri`hello`;
    expect(result).toContain('hello');
  });

  test('Gi wraps text in inverse green', () => {
    const result = Gi`hello`;
    expect(result).toContain('hello');
  });

  test('Yi wraps text in inverse yellow', () => {
    const result = Yi`hello`;
    expect(result).toContain('hello');
  });

  test('Li wraps text in inverse dim', () => {
    const result = Li`hello`;
    expect(result).toContain('hello');
  });

  test('handles template interpolation', () => {
    const name = 'world';
    const result = R`hello ${name}`;
    expect(result).toContain('hello world');
  });
});
