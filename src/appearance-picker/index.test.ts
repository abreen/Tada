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
      <button type="button" class="font-picker" role="switch" data-font-preference-switch aria-label="Use serif fonts" aria-checked="${defaultFont === 'serif'}" disabled>Font</button>
      <button type="button" class="contrast-picker" role="switch" data-contrast-preference-switch aria-label="Use high contrast" aria-checked="${defaultContrast === 'high'}" disabled>Contrast</button>
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
        .querySelector('[data-font-preference-switch]')!
        .getAttribute('aria-checked'),
    ).toBe('false');
    expect(
      window.document
        .querySelector('[data-contrast-preference-switch]')!
        .getAttribute('aria-checked'),
    ).toBe('false');
    expect(
      window.document
        .querySelector('[data-font-preference-switch]')!
        .getAttribute('title'),
    ).toBe('Use serif fonts');
    expect(
      window.document
        .querySelector('[data-contrast-preference-switch]')!
        .getAttribute('title'),
    ).toBe('Use high contrast');
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
        .querySelector('[data-font-preference-switch]')!
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      window.document
        .querySelector('[data-contrast-preference-switch]')!
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      window.document
        .querySelector('[data-font-preference-switch]')!
        .getAttribute('title'),
    ).toBe('Use sans-serif fonts');
    expect(
      window.document
        .querySelector('[data-contrast-preference-switch]')!
        .getAttribute('title'),
    ).toBe('Use standard contrast');
    expect(
      window.document
        .querySelector('[data-font-preference-switch]')!
        .getAttribute('aria-label'),
    ).toBe('Use serif fonts');
    expect(
      window.document
        .querySelector('[data-contrast-preference-switch]')!
        .getAttribute('aria-label'),
    ).toBe('Use high contrast');
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
      .querySelector<HTMLButtonElement>('[data-font-preference-switch]')!
      .click();
    window.document
      .querySelector<HTMLButtonElement>('[data-contrast-preference-switch]')!
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
      .querySelector<HTMLButtonElement>('[data-font-preference-switch]')!
      .click();
    window.document
      .querySelector<HTMLButtonElement>('[data-contrast-preference-switch]')!
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
      .querySelector<HTMLButtonElement>('[data-font-preference-switch]')!
      .click();
    window.document
      .querySelector<HTMLButtonElement>('[data-contrast-preference-switch]')!
      .click();

    expect(window.localStorage.getItem('fontPreference')).toBe('serif');
    expect(window.localStorage.getItem('contrastPreference')).toBe('high');

    window.document
      .querySelector<HTMLButtonElement>('[data-font-preference-switch]')!
      .click();
    expect(window.localStorage.getItem('fontPreference')).toBeNull();
    expect(window.localStorage.getItem('contrastPreference')).toBe('high');
    expect(window.document.documentElement.dataset.contrastPreference).toBe(
      'high',
    );

    window.document
      .querySelector<HTMLButtonElement>('[data-contrast-preference-switch]')!
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
      .querySelector<HTMLButtonElement>('[data-font-preference-switch]')!
      .click();
    window.document
      .querySelector<HTMLButtonElement>('[data-contrast-preference-switch]')!
      .click();

    expect(window.localStorage.getItem('fontPreference')).toBeNull();
    expect(window.localStorage.getItem('contrastPreference')).toBeNull();
  });

  test('a second font switch activation cancels the pending change', () => {
    const window = createPickers();
    let pending: {
      generation: number;
      preference: 'sans' | 'serif';
      promise: Promise<void>;
    } | null = null;
    let cancelCount = 0;
    const requestedPreferences: Array<'sans' | 'serif'> = [];
    const fontLoader = {
      supported: true,
      get pending() {
        return pending;
      },
      failedPreference: null,
      request(preference: 'sans' | 'serif') {
        requestedPreferences.push(preference);
        pending = { generation: 1, preference, promise: new Promise(() => {}) };
        return pending;
      },
      isCurrent: () => true,
      complete: () => {},
      fail: () => {},
      cancel() {
        cancelCount += 1;
        pending = null;
      },
    };
    (
      window as typeof window & {
        __tadaFontPreferenceLoader: typeof fontLoader;
      }
    ).__tadaFontPreferenceLoader = fontLoader;
    mount(window);
    const fontSwitch = window.document.querySelector<HTMLButtonElement>(
      '[data-font-preference-switch]',
    )!;

    fontSwitch.click();
    expect(requestedPreferences).toEqual(['serif']);
    expect(fontSwitch.getAttribute('aria-checked')).toBe('false');

    fontSwitch.click();
    expect(cancelCount).toBe(1);
    expect(pending).toBeNull();
    expect(fontSwitch.getAttribute('aria-checked')).toBe('false');
  });
});
