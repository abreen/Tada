import { expect, test, type Page } from './test-fixtures';

// Returns the RGB channels of a link's color with --tint-hue set on the root
async function getLinkChannels(page: Page, tintHue: number) {
  const color = await page.evaluate(tintHue => {
    document.documentElement.style.setProperty('--tint-hue', `${tintHue}deg`);
    const probe = document.createElement('a');
    probe.href = '#';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, tintHue);
  return color
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number);
}

test.describe('link color', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('follows a tint hue changed at runtime', async ({ page }) => {
    expect(await getLinkChannels(page, 120)).not.toEqual(
      await getLinkChannels(page, 300),
    );
  });

  test('changes gradually all the way around the hue wheel', async ({
    page,
  }) => {
    let previous = await getLinkChannels(page, 0);
    for (let tintHue = 10; tintHue <= 360; tintHue += 10) {
      const current = await getLinkChannels(page, tintHue);
      for (const [i, channel] of current.entries()) {
        expect(Math.abs(channel - previous[i])).toBeLessThan(8);
      }
      previous = current;
    }
  });
});
