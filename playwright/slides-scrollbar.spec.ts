import { test, expect } from './test-fixtures';

// Headless Chromium hides scrollbars by default, which hides the gutter that
// `scrollbar-gutter: stable` reserves on Windows
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test('annotation canvas pixels line up with the pointer', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 800 });
  await page.goto('/slides.html');

  await page.getByRole('checkbox', { name: 'Full screen' }).uncheck();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(
    page.locator('main.body .slide-deck .slide.is-active'),
  ).toContainText('Intro');

  const x = 1200;
  const y = 400;
  await page.mouse.click(x, y, { button: 'right' });
  await expect
    .poll(async () =>
      page.evaluate(() =>
        document.body.classList.contains('is-slides-annotating'),
      ),
    )
    .toBe(true);
  await page.mouse.click(x, y);

  const canvas = page.locator(
    '[data-slides-annotations][data-slide-index="0"]',
  );

  // Where the painted dot appears on screen, from the canvas's rendered box
  const dotCenter = () =>
    canvas.evaluate((node: HTMLCanvasElement) => {
      const context = node.getContext('2d');
      const box = node.getBoundingClientRect();
      if (!context) {
        return null;
      }

      const { data } = context.getImageData(0, 0, node.width, node.height);
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) {
        if ((data[i] ?? 0) > 0) {
          const pixel = (i - 3) / 4;
          sumX += pixel % node.width;
          sumY += Math.floor(pixel / node.width);
          count += 1;
        }
      }
      if (count === 0) {
        return null;
      }

      return {
        x: box.left + ((sumX / count + 0.5) * box.width) / node.width,
        y: box.top + ((sumY / count + 0.5) * box.height) / node.height,
      };
    });

  await expect.poll(dotCenter).not.toBeNull();
  const center = await dotCenter();
  expect(Math.abs((center?.x ?? 0) - x)).toBeLessThan(1);
  expect(Math.abs((center?.y ?? 0) - y)).toBeLessThan(1);
});
