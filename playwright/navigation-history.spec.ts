import { test, expect } from './test-fixtures';

// Helper to navigate via JS click (avoids visibility/details issues)
async function clickLink(page: any, href: string) {
  await page.evaluate((h: string) => {
    const link = document.querySelector(`a[href="${h}"]`) as HTMLAnchorElement;
    if (link) {
      link.click();
    }
  }, href);
}

test.describe('history navigation', () => {
  test('back button returns to previous page', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
      (window as any).__navMarker = 'alive';
    });

    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);

    await page.goBack();
    await expect(page).toHaveURL(/index\.html/);
    await expect(page.locator('h1')).toContainText('Home');

    const marker = await page.evaluate(() => (window as any).__navMarker);
    expect(marker).toBe('alive');
  });

  test('forward button works after going back', async ({ page }) => {
    await page.goto('/index.html');

    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);

    await page.goBack();
    await expect(page).toHaveURL(/index\.html/);

    await page.goForward();
    await expect(page).toHaveURL(/markdown\.html/);
    await expect(page.locator('h1')).toContainText('Markdown Examples');
  });

  test('multiple back/forward navigations work', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
      (window as any).__navMarker = 'alive';
    });

    // home -> markdown (body link)
    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);

    // markdown -> lectures (use JS click since link may be in nav)
    await clickLink(page, '/lectures/index.html');
    await expect(page).toHaveURL(/lectures\/index\.html/);

    // back to markdown
    await page.goBack();
    await expect(page).toHaveURL(/markdown\.html/);

    // back to home
    await page.goBack();
    await expect(page).toHaveURL(/index\.html/);

    // forward to markdown
    await page.goForward();
    await expect(page).toHaveURL(/markdown\.html/);

    const marker = await page.evaluate(() => (window as any).__navMarker);
    expect(marker).toBe('alive');
  });

  test('scroll position restored on back navigation', async ({ page }) => {
    await page.goto('/markdown.html');

    // Scroll down
    await page.evaluate(() => window.scrollTo({ top: 500 }));
    await page.waitForTimeout(100);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(400);

    // Navigate away using JS click
    await clickLink(page, '/index.html');
    await expect(page).toHaveURL(/index\.html/);

    // Go back
    await page.goBack();
    await expect(page).toHaveURL(/markdown\.html/);

    // Wait for scroll restoration
    await page.waitForTimeout(500);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBeGreaterThan(300);
  });

  test('scroll position restored on forward navigation', async ({ page }) => {
    await page.goto('/index.html');

    // Navigate to markdown via SPA click
    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);

    // Scroll down on markdown
    await page.evaluate(() => window.scrollTo({ top: 500 }));
    await page.waitForTimeout(100);

    // Go back to index
    await page.goBack();
    await expect(page).toHaveURL(/index\.html/);

    // Go forward to markdown
    await page.goForward();
    await expect(page).toHaveURL(/markdown\.html/);

    // Scroll should be restored to where the user was
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 2000 })
      .toBeGreaterThan(300);
  });
});
