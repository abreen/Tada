import { test, expect } from './test-fixtures';

test('Escape from a search result closes results and restores keyboard focus', async ({
  page,
}) => {
  await page.goto('/index.html');
  await page.locator('main.body').evaluate(main => {
    const button = document.createElement('button');
    button.textContent = 'Return focus';
    main.prepend(button);
  });
  const previousFocus = page.getByRole('button', { name: 'Return focus' });
  const input = page.getByRole('combobox', { name: 'Search' });
  const panel = page.locator('.results-container');
  await expect(input).toBeEnabled();
  await previousFocus.focus();
  await page.keyboard.press('/');
  await expect(input).toBeFocused();
  await input.fill('markdown');
  const result = panel.locator('a.result').first();
  await expect(result).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(result).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await expect(panel).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(previousFocus).toBeFocused();

  await page.keyboard.press('/');
  await expect(input).toBeFocused();
  await expect(result).toBeVisible();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
});
