import { describe, expect, test } from 'bun:test';
import { isEligibleLink } from './eligible';

describe('isEligibleLink', () => {
  const origin = 'http://localhost';

  test('eligible: same-origin absolute path', () => {
    expect(isEligibleLink('http://localhost/about.html', origin)).toBe(true);
  });

  test('eligible: path without extension', () => {
    expect(isEligibleLink('http://localhost/about', origin)).toBe(true);
  });

  test('eligible: path ending in .html', () => {
    expect(isEligibleLink('http://localhost/page.html', origin)).toBe(true);
  });

  test('eligible: root path', () => {
    expect(isEligibleLink('http://localhost/', origin)).toBe(true);
  });

  test('eligible: path with hash', () => {
    expect(isEligibleLink('http://localhost/page.html#section', origin)).toBe(
      true,
    );
  });

  test('ineligible: different origin', () => {
    expect(isEligibleLink('https://example.com/page.html', origin)).toBe(false);
  });

  test('ineligible: PDF file', () => {
    expect(isEligibleLink('http://localhost/doc.pdf', origin)).toBe(false);
  });

  test('ineligible: Java file', () => {
    expect(isEligibleLink('http://localhost/Main.java', origin)).toBe(false);
  });

  test('ineligible: Python file', () => {
    expect(isEligibleLink('http://localhost/script.py', origin)).toBe(false);
  });

  test('ineligible: PNG image', () => {
    expect(isEligibleLink('http://localhost/image.png', origin)).toBe(false);
  });

  test('ineligible: ZIP file', () => {
    expect(isEligibleLink('http://localhost/archive.zip', origin)).toBe(false);
  });

  test('ineligible: JPG image', () => {
    expect(isEligibleLink('http://localhost/photo.jpg', origin)).toBe(false);
  });

  test('ineligible: JSON file', () => {
    expect(isEligibleLink('http://localhost/data.json', origin)).toBe(false);
  });
});
