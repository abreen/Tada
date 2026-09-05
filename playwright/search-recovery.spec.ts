import { test, expect } from './test-fixtures';

for (const clearPendingQuery of [false, true]) {
  test(`search recovers after a failed import (${clearPendingQuery ? 'cleared' : 'latest'} query)`, async ({
    page,
  }) => {
    const requests: string[] = [];
    let releaseRetry!: () => void;
    const retryGate = new Promise<void>(resolve => {
      releaseRetry = resolve;
    });
    await page.route('**/pagefind/pagefind.js*', async route => {
      requests.push(route.request().url());
      if (requests.length === 1) {
        await route.fulfill({ status: 503, body: 'Temporarily unavailable' });
        return;
      }
      await retryGate;
      await route.continue();
    });
    const failed = page.waitForEvent('console', message =>
      message.text().includes('failed to load Pagefind'),
    );
    await page.goto('/index.html');
    await failed;
    expect(requests).toHaveLength(1);

    const input = page.locator('input.quick-search');
    await input.focus();
    await input.fill('nonexistentoldquery');
    await input.fill('Markdown');
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]).not.toBe(requests[0]);
    await expect(page.locator('.results-count')).toHaveText('Loading…');
    if (clearPendingQuery) {
      await input.fill('');
    }
    const recovered = page.waitForResponse(
      response => response.url() === requests[1],
    );
    releaseRetry();
    await recovered;
    if (clearPendingQuery) {
      await expect(input).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('a.result')).toHaveCount(0);
      await input.fill('Markdown');
    }
    await expect(page.locator('a.result').first()).toBeVisible();
    await expect(page.locator('.results-count')).not.toHaveText('Loading…');
    await expect(input).toHaveValue('Markdown');
    expect(requests).toHaveLength(2);
  });
}
