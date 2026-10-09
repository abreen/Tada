import { expect, test, type Page } from './test-fixtures';

// Returns the RGB channels of a nested strong/em danger text color
// with --tint-hue set on the root
async function getDangerChannels(page: Page, tintHue: number) {
  const color = await page.evaluate(tintHue => {
    document.documentElement.style.setProperty('--tint-hue', `${tintHue}deg`);
    const probe = document.createElement('em');
    const inner = document.createElement('strong');
    inner.textContent = 'x';
    probe.appendChild(inner);
    document.body.appendChild(probe);
    const color = getComputedStyle(inner).color;
    probe.remove();
    return color;
  }, tintHue);
  return color
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number);
}

test.describe('danger text color', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('follows a tint hue changed at runtime', async ({ page }) => {
    expect(await getDangerChannels(page, 120)).not.toEqual(
      await getDangerChannels(page, 300),
    );
  });

  test('changes gradually all the way around the hue wheel', async ({
    page,
  }) => {
    let previous = await getDangerChannels(page, 0);
    for (let tintHue = 10; tintHue <= 360; tintHue += 10) {
      const current = await getDangerChannels(page, tintHue);
      for (const [i, channel] of current.entries()) {
        expect(Math.abs(channel - previous[i])).toBeLessThan(8);
      }
      previous = current;
    }
  });
});
