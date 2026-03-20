const { describe, expect, test } = require('bun:test');
const { parse, oklch } = require('culori');
const { deriveTheme, getTextOnColor } = require('./derive-theme');

function getL(hex) {
  return oklch(parse(hex)).l;
}

describe('deriveTheme', () => {
  test('returns valid hex strings for all outputs', () => {
    const result = deriveTheme('steelblue');
    for (const [key, value] of Object.entries(result)) {
      expect(value).toMatch(/^#[0-9a-f]{3,6}$/);
    }
  });

  test('light theme color lightness is in range', () => {
    for (const color of [
      'cornsilk',
      'navy',
      'steelblue',
      'tomato',
      '#000',
      '#fff',
    ]) {
      const { themeColorLight } = deriveTheme(color);
      const l = getL(themeColorLight);
      expect(l).toBeGreaterThanOrEqual(0.34);
      expect(l).toBeLessThanOrEqual(0.63);
    }
  });

  test('dark theme color lightness is in range', () => {
    for (const color of [
      'cornsilk',
      'navy',
      'steelblue',
      'tomato',
      '#000',
      '#fff',
    ]) {
      const { themeColorDark } = deriveTheme(color);
      const l = getL(themeColorDark);
      expect(l).toBeGreaterThanOrEqual(0.54);
      expect(l).toBeLessThanOrEqual(0.81);
    }
  });

  test('light text color lightness is in range', () => {
    for (const color of ['cornsilk', 'navy', 'steelblue', 'tomato', 'lime']) {
      const { themeColorTextLight } = deriveTheme(color);
      const l = getL(themeColorTextLight);
      expect(l).toBeGreaterThanOrEqual(0.34);
      expect(l).toBeLessThanOrEqual(0.51);
    }
  });

  test('dark text color lightness is in range', () => {
    for (const color of ['cornsilk', 'navy', 'steelblue', 'tomato', 'lime']) {
      const { themeColorTextDark } = deriveTheme(color);
      const l = getL(themeColorTextDark);
      expect(l).toBeGreaterThanOrEqual(0.69);
      expect(l).toBeLessThanOrEqual(0.83);
    }
  });

  test('white text on dark colors', () => {
    expect(deriveTheme('navy').textOnThemeLight).toBe('#fff');
    expect(deriveTheme('#000').textOnThemeLight).toBe('#fff');
    expect(deriveTheme('hsl(351 70% 40%)').textOnThemeLight).toBe('#fff');
  });

  test('black text on bright colors', () => {
    expect(deriveTheme('lime').textOnThemeLight).toBe('#000');
  });

  test('white text on saturated and mid-tone colors', () => {
    expect(deriveTheme('steelblue').textOnThemeLight).toBe('#fff');
    expect(deriveTheme('teal').textOnThemeLight).toBe('#fff');
    expect(deriveTheme('tomato').textOnThemeLight).toBe('#fff');
    expect(deriveTheme('cornsilk').textOnThemeLight).toBe('#fff');
    expect(deriveTheme('hsl(195 70% 40%)').textOnThemeLight).toBe('#fff');
  });

  test('steelblue produces values close to original', () => {
    const result = deriveTheme('steelblue');
    // steelblue OKLCH L is ~0.588 which is within light theme range,
    // so it should be unchanged (or very close)
    expect(result.themeColorLight).toBe('#4682b4');
  });

  test('throws on invalid color', () => {
    expect(() => deriveTheme('notacolor')).toThrow('Invalid color');
  });
});

describe('getTextOnColor', () => {
  test('returns white for dark colors', () => {
    expect(getTextOnColor('navy')).toBe('#fff');
    expect(getTextOnColor('#000')).toBe('#fff');
  });

  test('returns black for bright colors', () => {
    expect(getTextOnColor('cornsilk')).toBe('#000');
    expect(getTextOnColor('#fff')).toBe('#000');
  });

  test('throws on invalid color', () => {
    expect(() => getTextOnColor('notacolor')).toThrow('Invalid color');
  });
});
