import { test, expect } from './test-fixtures';

// The starter content's Lectures page loads public/timezone.js, an example of
// author JavaScript
test.describe('starter time zone example', () => {
  test('without JS, the chooser stays hidden and authored times show', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/lectures/index.html');

    await expect(page.getByLabel('Show times in')).toBeHidden();
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
});
