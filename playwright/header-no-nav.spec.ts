import { test, expect, type Page } from './test-fixtures';

const SEARCH_SITE = 'http://localhost:8083';
const STATIC_SITE = 'http://localhost:8084';

async function scrollToBottom(page: Page) {
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight }),
  );
}

// Let scroll and intersection updates for the current position run
async function waitForFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

async function expectNoMenu(page: Page) {
  await expect(page.locator('header details')).toHaveCount(0);
  await expect(page.locator('header .menu-icon')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Toggle site navigation' }),
  ).toHaveCount(0);
}

test.describe('header without a nav, with search', () => {
  test('shows the site title and search without a menu', async ({ page }) => {
    await page.goto(`${SEARCH_SITE}/index.html`);

    await expectNoMenu(page);
    await expect(page.locator('header .site-title')).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search' })).toBeVisible();
  });

  test('stays at the top and shows the page title after scrolling', async ({
    page,
  }) => {
    await page.goto(`${SEARCH_SITE}/index.html`);
    // Components mount in order; the back-to-top link mounts after the header
    await expect(page.locator('#to-top-container a')).toHaveCount(1);

    await scrollToBottom(page);

    const header = page.locator('header');
    await expect(header).toBeInViewport();
    expect((await header.boundingBox())!.y).toBe(0);
    await expect(page.locator('header .header-title')).toHaveClass(
      /\bis-page-title\b/,
    );
    await expect(
      page.locator('header a', { hasText: 'Back to top' }),
    ).toBeVisible();
  });
});

test.describe('header without a nav or search', () => {
  test('shows only the site title', async ({ page }) => {
    await page.goto(`${STATIC_SITE}/index.html`);

    await expectNoMenu(page);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.locator('header .site-title')).toBeVisible();
    await expect(page.locator('header .header-page-title')).toHaveCount(0);
  });

  test('scrolls away with the page and has no back-to-top link', async ({
    page,
  }) => {
    await page.goto(`${STATIC_SITE}/index.html`);

    await scrollToBottom(page);
    await waitForFrames(page);

    await expect(page.locator('header')).not.toBeInViewport();
    await expect(page.getByRole('link', { name: 'Back to top' })).toHaveCount(
      0,
    );
  });

  test('puts a fragment target at the top of the viewport', async ({
    page,
  }) => {
    await page.goto(`${STATIC_SITE}/index.html#target`);
    await waitForFrames(page);

    // No space is reserved for a fixed header that is not there
    const top = await page
      .locator('#target')
      .evaluate(el => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(40);
  });
});

for (const [mode, site] of [
  ['with search', SEARCH_SITE],
  ['without search', STATIC_SITE],
] as const) {
  test(`the logo and site title link to the home page ${mode}`, async ({
    page,
  }) => {
    await page.goto(`${site}/other.html`);

    const homeLink = page
      .getByRole('banner')
      .getByRole('link', { name: 'Tada', exact: true });
    await expect(homeLink).toHaveAttribute('href', '/index.html');
    await homeLink.click();

    await expect(page).toHaveURL(`${site}/index.html`);
    await expect(
      page.getByRole('heading', { name: 'Long Page' }),
    ).toBeVisible();
  });
}
