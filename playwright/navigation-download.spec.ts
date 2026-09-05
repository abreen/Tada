import { test, expect } from './test-fixtures';

for (const downloadName of ['', 'saved-page.html']) {
  for (const href of ['/index.html', '/markdown.html']) {
    test(`downloads ${href} with download=${JSON.stringify(downloadName)} without navigating`, async ({
      page,
    }) => {
      await page.goto('/index.html', { waitUntil: 'networkidle' });
      const originalUrl = page.url();
      await page.locator('main.body').evaluate(
        (main, attributes) => {
          const anchor = document.createElement('a');
          anchor.href = attributes.href;
          anchor.setAttribute('download', attributes.downloadName);
          anchor.innerHTML = '<span>Download HTML page</span>';
          main.prepend(anchor);
        },
        { href, downloadName },
      );

      const downloadPromise = page.waitForEvent('download', { timeout: 3000 });
      await page.getByText('Download HTML page', { exact: true }).click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toBe(downloadName || href.slice(1));
      expect(await download.failure()).toBeNull();
      await expect(page).toHaveURL(originalUrl);
      await expect(page.locator('h1')).toContainText('Home');
    });
  }
}
