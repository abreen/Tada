import {
  EMPTY_RESPONSE_VALIDATORS,
  getResponseValidators,
  hasResponseValidatorsChanged,
  hasUsableResponseValidators,
  type ResponseValidators,
} from '../validators';
import { NAVIGATION_EVENT, refreshCurrentPage } from '../navigate/runtime';
import { globals } from '../globals';
import { createHeaderIndicator } from '../header-indicator';

const POLL_INTERVAL_MS = 600_000;
export const PAGE_UPDATE_REFRESH_EVENT = 'tada:page-update-refresh';

interface PageUpdateOptions {
  pollIntervalMs?: number;
  refreshPage?: (window: Window) => Promise<void>;
}

export function mountPageUpdate(
  window: Window,
  options: PageUpdateOptions = {},
): (() => void) | undefined {
  const { document } = window;
  const mountParent = document.getElementById('page-update-container');
  if (!mountParent) {
    return;
  }
  const container: HTMLElement = mountParent;

  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const refreshPage = options.refreshPage ?? refreshCurrentPage;
  const indicator = createHeaderIndicator(document, {
    text: 'Page updated',
    buttonLabel: 'Reload page',
    icon: 'refresh',
  });

  let currentPath = window.location.pathname + window.location.search;
  let navigationGeneration = 0;
  let disposed = false;
  let baseline = EMPTY_RESPONSE_VALIDATORS;
  let hasBaseline = false;
  let timer: number | null = null;
  let checkInFlight = false;
  let rerunAfterCurrentCheck = false;

  function hideIndicator() {
    indicator.element.remove();
  }

  function showIndicator() {
    if (!indicator.element.isConnected) {
      container.appendChild(indicator.element);
    }
  }

  function clearTimer() {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleNextCheck() {
    clearTimer();
    if (disposed || globals.isDocumentHidden(document)) {
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
    const requestedGeneration = navigationGeneration;
    checkInFlight = true;
    try {
      const validators = await fetchValidators(requestedPath);
      if (
        !validators ||
        disposed ||
        requestedGeneration !== navigationGeneration ||
        requestedPath !== currentPath
      ) {
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

      showIndicator();
    } catch {
      // best-effort
    } finally {
      checkInFlight = false;
      if (
        rerunAfterCurrentCheck &&
        !disposed &&
        !globals.isDocumentHidden(document)
      ) {
        rerunAfterCurrentCheck = false;
        void checkForUpdate();
      } else if (requestedGeneration === navigationGeneration) {
        scheduleNextCheck();
      }
    }
  }

  function resetState(
    validators: ResponseValidators = EMPTY_RESPONSE_VALIDATORS,
  ) {
    navigationGeneration++;
    rerunAfterCurrentCheck = false;
    currentPath = window.location.pathname + window.location.search;
    baseline = validators;
    hasBaseline = hasUsableResponseValidators(validators);
    hideIndicator();
    clearTimer();
    scheduleNextCheck();
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

  function handleNavigation(event: Event) {
    if (__IS_DEV__) {
      console.log(
        `[page-update] navigation path=${window.location.pathname} visibility=${document.visibilityState} focus=${document.hasFocus()}`,
      );
    }
    resetState(
      (event as CustomEvent<{ validators?: ResponseValidators }>).detail
        ?.validators,
    );
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
    void refreshPage(window).then(() => {
      const EventCtor = (window as unknown as { Event: typeof Event }).Event;
      window.dispatchEvent(new EventCtor(PAGE_UPDATE_REFRESH_EVENT));
    });
  }

  indicator.button.addEventListener('click', handleReloadClick);
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
    disposed = true;
    clearTimer();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleWindowFocus);
    window.removeEventListener('blur', handleWindowBlur);
    window.removeEventListener(NAVIGATION_EVENT, handleNavigation);
    indicator.button.removeEventListener('click', handleReloadClick);
    indicator.element.remove();
  };
}

export default function mount(window: Window): (() => void) | undefined {
  return mountPageUpdate(window);
}
