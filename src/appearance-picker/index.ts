type FontPreference = 'sans' | 'serif';
type ContrastPreference = 'standard' | 'high';

const FONT_STORAGE_KEY = 'fontPreference';
const CONTRAST_STORAGE_KEY = 'contrastPreference';

interface FontPreferenceRequest {
  generation: number;
  preference: FontPreference;
  promise: Promise<void>;
}

interface FontPreferenceLoader {
  supported: boolean;
  pending: FontPreferenceRequest | null;
  failedPreference: FontPreference | null;
  request(preference: FontPreference): FontPreferenceRequest | null;
  isCurrent(request: FontPreferenceRequest): boolean;
  complete(request: FontPreferenceRequest): void;
  fail(request: FontPreferenceRequest): void;
  cancel(): void;
}

function getFontPreferenceLoader(
  window: Window,
): FontPreferenceLoader | undefined {
  return (
    window as Window & { __tadaFontPreferenceLoader?: FontPreferenceLoader }
  ).__tadaFontPreferenceLoader;
}

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

function getAppliedFontPreference(document: Document): FontPreference {
  return document.documentElement.dataset.fontPreference === 'serif'
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

function syncSwitch(
  document: Document,
  selector: string,
  checked: boolean,
  title: string,
): void {
  const control = document.querySelector<HTMLButtonElement>(selector);
  if (!control) {
    return;
  }
  control.disabled = false;
  control.setAttribute('aria-checked', String(checked));
  control.title = title;
}

function syncAppearance(
  document: Document,
  fontPreference: FontPreference,
  contrastPreference: ContrastPreference,
): void {
  syncSwitch(
    document,
    '[data-font-preference-switch]',
    fontPreference === 'serif',
    fontPreference === 'serif' ? 'Use sans-serif fonts' : 'Use serif fonts',
  );
  syncSwitch(
    document,
    '[data-contrast-preference-switch]',
    contrastPreference === 'high',
    contrastPreference === 'high'
      ? 'Use standard contrast'
      : 'Use high contrast',
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
  const fontLoader = getFontPreferenceLoader(window);
  const defaultFontPreference = getDefaultFontPreference(document);
  const defaultContrastPreference = getDefaultContrastPreference(window);
  const requestedFontPreference = getFontPreference(
    storage,
    defaultFontPreference,
  );
  let fontPreference = getAppliedFontPreference(document);
  let contrastPreference = getContrastPreference(
    storage,
    defaultContrastPreference,
  );

  const requestedFontIsWaiting =
    (fontLoader?.pending?.preference === requestedFontPreference ||
      fontLoader?.failedPreference === requestedFontPreference) ??
    false;
  if (!requestedFontIsWaiting) {
    fontPreference = requestedFontPreference;
    applyFontPreference(document, fontPreference);
  }
  applyContrastPreference(document, contrastPreference);
  syncAppearance(document, fontPreference, contrastPreference);

  const observedRequests = new Set<number>();
  const observeFontRequest = (request: FontPreferenceRequest) => {
    if (observedRequests.has(request.generation)) {
      return;
    }
    observedRequests.add(request.generation);
    request.promise.then(
      () => {
        if (fontLoader?.isCurrent(request)) {
          fontPreference = request.preference;
          saveFontPreference(storage, fontPreference, defaultFontPreference);
          applyFontPreference(document, fontPreference);
          fontLoader.complete(request);
        } else {
          fontPreference = getAppliedFontPreference(document);
        }
        syncAppearance(document, fontPreference, contrastPreference);
      },
      () => {
        fontLoader?.fail(request);
        fontPreference = getAppliedFontPreference(document);
        syncAppearance(document, fontPreference, contrastPreference);
      },
    );
  };

  if (fontLoader?.pending) {
    observeFontRequest(fontLoader.pending);
  }

  const handleClick = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement;

    if (button.dataset.fontPreferenceSwitch !== undefined) {
      fontPreference = getAppliedFontPreference(document);
      if (fontLoader?.pending) {
        fontLoader?.cancel();
        saveFontPreference(storage, fontPreference, defaultFontPreference);
        syncAppearance(document, fontPreference, contrastPreference);
        return;
      }
      const nextFontPreference = fontPreference === 'serif' ? 'sans' : 'serif';
      const request = fontLoader?.request(nextFontPreference) ?? null;
      if (request) {
        observeFontRequest(request);
        return;
      }
      fontPreference = nextFontPreference;
      saveFontPreference(storage, fontPreference, defaultFontPreference);
      applyFontPreference(document, fontPreference);
    } else if (button.dataset.contrastPreferenceSwitch !== undefined) {
      contrastPreference = contrastPreference === 'high' ? 'standard' : 'high';
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
