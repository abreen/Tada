import { test, expect } from '@playwright/test';

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
    await page.evaluate(() => {
      (window as any).__navMarker = 'alive';
    });

    // Click the Markdown examples link in the page body
    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);
    await expect(page.locator('h1')).toContainText('Markdown Examples');

    const marker = await page.evaluate(() => (window as any).__navMarker);
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
    await page.evaluate(() => {
      (window as any).__navMarker = 'alive';
    });

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

    // Results container must not have is-showing class
    const resultsContainer = page.locator('.results-container');
    await expect(resultsContainer).not.toHaveClass(/is-showing/);

    // Should be SPA navigation (no full reload)
    const marker = await page.evaluate(() => (window as any).__navMarker);
    expect(marker).toBe('alive');
  });

  test('header shimmer appears on slow connections', async ({ page }) => {
    await page.goto('/index.html');

    // Throttle network after the page is fully loaded
    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (10 * 1024) / 8,
      uploadThroughput: (10 * 1024) / 8,
      latency: 2000,
    });

    await page.locator('main.body a[href="/markdown.html"]').click();

    // The header should get the loading class while fetching
    await expect(page.locator('header.loading')).toBeVisible({ timeout: 5000 });

    // Remove throttling so the fetch can complete
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });

    // After navigation completes, the class should be removed
    await expect(page).toHaveURL(/markdown\.html/, { timeout: 15000 });
    await expect(page.locator('header')).not.toHaveClass(/loading/);
  });
});
