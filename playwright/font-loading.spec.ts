import { expect, test, type Page } from './test-fixtures';

const SERIF_COMMON_FACES = [
  '/custom-fonts/body-regular.woff2',
  '/custom-fonts/body-bold.woff2',
  '/custom-fonts/mono-regular.woff2',
];
const SANS_COMMON_FACES = [
  '/inter/InterVariable.woff2',
  '/google-sans-code/GoogleSansCodeVariable.woff2',
];

const DIAGNOSTIC_TITLES = new Set([
  'switches to custom serif only after its common faces are ready',
  'commits a pending request into controls mounted by client navigation',
]);
type FontDiagnosticEvent = Record<string, unknown> & {
  event: string;
  at: number;
};
type FontDiagnosticWindow = Window & {
  __ciFontEvents?: FontDiagnosticEvent[];
  __ciFontDocument?: number;
  __tadaFontPreferenceLoader?: {
    supported: boolean;
    generation: number;
    pending: { generation: number; preference: string } | null;
    failedPreference: string | null;
  };
};
const hostFontEvents = new WeakMap<Page, FontDiagnosticEvent[]>();

function recordHostFontEvent(
  page: Page,
  event: string,
  details: Record<string, unknown> = {},
) {
  hostFontEvents.get(page)?.push({ event, at: Date.now(), ...details });
}

test.beforeEach(async ({ page }, testInfo) => {
  if (!DIAGNOSTIC_TITLES.has(testInfo.title)) {
    return;
  }
  hostFontEvents.set(page, []);
  page.on('console', message => {
    if (message.text().startsWith('TADA_FONT_DOCUMENT:')) {
      recordHostFontEvent(page, 'document-start', { marker: message.text() });
    }
  });
  page.on('requestfinished', request => {
    if (request.url().endsWith('.woff2')) {
      recordHostFontEvent(page, 'requestfinished', { url: request.url() });
    }
  });
  page.on('requestfailed', request => {
    if (request.url().endsWith('.woff2')) {
      recordHostFontEvent(page, 'requestfailed', {
        url: request.url(),
        failure: request.failure(),
      });
    }
  });
  page.on('response', response => {
    if (response.url().endsWith('.woff2')) {
      recordHostFontEvent(page, 'response', {
        url: response.url(),
        status: response.status(),
      });
    }
  });
  await page.addInitScript(() => {
    const diagnosticWindow = window as FontDiagnosticWindow;
    diagnosticWindow.__ciFontEvents = [];
    diagnosticWindow.__ciFontDocument = performance.timeOrigin;
    console.debug(`TADA_FONT_DOCUMENT:${performance.timeOrigin}`);
    const record = (event: string, details: Record<string, unknown> = {}) => {
      // Diagnostic failures must not affect native promise settlement.
      try {
        diagnosticWindow.__ciFontEvents!.push({
          event,
          at: performance.timeOrigin + performance.now(),
          ...details,
        });
      } catch {}
    };
    const observeRoot = () => {
      new MutationObserver(mutations => {
        for (const mutation of mutations) {
          record('root-font-preference', {
            oldValue: mutation.oldValue,
            applied: document.documentElement.dataset.fontPreference ?? null,
          });
        }
      }).observe(document.documentElement, {
        attributeFilter: ['data-font-preference'],
        attributeOldValue: true,
      });
    };
    if (document.documentElement) {
      observeRoot();
    } else {
      document.addEventListener('DOMContentLoaded', observeRoot, {
        once: true,
      });
    }
    if (typeof document.fonts?.load !== 'function') {
      record('font-api-unavailable');
      return;
    }
    const fonts = document.fonts;
    const originalLoad = fonts.load.bind(fonts);
    let loadId = 0;
    Object.defineProperty(fonts, 'load', {
      configurable: true,
      value: (font: string, text?: string) => {
        const id = ++loadId;
        record('native-load-start', { id, font, text });
        let promise: Promise<FontFace[]>;
        try {
          promise = originalLoad(font, text);
        } catch (error) {
          record('native-load-throw', { id, error: String(error) });
          throw error;
        }
        void promise
          .then(
            faces =>
              record('native-load-resolved', {
                id,
                count: faces.length,
                faces: faces.map(face => ({
                  family: face.family,
                  style: face.style,
                  weight: face.weight,
                  status: face.status,
                })),
              }),
            error =>
              record('native-load-rejected', { id, error: String(error) }),
          )
          .catch(() => {});
        return promise;
      },
    });
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (!DIAGNOSTIC_TITLES.has(testInfo.title)) {
    return;
  }
  const browser = await page
    .evaluate(() => {
      const diagnosticWindow = window as FontDiagnosticWindow;
      const loader = diagnosticWindow.__tadaFontPreferenceLoader;
      return {
        at: performance.timeOrigin + performance.now(),
        url: location.href,
        marker: diagnosticWindow.__ciFontDocument,
        events: diagnosticWindow.__ciFontEvents,
        fontStatus: document.fonts.status,
        rootAttributes: Array.from(
          document.documentElement.attributes,
          attribute => [attribute.name, attribute.value],
        ),
        stored: localStorage.getItem('fontPreference'),
        controls: Array.from(
          document.querySelectorAll<HTMLButtonElement>(
            '[data-font-preference-switch]',
          ),
          control => ({
            checked: control.getAttribute('aria-checked'),
            disabled: control.disabled,
          }),
        ),
        loader: loader
          ? {
              supported: loader.supported,
              generation: loader.generation,
              pending: loader.pending
                ? {
                    generation: loader.pending.generation,
                    preference: loader.pending.preference,
                  }
                : null,
              failedPreference: loader.failedPreference,
            }
          : null,
      };
    })
    .catch(error => ({ evaluationError: String(error) }));
  console.log(
    'TADA_FONT_DIAGNOSTIC',
    JSON.stringify({
      title: testInfo.title,
      project: testInfo.project.name,
      status: testInfo.status,
      clock: {
        host: 'Date.now Unix milliseconds',
        browser: 'performance.timeOrigin + performance.now Unix milliseconds',
      },
      host: hostFontEvents.get(page),
      browser,
    }),
  );
  hostFontEvents.delete(page);
});

async function holdFontRequests(page: Page, expectedFaces: readonly string[]) {
  const requestedFaces: string[] = [];
  const allFontRequests: string[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });

  await page.route('**/*.woff2', async route => {
    const pathname = decodeURIComponent(
      new URL(route.request().url()).pathname,
    );
    allFontRequests.push(pathname);
    const requestId = allFontRequests.length;
    recordHostFontEvent(page, 'route-start', { requestId, pathname });
    const face = expectedFaces.find(expected => pathname.endsWith(expected));
    if (face) {
      requestedFaces.push(face);
      recordHostFontEvent(page, 'route-held', { requestId, pathname });
      await held;
      recordHostFontEvent(page, 'route-released', { requestId, pathname });
    }
    recordHostFontEvent(page, 'continue-start', { requestId, pathname });
    try {
      await route.continue();
      recordHostFontEvent(page, 'continue-completed', { requestId, pathname });
    } catch (error) {
      recordHostFontEvent(page, 'continue-error', {
        requestId,
        pathname,
        error: String(error),
      });
      throw error;
    }
  });

  return {
    allFontRequests,
    release: () => {
      recordHostFontEvent(page, 'barrier-release');
      release();
    },
    requestedFaces,
  };
}

async function expectRequestedFaces(
  requestedFaces: readonly string[],
  expectedFaces: readonly string[],
) {
  await expect
    .poll(() => [...new Set(requestedFaces)].toSorted())
    .toEqual(expectedFaces.toSorted());
}

async function getBodyGeometry(page: Page) {
  return page.locator('main.body').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      fontFamily: getComputedStyle(element).fontFamily,
      height: rect.height,
      width: rect.width,
    };
  });
}

