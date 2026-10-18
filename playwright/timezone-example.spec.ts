import { test, expect } from './test-fixtures';

// The starter content's Lectures page lists src/lectures/timezone.ts in its
// front matter, an example of a script compiled with the site. Its renderer,
// src/lectures/timezone.render.ts, writes the chooser at build time.
test.describe('starter time zone example', () => {
  test('without JS, the chooser shows the default zone, disabled', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/lectures/index.html');

    const select = page.getByLabel('Show times in');
    await expect(select).toBeVisible();
    await expect(select).toBeDisabled();
    await expect(select).toHaveValue('America/New_York');
    await expect(page.locator('time[datetime="17:40"]')).toHaveText('5:40 PM');
    expect(await page.locator('body').innerText()).toContain(
      'Times shown in ET',
    );

    await context.close();
  });

  test('converts times and keeps the choice after client-side navigation', async ({
    page,
  }) => {
    await page.goto('/index.html');
    await page.locator('header details > summary').click();
    await page
      .locator('header details nav a[href="/lectures/index.html"]')
      .click();
    await expect(page).toHaveURL(/lectures\/index\.html/);

    const select = page.getByLabel('Show times in');
    const time = page.locator('time[datetime="17:40"]');
    await expect(select).toBeEnabled();

    await select.selectOption('UTC');
    await expect(time).toContainText('UTC');
    await expect(time).toHaveAttribute('title', /^5:40 PM /);

    await page.reload();
    await expect(page.getByLabel('Show times in')).toHaveValue('UTC');
    await expect(time).toContainText('UTC');

    await page.getByLabel('Show times in').selectOption('America/New_York');
    await expect(time).toHaveText('5:40 PM');
    await expect(time).not.toHaveAttribute('title');
  });

  test('the chooser still works after navigating away and back', async ({
    page,
  }) => {
    await page.goto('/lectures/index.html');
    const time = page.locator('time[datetime="17:40"]');

    await page.locator('header details > summary').click();
    await page.locator('header details nav a[href="/index.html"]').click();
    await expect(page).toHaveURL(/\/index\.html$/);
    await page.locator('header details > summary').click();
    await page
      .locator('header details nav a[href="/lectures/index.html"]')
      .click();
    await expect(page).toHaveURL(/lectures\/index\.html/);

    const select = page.getByLabel('Show times in');
    await expect(select).toBeEnabled();
    await select.selectOption('UTC');
    await expect(time).toContainText('UTC');
  });
});
