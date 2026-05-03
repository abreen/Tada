import { test, expect } from './test-fixtures';

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

  test('stored timezone, synced choosers, reset, and day suffixes work', async ({
    page,
  }) => {
    await page.goto('/timezones.html');

    const selects = page.locator('select.time-zone');
    await expect(selects).toHaveCount(2);
    await expect(selects.first()).toBeVisible();
    await expect(selects.first()).toHaveValue('America/New_York');
    await expect(selects.nth(1)).toHaveValue('America/New_York');

    await selects.first().selectOption('Pacific/Honolulu');
    await expect(selects.nth(1)).toHaveValue('Pacific/Honolulu');
    await expect(
      page.locator('time[datetime="01:30"] .next-prev-day'),
    ).toContainText('prev. day');
    expect(
      await page.evaluate(() => localStorage.getItem('timezoneSelection')),
    ).toBe('Pacific/Honolulu');

    await page.reload();
    await expect(selects.first()).toHaveValue('Pacific/Honolulu');
    await expect(
      page.locator('time[datetime="01:30"] .next-prev-day'),
    ).toContainText('prev. day');

    const resetButton = page
      .getByRole('button', { name: 'Reset time zone to ET (default)' })
      .first();
    await expect(resetButton).toBeVisible();
    await resetButton.click();
    await expect(selects.first()).toHaveValue('America/New_York');
    await expect(selects.nth(1)).toHaveValue('America/New_York');
    await expect(resetButton).toBeHidden();
    await expect(selects.first()).toBeFocused();
    await expect(page.locator('time[datetime="01:30"]')).not.toContainText(
      'prev. day',
    );
    expect(
      await page.evaluate(() => localStorage.getItem('timezoneSelection')),
    ).toBeNull();
  });

  test('timezone conversion preserves page period style when needed', async ({
    page,
  }) => {
    await page.goto('/timezones.html');

    const selects = page.locator('select.time-zone');

    await selects.first().selectOption('UTC');
    await expect(page.locator('time[datetime="11:30"]')).toContainText('PM');

    await selects.first().selectOption('America/Chicago');
    await expect(page.locator('time[datetime="17:40"]').nth(1)).toHaveText(
      '4:40',
    );

    await selects.first().selectOption('Asia/Tokyo');
    await expect(
      page.locator('time[datetime="23:30"] .next-prev-day'),
    ).toContainText('next day');
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
