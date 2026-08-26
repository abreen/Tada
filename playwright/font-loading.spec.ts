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

async function holdFontRequests(page: Page, expectedFaces: readonly string[]) {
  const requestedFaces: string[] = [];
  const allFontRequests: string[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });

  await page.route('**/*.woff2', async route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    allFontRequests.push(pathname);
    const face = expectedFaces.find(expected => pathname.endsWith(expected));
    if (face) {
      requestedFaces.push(face);
      await held;
    }
    await route.continue();
  });

  return { allFontRequests, release, requestedFaces };
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
          (
            window as Window & { __fontChecksAtMutation?: boolean[] }
          ).__fontChecksAtMutation,
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
  const sans = page.getByRole('button', { name: 'Use sans-serif fonts' });
  const serif = page.getByRole('button', { name: 'Use serif fonts' });
  await recordChecksAtPreferenceMutation(page, [
    '400 16px "Tada Custom Serif"',
    '700 16px "Tada Custom Serif"',
    '400 16px "Tada Custom Serif Mono"',
  ]);
  await serif.click();

  await expectRequestedFaces(heldFonts.requestedFaces, SERIF_COMMON_FACES);
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  await expect(sans).toHaveAttribute('aria-pressed', 'true');
  await expect(serif).toHaveAttribute('aria-pressed', 'false');
  expect(await getBodyGeometry(page)).toEqual(initialGeometry);
  expect(
    await page.evaluate(() => localStorage.getItem('fontPreference')),
  ).toBeNull();

  heldFonts.release();
  await expect(page.locator('html')).toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  await expect(serif).toHaveAttribute('aria-pressed', 'true');
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
  const sans = page.getByRole('button', { name: 'Use sans-serif fonts' });
  const serif = page.getByRole('button', { name: 'Use serif fonts' });
  await recordChecksAtPreferenceMutation(page, [
    '400 16px "Inter"',
    '700 16px "Inter"',
    '400 16px "Google Sans Code"',
  ]);

  await sans.click();
  await expectRequestedFaces(heldFonts.requestedFaces, SANS_COMMON_FACES);
  await expect(page.locator('html')).toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  await expect(serif).toHaveAttribute('aria-pressed', 'true');
  await expect(sans).toHaveAttribute('aria-pressed', 'false');
  expect(await getBodyGeometry(page)).toEqual(initialGeometry);
  expect(
    await page.evaluate(() => localStorage.getItem('fontPreference')),
  ).toBeNull();

  heldFonts.release();
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  await expect(sans).toHaveAttribute('aria-pressed', 'true');
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
    page.getByRole('button', { name: 'Use sans-serif fonts' }),
  ).toHaveAttribute('aria-pressed', 'true');

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
    page.getByRole('button', { name: 'Use serif fonts' }),
  ).toHaveAttribute('aria-pressed', 'true');

  heldFonts.release();
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-font-preference',
    'serif',
  );
});

test('reuses repeated requests and cancels by selecting the applied face', async ({
  page,
}) => {
  const heldFonts = await holdFontRequests(page, SERIF_COMMON_FACES);
  await page.goto('/index.html');
  const sans = page.getByRole('button', { name: 'Use sans-serif fonts' });
  const serif = page.getByRole('button', { name: 'Use serif fonts' });

  await serif.click();
  await serif.click();
  await expectRequestedFaces(heldFonts.requestedFaces, SERIF_COMMON_FACES);
  expect(heldFonts.requestedFaces).toHaveLength(SERIF_COMMON_FACES.length);

  await sans.click();
  heldFonts.release();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  await expect(sans).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(() => localStorage.getItem('fontPreference')),
  ).toBeNull();
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

    const sans = page.getByRole('button', { name: 'Use sans-serif fonts' });
    const serif = page.getByRole('button', { name: 'Use serif fonts' });
    await serif.click();
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
    await expect(sans).toHaveAttribute('aria-pressed', 'true');
    await expect(serif).toHaveAttribute('aria-pressed', 'false');
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
    (
      window as Window & { __restoreFontLoad?: () => void }
    ).__restoreFontLoad = () => {
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
              __tadaFontPreferenceLoader?: {
                failedPreference: string | null;
              };
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
  await page.getByRole('button', { name: 'Use serif fonts' }).click();
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
  await page.getByRole('button', { name: 'Use serif fonts' }).click();

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
  await page.getByRole('button', { name: 'Use serif fonts' }).click();
  await expectRequestedFaces(heldFonts.requestedFaces, SERIF_COMMON_FACES);

  await page.locator('main.body a[href="/markdown.html"]').click();
  await expect(page).toHaveURL(/markdown\.html/);
  await expect(
    page.getByRole('button', { name: 'Use sans-serif fonts' }),
  ).toHaveAttribute('aria-pressed', 'true');

  heldFonts.release();
  await expect(page.locator('html')).toHaveAttribute(
    'data-font-preference',
    'serif',
  );
  await expect(
    page.getByRole('button', { name: 'Use serif fonts' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(() => localStorage.getItem('fontPreference')),
  ).toBe('serif');
});
