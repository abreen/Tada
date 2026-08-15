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
  storedValue: T,
  defaultValue: T,
): T {
  try {
    return storage?.getItem(key) === storedValue ? storedValue : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveStoredPreference<T extends string>(
  storage: Storage | null,
  key: string,
  preference: T,
  storedValue: T,
): void {
  try {
    if (preference === storedValue) {
      storage?.setItem(key, preference);
    } else {
      storage?.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

export function getFontPreference(storage: Storage | null): FontPreference {
  return getStoredPreference(storage, FONT_STORAGE_KEY, 'serif', 'sans');
}

export function getContrastPreference(
  storage: Storage | null,
): ContrastPreference {
  return getStoredPreference(storage, CONTRAST_STORAGE_KEY, 'high', 'standard');
}

export function saveFontPreference(
  storage: Storage | null,
  preference: FontPreference,
): void {
  saveStoredPreference(storage, FONT_STORAGE_KEY, preference, 'serif');
}

export function saveContrastPreference(
  storage: Storage | null,
  preference: ContrastPreference,
): void {
  saveStoredPreference(storage, CONTRAST_STORAGE_KEY, preference, 'high');
}

export function applyFontPreference(
  document: Document,
  preference: FontPreference,
): void {
  if (preference === 'serif') {
    document.documentElement.dataset.fontPreference = preference;
  } else {
    delete document.documentElement.dataset.fontPreference;
  }
}

export function applyContrastPreference(
  document: Document,
  preference: ContrastPreference,
): void {
  if (preference === 'high') {
    document.documentElement.dataset.contrastPreference = preference;
  } else {
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
  let fontPreference = getFontPreference(storage);
  let contrastPreference = getContrastPreference(storage);

  applyFontPreference(document, fontPreference);
  applyContrastPreference(document, contrastPreference);
  syncAppearance(document, fontPreference, contrastPreference);

  const handleClick = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const fontValue = button.dataset.fontPreferenceValue;
    const contrastValue = button.dataset.contrastPreferenceValue;

    if (fontValue === 'sans' || fontValue === 'serif') {
      fontPreference = fontValue;
      saveFontPreference(storage, fontPreference);
      applyFontPreference(document, fontPreference);
    } else if (contrastValue === 'standard' || contrastValue === 'high') {
      contrastPreference = contrastValue;
      saveContrastPreference(storage, contrastPreference);
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
