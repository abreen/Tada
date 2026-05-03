import {
  EMPTY_RESPONSE_VALIDATORS,
  getPreferredValidatorKey,
  getResponseValidators,
  hasResponseValidatorsChanged,
  hasUsableResponseValidators,
  type ResponseValidators,
} from '../validators';
import { NAVIGATION_EVENT, refreshCurrentPage } from '../navigate/runtime';
import { globals } from '../globals';

const POLL_INTERVAL_MS = 600_000;

interface PageUpdateOptions {
  pollIntervalMs?: number;
  refreshPage?: (window: Window) => Promise<void>;
}

function createToast(document: Document): {
  container: HTMLDivElement;
  toast: HTMLDivElement;
  reloadButton: HTMLButtonElement;
  dismissButton: HTMLButtonElement;
} {
  const container = document.createElement('div');
  container.className = 'page-update-container';

  const toast = document.createElement('div');
  toast.className = 'page-update-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const body = document.createElement('div');
  body.className = 'page-update-body';

  const message = document.createElement('div');
  message.className = 'page-update-message';
  message.textContent = 'A newer version of this page is available.';

  const actions = document.createElement('div');
  actions.className = 'page-update-actions';

  const reloadButton = document.createElement('button');
  reloadButton.type = 'button';
  reloadButton.textContent = 'Reload';

  const dismissButton = document.createElement('button');
  dismissButton.type = 'button';
  dismissButton.textContent = 'Dismiss';

  actions.append(reloadButton, dismissButton);
  body.append(message, actions);
  toast.appendChild(body);
  container.appendChild(toast);
  document.body.appendChild(container);

  return { container, toast, reloadButton, dismissButton };
}

export function mountPageUpdate(
  window: Window,
  options: PageUpdateOptions = {},
): (() => void) | undefined {
  const { document } = window;
  if (!document.body) {
    return;
  }

  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const refreshPage = options.refreshPage ?? refreshCurrentPage;
  const { container, toast, reloadButton, dismissButton } =
    createToast(document);

  let currentPath = window.location.pathname;
  let baseline = EMPTY_RESPONSE_VALIDATORS;
  let dismissedValidatorKey: string | null = null;
  let nextValidator: ResponseValidators | null = null;
  let hasBaseline = false;
  let timer: number | null = null;
  let checkInFlight = false;
  let rerunAfterCurrentCheck = false;

  function hideToast() {
    toast.classList.remove('is-showing');
  }

  function showToast() {
    toast.classList.add('is-showing');
  }

  function clearTimer() {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleNextCheck() {
    clearTimer();
    if (globals.isDocumentHidden(document)) {
      return;
    }
    timer = window.setTimeout(() => {
      void checkForUpdate();
    }, pollIntervalMs);
  }

  async function fetchValidators(
    path: string,
  ): Promise<ResponseValidators | null> {
    if (__IS_DEV__) {
      console.log(
        `[page-update] HEAD ${path} hidden=${globals.isDocumentHidden(document)} visibility=${document.visibilityState} focus=${document.hasFocus()}`,
      );
    }

    const res = await globals.fetch(path, {
      method: 'HEAD',
      cache: 'no-cache',
    });

    if (__IS_DEV__) {
      console.log(
        `[page-update] HEAD ${path} -> ${res.status} etag=${res.headers.get('ETag')} last-modified=${res.headers.get('Last-Modified')} hidden=${globals.isDocumentHidden(document)} visibility=${document.visibilityState} focus=${document.hasFocus()}`,
      );
    }

    if (!res.ok) {
      return null;
    }

    const validators = getResponseValidators(res);
    if (!hasUsableResponseValidators(validators)) {
      return null;
    }

    return validators;
  }

  async function checkForUpdate(): Promise<void> {
    if (checkInFlight) {
      rerunAfterCurrentCheck = true;
      return;
    }

    const requestedPath = currentPath;
    let shouldRerun = false;
    checkInFlight = true;
    try {
      const validators = await fetchValidators(requestedPath);
      if (!validators || requestedPath !== currentPath) {
        return;
      }

      if (!hasBaseline) {
        baseline = validators;
        hasBaseline = true;
        return;
      }

      if (!hasResponseValidatorsChanged(baseline, validators)) {
        return;
      }

      nextValidator = validators;
      const validatorKey = getPreferredValidatorKey(validators);
      if (validatorKey !== null && validatorKey === dismissedValidatorKey) {
        hideToast();
        return;
      }

      showToast();
    } catch {
      // best-effort
    } finally {
      checkInFlight = false;
      if (rerunAfterCurrentCheck && !globals.isDocumentHidden(document)) {
        rerunAfterCurrentCheck = false;
        shouldRerun = true;
      } else {
        scheduleNextCheck();
      }
    }

    if (shouldRerun) {
      void checkForUpdate();
    }
  }

  function resetState() {
    currentPath = window.location.pathname;
    baseline = EMPTY_RESPONSE_VALIDATORS;
    dismissedValidatorKey = null;
    nextValidator = null;
    hasBaseline = false;
    hideToast();
    clearTimer();
    if (!globals.isDocumentHidden(document)) {
      void checkForUpdate();
    }
  }

  function handleVisibilityChange() {
    if (__IS_DEV__) {
      console.log(
        `[page-update] visibilitychange hidden=${globals.isDocumentHidden(document)} visibility=${document.visibilityState} focus=${document.hasFocus()}`,
      );
    }

    clearTimer();
    if (globals.isDocumentHidden(document)) {
      return;
    }

    void checkForUpdate();
  }

  function handleNavigation() {
    if (__IS_DEV__) {
      console.log(
        `[page-update] navigation path=${window.location.pathname} visibility=${document.visibilityState} focus=${document.hasFocus()}`,
      );
    }
    resetState();
  }

  function handleDismiss() {
    dismissedValidatorKey =
      nextValidator === null ? null : getPreferredValidatorKey(nextValidator);
    hideToast();
  }

  function handleWindowFocus() {
    if (__IS_DEV__) {
      console.log(
        `[page-update] window focus visibility=${document.visibilityState} focus=${document.hasFocus()}`,
      );
    }
  }

  function handleWindowBlur() {
    if (__IS_DEV__) {
      console.log(
        `[page-update] window blur visibility=${document.visibilityState} focus=${document.hasFocus()}`,
      );
    }
  }

  function handleReloadClick() {
    void refreshPage(window);
  }

  reloadButton.addEventListener('click', handleReloadClick);
  dismissButton.addEventListener('click', handleDismiss);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener(NAVIGATION_EVENT, handleNavigation);

  if (!globals.isDocumentHidden(document)) {
    if (__IS_DEV__) {
      console.log(
        `[page-update] mount path=${currentPath} interval=${pollIntervalMs} visibility=${document.visibilityState} focus=${document.hasFocus()}`,
      );
    }

    void checkForUpdate();
  }

  return () => {
    clearTimer();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleWindowFocus);
    window.removeEventListener('blur', handleWindowBlur);
    window.removeEventListener(NAVIGATION_EVENT, handleNavigation);
    dismissButton.removeEventListener('click', handleDismiss);
    reloadButton.removeEventListener('click', handleReloadClick);
    container.remove();
  };
}

export default function mount(window: Window): (() => void) | undefined {
  return mountPageUpdate(window);
}
