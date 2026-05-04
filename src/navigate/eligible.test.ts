import { describe, expect, test } from 'bun:test';
import { isEligibleLink } from './eligible';

describe('isEligibleLink', () => {
  const origin = 'http://localhost';
  const basePath = '/';

  test('eligible: same-origin absolute path', () => {
    expect(
      isEligibleLink('http://localhost/about.html', origin, basePath),
    ).toBe(true);
  });

  test('eligible: path without extension', () => {
    expect(isEligibleLink('http://localhost/about', origin, basePath)).toBe(
      true,
    );
  });

  test('eligible: path ending in .html', () => {
    expect(isEligibleLink('http://localhost/page.html', origin, basePath)).toBe(
      true,
    );
  });

  test('eligible: root path', () => {
    expect(isEligibleLink('http://localhost/', origin, basePath)).toBe(true);
  });

  test('eligible: path with hash', () => {
    expect(
      isEligibleLink('http://localhost/page.html#section', origin, basePath),
    ).toBe(true);
  });

  test('ineligible: different origin', () => {
    expect(
      isEligibleLink('https://example.com/page.html', origin, basePath),
    ).toBe(false);
  });

  test('ineligible: PDF file', () => {
    expect(isEligibleLink('http://localhost/doc.pdf', origin, basePath)).toBe(
      false,
    );
  });

  test('ineligible: Java file', () => {
    expect(isEligibleLink('http://localhost/Main.java', origin, basePath)).toBe(
      false,
    );
  });

  test('ineligible: Python file', () => {
    expect(isEligibleLink('http://localhost/script.py', origin, basePath)).toBe(
      false,
    );
  });

  test('ineligible: PNG image', () => {
    expect(isEligibleLink('http://localhost/image.png', origin, basePath)).toBe(
      false,
    );
  });

  test('ineligible: ZIP file', () => {
    expect(
      isEligibleLink('http://localhost/archive.zip', origin, basePath),
    ).toBe(false);
  });

  test('ineligible: JPG image', () => {
    expect(isEligibleLink('http://localhost/photo.jpg', origin, basePath)).toBe(
      false,
    );
  });

  test('ineligible: JSON file', () => {
    expect(isEligibleLink('http://localhost/data.json', origin, basePath)).toBe(
      false,
    );
  });

  test('eligible: link under non-root base path', () => {
    expect(
      isEligibleLink('http://localhost/course1/page.html', origin, '/course1/'),
    ).toBe(true);
  });

  test('eligible: exact non-root base path', () => {
    expect(isEligibleLink('http://localhost/course1', origin, '/course1')).toBe(
      true,
    );
  });

  test('ineligible: link whose first segment only starts with base path', () => {
    expect(
      isEligibleLink('http://localhost/course10/page.html', origin, '/course1'),
    ).toBe(false);
  });

  test('ineligible: link outside base path', () => {
    expect(
      isEligibleLink('http://localhost/course2/page.html', origin, '/course1/'),
    ).toBe(false);
  });

  test('ineligible: link to root when base path is subdir', () => {
    expect(isEligibleLink('http://localhost/', origin, '/course1/')).toBe(
      false,
    );
  });
});