async function recordChecksAtPreferenceMutation(
  page: Page,
  checks: readonly string[],
) {
  await page.evaluate(checksToRun => {
    const observer = new MutationObserver(records => {
      if (
        records.some(record => record.attributeName === 'data-font-preference')
      ) {
        (
          window as Window & { __fontChecksAtMutation?: boolean[] }
        ).__fontChecksAtMutation = checksToRun.map(font =>
          document.fonts.check(font),
        );
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, {
      attributeFilter: ['data-font-preference'],
    });
  }, checks);
}

async function expectChecksAtMutation(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __fontChecksAtMutation?: boolean[] })
            .__fontChecksAtMutation,
      ),
    )
    .toEqual([true, true, true]);
}

test('switches to custom serif only after its common faces are ready', async ({
  page,
}) => {
  const heldFonts = await holdFontRequests(page, SERIF_COMMON_FACES);
  await page.goto('/index.html');

  const initialGeometry = await getBodyGeometry(page);
  const fontSwitch = page.getByRole('switch', { name: 'Use serif fonts' });
  await recordChecksAtPreferenceMutation(page, [
    '400 16px "Tada Custom Serif"',
    '700 16px "Tada Custom Serif"',
    '400 16px "Tada Custom Serif Mono"',
  ]);
  await fontSwitch.click();

  await expectRequestedFaces(heldFonts.requestedFaces, SERIF_COMMON_FACES);
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  await expect(fontSwitch).toHaveAttribute('aria-checked', 'false');
  expect(await getBodyGeometry(page)).toEqual(initialGeometry);
  expect(
    await page.evaluate(() => localStorage.getItem('fontPreference')),
  ).toBeNull();

  heldFonts.release();
  await expect(page.locator('html')).toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  await expect(fontSwitch).toHaveAttribute('aria-checked', 'true');
  expect(
    await page.evaluate(() => localStorage.getItem('fontPreference')),
  ).toBe('serif');
  await expectChecksAtMutation(page);
  expect(
    heldFonts.allFontRequests.filter(pathname =>
      pathname.includes('/custom-fonts/'),
    ),
  ).toEqual(SERIF_COMMON_FACES);
});

