import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { flushMicrotasks } from '../../test-helpers';
import { createGlobals } from '../globals.test';

const imported: string[] = [];
let pendingImport: Promise<unknown> = Promise.resolve({});

mock.module('../globals', () => ({
  globals: createGlobals({
    importModule: specifier => {
      imported.push(specifier);
      return pendingImport;
    },
  }),
}));

// Tada's own components are not under test. Mocked modules are shared by
// every test file, so the originals are restored afterward.
const components = {
  '../toc': { ...(await import('../toc')) },
  '../anchor': { ...(await import('../anchor')) },
  '../question': { ...(await import('../question')) },
  '../code': { ...(await import('../code')) },
  '../trace': { ...(await import('../trace')) },
  '../print': { ...(await import('../print')) },
  '../slides': { ...(await import('../slides')) },
  '../tabs': { ...(await import('../tabs')) },
  '../highlight': { ...(await import('../highlight')) },
  '../appearance-picker': { ...(await import('../appearance-picker')) },
};
const componentMounts: string[] = [];
for (const component of Object.keys(components)) {
  mock.module(component, () => ({
    default: () => {
      componentMounts.push(component);
      return () => {};
    },
  }));
}

afterAll(() => {
  for (const [component, original] of Object.entries(components)) {
    mock.module(component, () => original);
  }
});

const { mountPerPageComponents, teardownPerPageComponents } =
  await import('./lifecycle');

function createWindow(): Window {
  const dom = new JSDOM(
    '<!doctype html><body><div class="container"></div></body>',
    { url: 'http://localhost/a.html' },
  );
  return dom.window as unknown as Window;
}

function showScript(window: Window, href: string): void {
  window.document.querySelector('.container')!.innerHTML =
    `<link rel="modulepreload" href="${href}" data-tada-script>`;
}

function waitForTasks(window: Window): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, 10));
}

beforeEach(() => {
  componentMounts.length = 0;
  imported.length = 0;
  pendingImport = Promise.resolve({});
  teardownPerPageComponents();
});

test("a page's scripts are not mounted by an earlier page's pending mount", async () => {
  const window = createWindow();
  showScript(window, '/_scripts/a.js');
  const first = mountPerPageComponents(window);

  // The visitor navigates on before the first page's components finish
  teardownPerPageComponents();
  showScript(window, '/_scripts/b.js');
  await waitForTasks(window);
  await first;
  await flushMicrotasks();

  expect(imported).toEqual([]);
});

test('waiting for mounts does not wait for author scripts', async () => {
  const window = createWindow();
  showScript(window, '/_scripts/slow.js');
  pendingImport = new Promise(() => {});

  const mounted = mountPerPageComponents(window);
  await waitForTasks(window);

  expect(
    await Promise.race([mounted.then(() => 'done'), waitForTasks(window)]),
  ).toBe('done');
  expect(imported).toEqual(['http://localhost/_scripts/slow.js']);
});

test("Tada's components do not mount after the visitor left the page", async () => {
  const window = createWindow();
  const first = mountPerPageComponents(window);
  teardownPerPageComponents();
  await waitForTasks(window);
  await first;

  // The appearance picker mounts right away, before the visitor can leave
  expect(componentMounts).toEqual(['../appearance-picker']);
});
