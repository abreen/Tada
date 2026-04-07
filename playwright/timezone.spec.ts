import { test, expect } from '@playwright/test';

test.describe('timezone chooser without JS', () => {
  test('select is hidden and default timezone text shows', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/lectures/index.html');

    const select = page.locator('select.time-zone');
    await expect(select).toBeHidden();

    // Verify the noscript fallback text is in the page content
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toContain('Times shown in ET');

    await context.close();
  });
});

test.describe('timezone chooser', () => {
  test('changing timezone updates time text', async ({ page }) => {
    await page.goto('/lectures/index.html');

    const timeEl = page.locator('time[datetime="17:40"]');
    const originalText = await timeEl.textContent();
    expect(originalText).toContain('5:40');

    // Change to a different timezone (UTC is far enough from US Eastern to show a difference)
    const select = page.locator('select.time-zone');
    await select.selectOption('UTC');

    // The time text should have changed
    const newText = await timeEl.textContent();
    expect(newText).not.toBe(originalText);
  });

  test('changing timezone updates time text after SPA navigation', async ({
    page,
  }) => {
    await page.goto('/index.html');

    // Navigate to lectures via SPA using the header nav
    await page.locator('header details > summary').click();
    await page.evaluate(() => {
      const link = document.querySelector(
        'header details nav a[href="/lectures/index.html"]',
      ) as HTMLAnchorElement;
      link?.click();
    });
    await expect(page).toHaveURL(/lectures\/index\.html/);

    const timeEl = page.locator('time[datetime="17:40"]');
    const originalText = await timeEl.textContent();
    expect(originalText).toContain('5:40');

    // Change to a different timezone
    const select = page.locator('select.time-zone');
    await select.selectOption('UTC');

    // The time text should have changed
    const newText = await timeEl.textContent();
    expect(newText).not.toBe(originalText);
  });
});
