import { test, expect, type Page } from '@playwright/test';

type WindowWithNavMarker = Window & { __navMarker?: string };

async function setNavMarker(page: Page) {
  await page.evaluate(() => {
    (window as WindowWithNavMarker).__navMarker = 'alive';
  });
}

async function getNavMarker(page: Page) {
  return page.evaluate(() => (window as WindowWithNavMarker).__navMarker);
}

test.describe('graceful degradation without JS', () => {
  test('links work with JavaScript disabled', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/index.html');
    await expect(page.locator('h1')).toContainText('Home');

    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);
    await expect(page.locator('h1')).toContainText('Markdown Examples');

    await context.close();
  });
});

test.describe('client-side navigation', () => {
  test('clicking an internal link navigates without full reload', async ({
    page,
  }) => {
    await page.goto('/index.html');
    await setNavMarker(page);

    // Click the Markdown examples link in the page body
    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);
    await expect(page.locator('h1')).toContainText('Markdown Examples');

    const marker = await getNavMarker(page);
    expect(marker).toBe('alive');
  });

  test('document title updates after navigation', async ({ page }) => {
    await page.goto('/index.html');
    const homeTitle = await page.title();

    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);

    const newTitle = await page.title();
    expect(newTitle).not.toBe(homeTitle);
    expect(newTitle).toContain('Markdown');
  });

  test('external links in body have target=_blank', async ({ page }) => {
    await page.goto('/markdown.html');
    const externalLink = page.locator('main.body a.external').first();
    await expect(externalLink).toHaveAttribute('target', '_blank');
    await expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('ctrl+click does not trigger client-side navigation', async ({
    page,
  }) => {
    await page.goto('/index.html');
    const homeUrl = page.url();

    const navLink = page.locator('main.body a[href="/markdown.html"]');
    await navLink.click({ modifiers: ['ControlOrMeta'] });

    expect(page.url()).toBe(homeUrl);
  });

  test('header details closes on navigation', async ({ page }) => {
    await page.goto('/index.html');

    // Open the header details
    await page.locator('header details > summary').click();
    await expect(page.locator('header details')).toHaveAttribute('open', '');

    // Click a nav link inside the opened details using JS to avoid visibility issues
    await page.evaluate(() => {
      const link = document.querySelector(
        'header details nav a[href="/lectures/index.html"]',
      ) as HTMLAnchorElement;
      link?.click();
    });
    await expect(page).toHaveURL(/lectures\/index\.html/);

    const isOpen = await page.evaluate(
      () =>
        (document.querySelector('header details') as HTMLDetailsElement)?.open,
    );
    expect(isOpen).toBe(false);
  });

  test('header details closes when clicking link to current page', async ({
    page,
  }) => {
    await page.goto('/lectures/index.html');

    // Open the header details
    await page.locator('header details > summary').click();
    await expect(page.locator('header details')).toHaveAttribute('open', '');

    // Click the nav link for the current page
    await page.evaluate(() => {
      const link = document.querySelector(
        'header details nav a[href="/lectures/index.html"]',
      ) as HTMLAnchorElement;
      link?.click();
    });

    const isOpen = await page.evaluate(
      () =>
        (document.querySelector('header details') as HTMLDetailsElement)?.open,
    );
    expect(isOpen).toBe(false);
  });

  test('search input clears on navigation', async ({ page }) => {
    await page.goto('/index.html');

    // Focus and type into the search input using evaluate (it may be hidden)
    await page.evaluate(() => {
      const input = document.querySelector(
        'input[name="quick-search"]',
      ) as HTMLInputElement;
      input.value = 'test query';
    });

    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);

    const value = await page.evaluate(() => {
      const input = document.querySelector(
        'input[name="quick-search"]',
      ) as HTMLInputElement;
      return input?.value ?? '';
    });
    expect(value).toBe('');
  });

  test('search results disappear after clicking a search result link', async ({
    page,
  }) => {
    await page.goto('/index.html');
    await setNavMarker(page);

    // Type a search query
    const searchInput = page.locator('input[name="quick-search"]');
    await searchInput.focus();
    await searchInput.fill('markdown');

    // Wait for search results to appear
    const results = page.locator('.results-container .results a');
    await expect(results.first()).toBeVisible({ timeout: 5000 });

    // Click the first search result
    await results.first().click();

    // Should have navigated
    await expect(page).not.toHaveURL(/index\.html/);

    // Search input should be cleared
    const value = await page.evaluate(() => {
      const input = document.querySelector(
        'input[name="quick-search"]',
      ) as HTMLInputElement;
      return input?.value ?? '';
    });
    expect(value).toBe('');

    const resultsContainer = page.locator('.results-container');
    await expect(resultsContainer).toHaveAttribute('aria-hidden', 'true');
    await expect(resultsContainer).toHaveAttribute('inert', '');
    await expect(searchInput).toHaveAttribute('aria-expanded', 'false');

    // Should be SPA navigation (no full reload)
    const marker = await getNavMarker(page);
    expect(marker).toBe('alive');
  });

  test('search results disappear after clicking result for current page', async ({
    page,
  }) => {
    await page.goto('/markdown.html', { waitUntil: 'networkidle' });

    // Search for something that will match this page
    const searchInput = page.locator('input[name="quick-search"]');
    await searchInput.focus();
    await searchInput.fill('markdown');

    // Wait for search results to appear
    const results = page.locator('.results-container .results a');
    await expect(results.first()).toBeVisible({ timeout: 10000 });

    // Find and click a result that links to the current page
    const currentPageResult = page.locator(
      '.results-container .results a[href="/markdown.html"]',
    );
    // Fall back to first result if exact match not found
    const target =
      (await currentPageResult.count()) > 0
        ? currentPageResult.first()
        : results.first();
    await target.click();

    // Results should be dismissed
    const resultsContainer = page.locator('.results-container');
    await expect(resultsContainer).toHaveAttribute('aria-hidden', 'true');
    await expect(resultsContainer).toHaveAttribute('inert', '');
    await expect(searchInput).toHaveAttribute('aria-expanded', 'false');

    // Search input should be cleared
    const value = await page.evaluate(() => {
      const input = document.querySelector(
        'input[name="quick-search"]',
      ) as HTMLInputElement;
      return input?.value ?? '';
    });
    expect(value).toBe('');
  });

  test('search results disappear after clicking result for heading on current page', async ({
    page,
  }) => {
    await page.goto('/markdown.html', { waitUntil: 'networkidle' });

    // Search for a heading on this page
    const searchInput = page.locator('input[name="quick-search"]');
    await searchInput.focus();
    await searchInput.fill('markdown');

    // Wait for search results with hash links (sub-results point to headings)
    const results = page.locator('.results-container .results a');
    await expect(results.first()).toBeVisible({ timeout: 10000 });

    // Find a result with a hash (heading anchor)
    const hashResult = page.locator(
      '.results-container .results a[href*="/markdown.html#"]',
    );
    if ((await hashResult.count()) > 0) {
      await hashResult.first().click();
    } else {
      // Click any result to verify dismissal
      await results.first().click();
    }

    // Results should be dismissed
    const resultsContainer = page.locator('.results-container');
    await expect(resultsContainer).toHaveAttribute('aria-hidden', 'true');
    await expect(resultsContainer).toHaveAttribute('inert', '');
    await expect(searchInput).toHaveAttribute('aria-expanded', 'false');

    // Search input should be cleared
    const value = await page.evaluate(() => {
      const input = document.querySelector(
        'input[name="quick-search"]',
      ) as HTMLInputElement;
      return input?.value ?? '';
    });
    expect(value).toBe('');
  });
});