test('switches from custom serif to bundled sans atomically', async ({
  page,
}) => {
  const heldFonts = await holdFontRequests(page, SANS_COMMON_FACES);
  await page.goto('http://localhost:8082/custom/index.html');
  const initialGeometry = await getBodyGeometry(page);
  const fontSwitch = page.getByRole('switch', { name: 'Use serif fonts' });
  await recordChecksAtPreferenceMutation(page, [
    '400 16px "Inter"',
    '700 16px "Inter"',
    '400 16px "Google Sans Code"',
  ]);

  await fontSwitch.click();
  await expectRequestedFaces(heldFonts.requestedFaces, SANS_COMMON_FACES);
  await expect(page.locator('html')).toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  await expect(fontSwitch).toHaveAttribute('aria-checked', 'true');
  expect(await getBodyGeometry(page)).toEqual(initialGeometry);
  expect(
    await page.evaluate(() => localStorage.getItem('fontPreference')),
  ).toBeNull();

  heldFonts.release();
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  await expect(fontSwitch).toHaveAttribute('aria-checked', 'false');
  expect(
    await page.evaluate(() => localStorage.getItem('fontPreference')),
  ).toBe('sans');
  await expectChecksAtMutation(page);
});

test('keeps the configured font during a stored-preference hard load', async ({
  page,
}) => {
  const heldFonts = await holdFontRequests(page, SERIF_COMMON_FACES);
  await page.addInitScript(() => {
    localStorage.setItem('fontPreference', 'serif');
  });

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expectRequestedFaces(heldFonts.requestedFaces, SERIF_COMMON_FACES);
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  await expect(
    page.getByRole('switch', { name: 'Use serif fonts' }),
  ).toHaveAttribute('aria-checked', 'false');

  heldFonts.release();
  await expect(page.locator('html')).toHaveAttribute(
    'data-font-preference',
    'serif',
  );
});

test('keeps a stored bundled-sans override pending on a serif-default load', async ({
  page,
}) => {
  const heldFonts = await holdFontRequests(page, SANS_COMMON_FACES);
  await page.addInitScript(() => {
    localStorage.setItem('fontPreference', 'sans');
  });

  await page.goto('http://localhost:8082/custom/index.html', {
    waitUntil: 'domcontentloaded',
  });
  await expectRequestedFaces(heldFonts.requestedFaces, SANS_COMMON_FACES);
  await expect(page.locator('html')).toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  await expect(
    page.getByRole('switch', { name: 'Use serif fonts' }),
  ).toHaveAttribute('aria-checked', 'true');

  heldFonts.release();
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-font-preference',
    'serif',
  );
});

