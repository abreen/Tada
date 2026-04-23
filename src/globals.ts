type FetchFunction = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type ImportModuleFunction = (specifier: string) => Promise<unknown>;
type LocationMutationFunction = (window: Window, value: string) => void;

export interface Globals {
  replaceLocation: LocationMutationFunction;
  createResizeObserver: (
    callback: ResizeObserverCallback,
  ) => Pick<ResizeObserver, 'disconnect' | 'observe'>;
  fetch: FetchFunction;
  getSiteBasePath: () => string;
  getSiteDefaultTimezone: () => string;
  getSiteTimezones: () => TimeZone[];
  getSiteTitlePostfix: () => string;
  importModule: ImportModuleFunction;
  isDev: () => boolean;
  isDocumentHidden: (document: Document) => boolean;
  now: () => number;
  setLocationHash: LocationMutationFunction;
  setLocationHref: LocationMutationFunction;
}

export const globals: Globals = {
  replaceLocation(window, value) {
    window.location.replace(value);
  },
  createResizeObserver(callback) {
    return new ResizeObserver(callback);
  },
  fetch(input: RequestInfo | URL, init?: RequestInit) {
    return fetch(input, init);
  },
  getSiteBasePath() {
    return __SITE_BASE_PATH__;
  },
  getSiteDefaultTimezone() {
    return __SITE_DEFAULT_TIMEZONE__;
  },
  getSiteTimezones() {
    return __SITE_TIMEZONES__;
  },
  getSiteTitlePostfix() {
    return __SITE_TITLE_POSTFIX__;
  },
  importModule(specifier) {
    return import(specifier);
  },
  isDev() {
    return typeof __IS_DEV__ !== 'undefined' && __IS_DEV__;
  },
  isDocumentHidden(document) {
    return document.hidden;
  },
  now() {
    return Date.now();
  },
  setLocationHash(window, value) {
    window.location.hash = value;
  },
  setLocationHref(window, value) {
    window.location.href = value;
  },
};
