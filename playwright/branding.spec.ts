import { test, expect } from './test-fixtures';

test('logo loads and navigation opens without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('http://localhost:8082/custom/index.html');
    const logo = page.locator('header img.logo-image');
    await expect(logo).toHaveAttribute('src', '/custom/logo.svg');
    await expect
      .poll(() =>
        logo.evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await page.locator('header details > summary').click();
    await expect(page.locator('header details')).toHaveAttribute('open', '');
  } finally {
    await context.close();
  }
});