test('cancels a pending request on second switch activation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const fonts = document.fonts;
    const originalLoad = fonts.load.bind(fonts);
    const loads: Promise<FontFace[]>[] = [];
    (window as Window & { __fontLoads?: Promise<FontFace[]>[] }).__fontLoads =
      loads;
    Object.defineProperty(fonts, 'load', {
      configurable: true,
      value: (font: string, text?: string) => {
        const promise = originalLoad(font, text);
        loads.push(promise);
        return promise;
      },
    });
  });
  const heldFonts = await holdFontRequests(page, SERIF_COMMON_FACES);
  let releaseUnrelated!: () => void;
  const unrelated = new Promise<void>(resolve => {
    releaseUnrelated = resolve;
  });
  let unrelatedRequested = false;
  let unrelatedCompleted = false;
  await page.route('**/held-cancellation-resource', async route => {
    unrelatedRequested = true;
    await unrelated;
    await route.fulfill({ body: 'unrelated response' });
    unrelatedCompleted = true;
  });
  try {
    await page.goto('/index.html');
    await page.evaluate(() => {
      void fetch('/held-cancellation-resource');
    });
    await expect.poll(() => unrelatedRequested).toBe(true);
    const fontSwitch = page.getByRole('switch', { name: 'Use serif fonts' });

    await fontSwitch.click();
    await expectRequestedFaces(heldFonts.requestedFaces, SERIF_COMMON_FACES);
    expect(heldFonts.requestedFaces).toHaveLength(SERIF_COMMON_FACES.length);

    await fontSwitch.click();
    heldFonts.release();
    const completedFaces = await page.evaluate(async () => {
      const loads = (window as Window & { __fontLoads?: Promise<FontFace[]>[] })
        .__fontLoads!;
      const faces = await Promise.all(loads);
      // Allow the application's completion reactions to run before checking state.
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve()),
      );
      return faces.map(matches => matches.length);
    });
    expect(completedFaces).toHaveLength(SERIF_COMMON_FACES.length);
    expect(completedFaces.every(count => count > 0)).toBe(true);
    expect(unrelatedCompleted).toBe(false);
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-font-preference',
      'serif',
    );
    await expect(fontSwitch).toHaveAttribute('aria-checked', 'false');
    expect(
      await page.evaluate(() => localStorage.getItem('fontPreference')),
    ).toBeNull();
  } finally {
    heldFonts.release();
    releaseUnrelated();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

for (const failure of ['rejection', 'empty match'] as const) {
  test(`keeps click state unchanged after a font-load ${failure}`, async ({
    page,
  }) => {
    await page.addInitScript(failureMode => {
      Object.defineProperty(document.fonts, 'load', {
        configurable: true,
        value:
          failureMode === 'rejection'
            ? () => Promise.reject(new Error('font request failed'))
            : () => Promise.resolve([]),
      });
    }, failure);
    await page.goto('/index.html');

    const fontSwitch = page.getByRole('switch', { name: 'Use serif fonts' });
    await fontSwitch.click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as Window & {
                __tadaFontPreferenceLoader?: {
                  failedPreference: string | null;
                };
              }
            ).__tadaFontPreferenceLoader?.failedPreference,
        ),
      )
      .toBe('serif');
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-font-preference',
      'serif',
    );
    await expect(fontSwitch).toHaveAttribute('aria-checked', 'false');
    expect(
      await page.evaluate(() => localStorage.getItem('fontPreference')),
    ).toBeNull();
  });
}

test('retains a failed stored override for a later retry', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fontPreference', 'serif');
    const fonts = document.fonts;
    const originalLoad = fonts.load.bind(fonts);
    (window as Window & { __restoreFontLoad?: () => void }).__restoreFontLoad =
      () => {
        Object.defineProperty(fonts, 'load', {
          configurable: true,
          value: originalLoad,
        });
      };
    Object.defineProperty(fonts, 'load', {
      configurable: true,
      value: () => Promise.reject(new Error('font request failed')),
    });
  });
  await page.goto('/index.html');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __tadaFontPreferenceLoader?: { failedPreference: string | null };
            }
          ).__tadaFontPreferenceLoader?.failedPreference,
      ),
    )
    .toBe('serif');
  expect(
    await page.evaluate(() => localStorage.getItem('fontPreference')),
  ).toBe('serif');
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-font-preference',
    'serif',
  );

  await page.evaluate(() => {
    (
      window as Window & { __restoreFontLoad?: () => void }
    ).__restoreFontLoad?.();
  });
  await page.getByRole('switch', { name: 'Use serif fonts' }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-font-preference',
    'serif',
  );
});

test('falls back to immediate switching without the Font Loading API', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document.fonts, 'load', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto('/index.html');
  await page.getByRole('switch', { name: 'Use serif fonts' }).click();

  await expect(page.locator('html')).toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  expect(
    await page.evaluate(() => localStorage.getItem('fontPreference')),
  ).toBe('serif');
});

test('commits a pending request into controls mounted by client navigation', async ({
  page,
}) => {
  const heldFonts = await holdFontRequests(page, SERIF_COMMON_FACES);
  await page.goto('/index.html');
  await page.getByRole('switch', { name: 'Use serif fonts' }).click();
  await expectRequestedFaces(heldFonts.requestedFaces, SERIF_COMMON_FACES);

  await page.locator('main.body a[href="/markdown.html"]').click();
  await expect(page).toHaveURL(/markdown\.html/);
  await expect(
    page.getByRole('switch', { name: 'Use serif fonts' }),
  ).toHaveAttribute('aria-checked', 'false');

  heldFonts.release();
  await expect(page.locator('html')).toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  await expect(
    page.getByRole('switch', { name: 'Use serif fonts' }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(
    await page.evaluate(() => localStorage.getItem('fontPreference')),
  ).toBe('serif');
});
