import { test, expect } from './test-fixtures';

for (const resource of ['manifest.json', 'chunk-0.json']) {
  test(`trace resize control becomes focusable only after ${resource} loads`, async ({
    page,
  }) => {
    let release!: () => void;
    let requested!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const pending = new Promise<void>(resolve => {
      requested = resolve;
    });
    await page.route(`**/trace-reset/${resource}`, async route => {
      requested();
      await gate;
      await route.continue();
    });
    try {
      await page.goto('/trace-readiness.html');
      await pending;
      const widget = page.locator('.trace-widget');
      const resizer = widget.locator('.trace-resizer');
      const next = widget.getByRole('button', { name: 'Next step' });
      await expect(next).toBeDisabled();
      await resizer.focus();
      await expect(resizer).not.toBeFocused();

      release();
      await expect(next).toBeEnabled();
      await resizer.focus();
      await expect(resizer).toBeFocused();
      const source = widget.locator('.trace-source-wrapper');
      const before = await source.evaluate(
        element => element.getBoundingClientRect().height,
      );
      await page.keyboard.press('ArrowUp');
      await expect
        .poll(() =>
          source.evaluate(element => element.getBoundingClientRect().height),
        )
        .toBeGreaterThan(before);
    } finally {
      release();
    }
  });
}

test('no-JS trace keeps source links usable without a dead resize focus stop', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/trace-readiness.html');
    await expect(page.locator('.trace-source')).toContainText('trace line 1');
    const resizer = page.locator('.trace-resizer');
    await resizer.focus();
    await expect(resizer).not.toBeFocused();
    const line = page.locator('.line-number').first();
    await line.focus();
    await expect(line).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#trace-line-1$/);
  } finally {
    await context.close();
  }
});

test('printed trace retains readable source before data loads', async ({
  page,
}) => {
  await page.route('**/trace-reset/manifest.json', route =>
    route.fulfill({ status: 503 }),
  );
  const failedResponse = page.waitForResponse('**/trace-reset/manifest.json');
  await page.goto('/trace-readiness.html');
  const response = await failedResponse;
  expect(response.status()).toBe(503);
  const resizer = page.locator('.trace-resizer');
  await expect(resizer).toHaveAttribute('inert', '');
  await resizer.focus();
  await expect(resizer).not.toBeFocused();
  await expect(page.getByRole('button', { name: 'Next step' })).toBeDisabled();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.trace-source')).toBeVisible();
  await expect(page.locator('.trace-source')).toContainText('trace line 1');
});
