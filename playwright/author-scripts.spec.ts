import { test, expect } from './test-fixtures';

test.describe('author scripts in page content', () => {
  test('run on a cold load', async ({ page }) => {
    await page.goto('/author-scripts.html');

    await expect(page.locator('#inline-marker')).toHaveText('inline ran 1');
    await expect(page.locator('#external-marker')).toHaveText('external ran 1');
  });

  test('run after client-side navigation, on every arrival', async ({
    page,
  }) => {
    await page.goto('/author-scripts-start.html');
    // Marks the window so a full page load would be detected
    await page.evaluate(() => {
      (window as unknown as { sameWindow: boolean }).sameWindow = true;
    });

    await page
      .getByRole('link', { name: 'Go to the author scripts page' })
      .click();
    await expect(page).toHaveURL(/\/author-scripts\.html$/);
    await expect(page.locator('#inline-marker')).toHaveText('inline ran 1');
    await expect(page.locator('#external-marker')).toHaveText('external ran 1');
    // Like a cold load, scripts see the page they belong to
    await expect(page.locator('#inline-location')).toHaveText(
      /^\/author-scripts\.html \| Author Scripts\b/,
    );

    await page.getByRole('link', { name: 'Back to the start page' }).click();
    await expect(page).toHaveURL(/\/author-scripts-start\.html$/);
    await page
      .getByRole('link', { name: 'Go to the author scripts page' })
      .click();
    await expect(page).toHaveURL(/\/author-scripts\.html$/);
    await expect(page.locator('#inline-marker')).toHaveText('inline ran 2');
    await expect(page.locator('#external-marker')).toHaveText('external ran 2');

    expect(
      await page.evaluate(
        () => (window as unknown as { sameWindow?: boolean }).sameWindow,
      ),
    ).toBe(true);
  });
});
