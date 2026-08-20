export type FontPreference = 'sans' | 'serif';
export type ContrastPreference = 'standard' | 'high';

const FONT_STORAGE_KEY = 'fontPreference';
const CONTRAST_STORAGE_KEY = 'contrastPreference';

function getStorage(window: Window): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getStoredPreference<T extends string>(
  storage: Storage | null,
  key: string,
  storedValues: readonly T[],
  defaultValue: T,
): T {
  try {
    const storedValue = storage?.getItem(key);
    return storedValues.includes(storedValue as T)
      ? (storedValue as T)
      : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveStoredPreference<T extends string>(
  storage: Storage | null,
  key: string,
  preference: T,
  defaultValue: T,
): void {
  try {
    if (preference === defaultValue) {
      storage?.removeItem(key);
    } else {
      storage?.setItem(key, preference);
    }
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

export function getFontPreference(
  storage: Storage | null,
  defaultValue: FontPreference = 'sans',
): FontPreference {
  return getStoredPreference(
    storage,
    FONT_STORAGE_KEY,
    ['sans', 'serif'],
    defaultValue,
  );
}

export function getContrastPreference(
  storage: Storage | null,
  defaultValue: ContrastPreference = 'standard',
): ContrastPreference {
  return getStoredPreference(
    storage,
    CONTRAST_STORAGE_KEY,
    ['standard', 'high'],
    defaultValue,
  );
}

export function saveFontPreference(
  storage: Storage | null,
  preference: FontPreference,
  defaultValue: FontPreference = 'sans',
): void {
  saveStoredPreference(storage, FONT_STORAGE_KEY, preference, defaultValue);
}

export function saveContrastPreference(
  storage: Storage | null,
  preference: ContrastPreference,
  defaultValue: ContrastPreference = 'standard',
): void {
  saveStoredPreference(storage, CONTRAST_STORAGE_KEY, preference, defaultValue);
}

function getDefaultFontPreference(document: Document): FontPreference {
  return document.documentElement.dataset.defaultFontPreference === 'serif'
    ? 'serif'
    : 'sans';
}

function getDefaultContrastPreference(window: Window): ContrastPreference {
  const configured =
    window.document.documentElement.dataset.defaultContrastPreference === 'high'
      ? 'high'
      : 'standard';

  if (configured === 'high' || typeof window.matchMedia !== 'function') {
    return configured;
  }

  try {
    return window.matchMedia('(prefers-contrast: more)').matches
      ? 'high'
      : configured;
  } catch {
    return configured;
  }
}

export function applyFontPreference(
  document: Document,
  preference: FontPreference,
): void {
  if (preference === 'serif') {
    if (document.documentElement.dataset.fontPreference !== preference) {
      document.documentElement.dataset.fontPreference = preference;
    }
  } else if (document.documentElement.dataset.fontPreference !== undefined) {
    delete document.documentElement.dataset.fontPreference;
  }
}

export function applyContrastPreference(
  document: Document,
  preference: ContrastPreference,
): void {
  if (preference === 'high') {
    if (document.documentElement.dataset.contrastPreference !== preference) {
      document.documentElement.dataset.contrastPreference = preference;
    }
  } else if (
    document.documentElement.dataset.contrastPreference !== undefined
  ) {
    delete document.documentElement.dataset.contrastPreference;
  }
}

function syncControls(
  document: Document,
  selector: string,
  preference: string,
): void {
  document.querySelectorAll<HTMLButtonElement>(selector).forEach(button => {
    button.disabled = false;
    button.setAttribute(
      'aria-pressed',
      String(
        button.dataset.fontPreferenceValue === preference ||
          button.dataset.contrastPreferenceValue === preference,
      ),
    );
  });
}

function syncAppearance(
  document: Document,
  fontPreference: FontPreference,
  contrastPreference: ContrastPreference,
): void {
  syncControls(document, '[data-font-preference-value]', fontPreference);
  syncControls(
    document,
    '[data-contrast-preference-value]',
    contrastPreference,
  );
}

export default function mountAppearancePicker(window: Window): () => void {
  const { document } = window;
  const container = document.querySelector<HTMLElement>('.appearance-pickers');
  if (!container) {
    return () => {};
  }

  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button'),
  );
  const storage = getStorage(window);
  const defaultFontPreference = getDefaultFontPreference(document);
  const defaultContrastPreference = getDefaultContrastPreference(window);
  let fontPreference = getFontPreference(storage, defaultFontPreference);
  let contrastPreference = getContrastPreference(
    storage,
    defaultContrastPreference,
  );

  applyFontPreference(document, fontPreference);
  applyContrastPreference(document, contrastPreference);
  syncAppearance(document, fontPreference, contrastPreference);

  const handleClick = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const fontValue = button.dataset.fontPreferenceValue;
    const contrastValue = button.dataset.contrastPreferenceValue;

    if (fontValue === 'sans' || fontValue === 'serif') {
      fontPreference = fontValue;
      saveFontPreference(storage, fontPreference, defaultFontPreference);
      applyFontPreference(document, fontPreference);
    } else if (contrastValue === 'standard' || contrastValue === 'high') {
      contrastPreference = contrastValue;
      saveContrastPreference(
        storage,
        contrastPreference,
        defaultContrastPreference,
      );
      applyContrastPreference(document, contrastPreference);
    } else {
      return;
    }

    syncAppearance(document, fontPreference, contrastPreference);
  };

  for (const button of buttons) {
    button.addEventListener('click', handleClick);
  }

  return () => {
    for (const button of buttons) {
      button.removeEventListener('click', handleClick);
    }
  };
}
