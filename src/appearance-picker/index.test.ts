import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import mount, {
  applyContrastPreference,
  applyFontPreference,
  getContrastPreference,
  getFontPreference,
  saveContrastPreference,
  saveFontPreference,
} from './index';

function createPickers(
  defaultFont: 'sans' | 'serif' = 'sans',
  defaultContrast: 'standard' | 'high' = 'standard',
) {
  const effectiveFont =
    defaultFont === 'serif' ? ' data-font-preference="serif"' : '';
  const effectiveContrast =
    defaultContrast === 'high' ? ' data-contrast-preference="high"' : '';
  const dom = new JSDOM(
    `<html data-default-font-preference="${defaultFont}" data-default-contrast-preference="${defaultContrast}"${effectiveFont}${effectiveContrast}>
    <body><div class="appearance-pickers">
      <div class="font-picker" role="group" aria-label="Font style">
        <button type="button" data-font-preference-value="sans" aria-pressed="${defaultFont === 'sans'}" disabled>Sans</button>
        <button type="button" data-font-preference-value="serif" aria-pressed="${defaultFont === 'serif'}" disabled>Serif</button>
      </div>
      <div class="contrast-picker" role="group" aria-label="Contrast">
        <button type="button" data-contrast-preference-value="standard" aria-pressed="${defaultContrast === 'standard'}" disabled>Standard</button>
        <button type="button" data-contrast-preference-value="high" aria-pressed="${defaultContrast === 'high'}" disabled>High</button>
      </div>
    </div></body></html>`,
    { url: 'https://example.com/' },
  );
  return dom.window;
}

describe('appearance picker', () => {
  test('defaults both preferences and enables the rendered controls after mounting', () => {
    const window = createPickers();
    mount(window);

    expect(
      window.document.documentElement.dataset.fontPreference,
    ).toBeUndefined();
    expect(
      window.document.documentElement.dataset.contrastPreference,
    ).toBeUndefined();
    expect(
      Array.from(window.document.querySelectorAll('button')).every(
        button => !button.disabled,
      ),
    ).toBe(true);
    expect(
      window.document
        .querySelector('[data-font-preference-value="sans"]')!
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      window.document
        .querySelector('[data-contrast-preference-value="standard"]')!
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  test('restores stored font and contrast preferences', () => {
    const window = createPickers();
    window.localStorage.setItem('fontPreference', 'serif');
    window.localStorage.setItem('contrastPreference', 'high');

    mount(window);

    expect(window.document.documentElement.dataset.fontPreference).toBe(
      'serif',
    );
    expect(window.document.documentElement.dataset.contrastPreference).toBe(
      'high',
    );
    expect(
      window.document
        .querySelector('[data-font-preference-value="serif"]')!
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      window.document
        .querySelector('[data-contrast-preference-value="high"]')!
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  test('uses configured defaults and persists only opposite overrides', () => {
    const window = createPickers('serif', 'high');
    mount(window);

    expect(window.document.documentElement.dataset.fontPreference).toBe(
      'serif',
    );
    expect(window.document.documentElement.dataset.contrastPreference).toBe(
      'high',
    );

    window.document
      .querySelector<HTMLButtonElement>('[data-font-preference-value="sans"]')!
      .click();
    window.document
      .querySelector<HTMLButtonElement>(
        '[data-contrast-preference-value="standard"]',
      )!
      .click();

    expect(window.localStorage.getItem('fontPreference')).toBe('sans');
    expect(window.localStorage.getItem('contrastPreference')).toBe('standard');
    expect(
      window.document.documentElement.dataset.fontPreference,
    ).toBeUndefined();
    expect(
      window.document.documentElement.dataset.contrastPreference,
    ).toBeUndefined();

    window.document
      .querySelector<HTMLButtonElement>('[data-font-preference-value="serif"]')!
      .click();
    window.document
      .querySelector<HTMLButtonElement>(
        '[data-contrast-preference-value="high"]',
      )!
      .click();

    expect(window.localStorage.getItem('fontPreference')).toBeNull();
    expect(window.localStorage.getItem('contrastPreference')).toBeNull();
  });

  test('falls back to configured defaults for invalid stored values', () => {
    const window = createPickers('serif', 'high');
    window.localStorage.setItem('fontPreference', 'invalid');
    window.localStorage.setItem('contrastPreference', 'invalid');

    expect(getFontPreference(window.localStorage, 'serif')).toBe('serif');
    expect(getContrastPreference(window.localStorage, 'high')).toBe('high');
  });

  test('persists non-defaults and clears each default independently', () => {
    const window = createPickers();
    mount(window);

    window.document
      .querySelector<HTMLButtonElement>('[data-font-preference-value="serif"]')!
      .click();
    window.document
      .querySelector<HTMLButtonElement>(
        '[data-contrast-preference-value="high"]',
      )!
      .click();

    expect(window.localStorage.getItem('fontPreference')).toBe('serif');
    expect(window.localStorage.getItem('contrastPreference')).toBe('high');

    window.document
      .querySelector<HTMLButtonElement>('[data-font-preference-value="sans"]')!
      .click();
    expect(window.localStorage.getItem('fontPreference')).toBeNull();
    expect(window.localStorage.getItem('contrastPreference')).toBe('high');
    expect(window.document.documentElement.dataset.contrastPreference).toBe(
      'high',
    );

    window.document
      .querySelector<HTMLButtonElement>(
        '[data-contrast-preference-value="standard"]',
      )!
      .click();
    expect(window.localStorage.getItem('contrastPreference')).toBeNull();
    expect(
      window.document.documentElement.dataset.contrastPreference,
    ).toBeUndefined();
  });

  test('preference helpers fall back when storage throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const document = createPickers().document;

    expect(getFontPreference(storage, 'serif')).toBe('serif');
    expect(getContrastPreference(storage, 'high')).toBe('high');
    expect(() => saveFontPreference(storage, 'sans', 'serif')).not.toThrow();
    expect(() =>
      saveContrastPreference(storage, 'standard', 'high'),
    ).not.toThrow();
    expect(() => applyFontPreference(document, 'serif')).not.toThrow();
    expect(() => applyContrastPreference(document, 'high')).not.toThrow();
    expect(document.documentElement.dataset.fontPreference).toBe('serif');
    expect(document.documentElement.dataset.contrastPreference).toBe('high');
  });

  test('cleanup removes both pickers click handlers', () => {
    const window = createPickers();
    const cleanup = mount(window);
    cleanup();

    window.document
      .querySelector<HTMLButtonElement>('[data-font-preference-value="serif"]')!
      .click();
    window.document
      .querySelector<HTMLButtonElement>(
        '[data-contrast-preference-value="high"]',
      )!
      .click();

    expect(window.localStorage.getItem('fontPreference')).toBeNull();
    expect(window.localStorage.getItem('contrastPreference')).toBeNull();
  });
});
