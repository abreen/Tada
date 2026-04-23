import type { Globals } from './globals';

const defaultFetch: Globals['fetch'] = async () =>
  new Response('', { status: 404 });

export function createGlobals(overrides: Partial<Globals> = {}): Globals {
  return {
    replaceLocation(window, value) {
      window.history.replaceState(window.history.state, '', value);
    },
    createResizeObserver() {
      return { disconnect() {}, observe() {} };
    },
    fetch: defaultFetch,
    importModule: async () => ({}),
    isDocumentHidden() {
      return false;
    },
    now() {
      return 0;
    },
    setLocationHash(window, value) {
      window.location.hash = value;
    },
    setLocationHref(window, value) {
      window.history.replaceState(window.history.state, '', value);
    },
    ...overrides,
  };
}
