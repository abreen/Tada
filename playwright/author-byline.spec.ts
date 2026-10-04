import { expect, test, type Page } from './test-fixtures';

async function expectAvatarBesideName(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const author = page.locator('.info aside.author');
  const name = await author.locator('.text').boundingBox();
  const avatar = await author.locator('.avatar').boundingBox();
  expect(name).not.toBeNull();
  expect(avatar).not.toBeNull();
  expect(avatar!.y).toBeLessThan(name!.y + name!.height);
}

for (const [initial, next] of [
  ['sans', 'serif'],
  ['serif', 'sans'],
] as const) {
  test(`keeps the author avatar beside the name after switching from ${initial} to ${next}`, async ({
    page,
  }) => {
    await page.addInitScript(preference => {
      localStorage.setItem('fontPreference', preference);
    }, initial);
    await page.goto('/index.html');
    await page.evaluate(() => document.fonts.ready);

    // Lay out the byline with loaded fonts so the check does not depend on
    // whether the first layout used fallback fonts
    await page.locator('.info').evaluate(info => {
      info.style.display = 'none';
      info.getBoundingClientRect();
      info.style.removeProperty('display');
    });
    await expectAvatarBesideName(page);

    const fontSwitch = page.getByRole('switch', { name: 'Use serif fonts' });
    await fontSwitch.click();
    await expect(fontSwitch).toHaveAttribute(
      'aria-checked',
      String(next === 'serif'),
    );
    await expectAvatarBesideName(page);
  });
}
