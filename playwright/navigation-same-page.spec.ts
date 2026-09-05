import { test, expect } from './test-fixtures';

for (const withHash of [true, false]) {
  test(`same-page URL scrolls to top ${withHash ? 'and clears the fragment' : 'without a previous fragment'}`, async ({
    page,
  }) => {
    await page.goto('/markdown.html');
    if (withHash) {
      await page.locator('nav.toc ol a').last().click();
      await expect(page).toHaveURL(/#/);
    }
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/markdown.html';
      link.textContent = 'Same page without fragment';
      link.id = 'same-page-link';
      link.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:1000';
      document.body.appendChild(link);
      window.scrollTo({ top: 600 });
    });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(400);
    const previousUrl = page.url();
    const previousScroll = await page.evaluate(() => window.scrollY);
    const historyLength = await page.evaluate(() => history.length);
    const link = page.locator('#same-page-link');
    await link.click();
    await expect(page).toHaveURL(/\/markdown\.html$/);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThan(10);
    await expect(link).toBeVisible(); // The existing document was retained.
    await expect(page.locator(':target')).toHaveCount(0);
    expect(await page.evaluate(() => history.length)).toBe(
      historyLength + (withHash ? 1 : 0),
    );
    if (withHash) {
      await page.goBack();
      await expect(page).toHaveURL(previousUrl);
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeCloseTo(previousScroll, -1);
      await page.goForward();
      await expect(page).toHaveURL(/\/markdown\.html$/);
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeLessThan(10);
    }
  });
}
