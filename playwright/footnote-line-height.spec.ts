import { test, expect } from './test-fixtures';

test('footnote references do not change the line height', async ({ page }) => {
  await page.goto('/footnote-line-height.html');

  const plain = page.getByText('A line without a footnote reference.');
  const withRef = page.getByText('A line with a footnote reference.');
  await expect(withRef.getByRole('link', { name: '1' })).toBeVisible();

  const plainBox = await plain.boundingBox();
  const withRefBox = await withRef.boundingBox();
  expect(plainBox).not.toBeNull();
  expect(withRefBox).not.toBeNull();
  expect(Math.abs(withRefBox!.height - plainBox!.height)).toBeLessThan(0.5);
});
