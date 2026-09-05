import { test, expect } from './test-fixtures';

test('code TOC follows source positions across grouped fields and methods', async ({
  page,
}) => {
  await page.goto('/Interleaved.java.html', { waitUntil: 'networkidle' });
  const links = page.locator('nav.toc ol li a');
  expect(
    await links.evaluateAll(items =>
      items.map(item => item.getAttribute('href')),
    ),
  ).toEqual(['#L2', '#L4', '#L3', '#L5']);
  const current = page.locator('nav.toc li.current a');
  await expect(current).toHaveCount(0);

  await links.filter({ hasText: 'firstMethod' }).click();
  await expect(page).toHaveURL(/#L3$/);
  await expect(current).toHaveAttribute('href', '#L3');

  for (const [hash, expected] of [
    ['#L4', '#L4'],
    ['#L3-L5', '#L3'],
    ['#L6', '#L5'],
    ['#L1', '#L2'],
  ]) {
    await page.evaluate(hash => {
      window.location.hash = hash;
    }, hash);
    await expect(current).toHaveAttribute('href', expected);
  }

  await page.evaluate(() => {
    window.location.hash = '';
  });
  await expect(current).toHaveCount(0);
});
