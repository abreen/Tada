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
  createIntersectionObserver: (
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) => Pick<IntersectionObserver, 'disconnect' | 'observe'>;
  fetch: FetchFunction;
  importModule: ImportModuleFunction;
  isDocumentHidden: (document: Document) => boolean;
  now: () => number;
  /** Logs an error in every build, for problems in a site's own code */
  reportError: (message: string, error: unknown) => void;
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
  createIntersectionObserver(callback, options) {
    return new IntersectionObserver(callback, options);
  },
  fetch(input: RequestInfo | URL, init?: RequestInit) {
    return fetch(input, init);
  },
  importModule(specifier) {
    return import(specifier);
  },
  isDocumentHidden(document) {
    return document.hidden;
  },
  now() {
    return Date.now();
  },
  reportError(message, error) {
    console.error(message, error);
  },
  setLocationHash(window, value) {
    window.location.hash = value;
  },
  setLocationHref(window, value) {
    window.location.href = value;
  },
};
