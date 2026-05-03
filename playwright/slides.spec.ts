import { test, expect, type Locator } from './test-fixtures';

async function cursorFor(locator: Locator) {
  return locator.evaluate(
    (node: HTMLElement) => window.getComputedStyle(node).cursor,
  );
}

async function nonTransparentPixels(locator: Locator) {
  return locator.evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) {
      return 0;
    }

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) {
      if ((data[i] ?? 0) > 0) {
        count += 1;
      }
    }
    return count;
  });
}

async function nonTransparentPixelsInRect(
  locator: Locator,
  rect: { x: number; y: number; width: number; height: number },
) {
  return locator.evaluate((canvas: HTMLCanvasElement, rect) => {
    const context = canvas.getContext('2d');
    if (!context) {
      return 0;
    }

    const dpr = canvas.width / window.innerWidth;
    const x = Math.max(0, Math.floor(rect.x * dpr));
    const y = Math.max(0, Math.floor(rect.y * dpr));
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    const { data } = context.getImageData(x, y, width, height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) {
      if ((data[i] ?? 0) > 0) {
        count += 1;
      }
    }
    return count;
  }, rect);
}

test.describe('slides presentation mode', () => {
  test('Full screen checkbox can be toggled', async ({ page }) => {
    await page.goto('/slides.html');

    const checkbox = page.getByRole('checkbox', { name: 'Full screen' });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();

    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();

    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });

  test('Full screen preference persists across reloads', async ({ page }) => {
    await page.goto('/slides.html');

    const checkbox = page.getByRole('checkbox', { name: 'Full screen' });
    await expect(checkbox).toBeChecked();

    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    await page.reload();
    await expect(checkbox).not.toBeChecked();

    await checkbox.check();
    await page.reload();
    await expect(checkbox).toBeChecked();
  });

  test('custom presentation event can start at a slide', async ({ page }) => {
    await page.goto('/slides.html');
    await page.getByRole('checkbox', { name: 'Full screen' }).uncheck();

    await page.evaluate(() => {
      document
        .querySelector('[data-slides-root]')
        ?.dispatchEvent(
          new CustomEvent('tada:slides-present', {
            bubbles: true,
            detail: { slideIndex: 1 },
          }),
        );
    });

    const activeSlide = page.locator('main.body .slide-deck .slide.is-active');
    await expect(activeSlide).toContainText('Middle');
    await expect
      .poll(() =>
        page.evaluate(() => document.body.classList.contains('is-presenting')),
      )
      .toBe(true);
  });

  test('presentation mode supports browser interactions', async ({ page }) => {
    await page.goto('/slides.html');
    await page.addStyleTag({
      content:
        'body:not(.is-presenting) main.body .slide { min-height: 120vh; }',
    });

    await page.getByRole('checkbox', { name: 'Full screen' }).uncheck();
    await page.getByRole('button', { name: 'Present', exact: true }).click();

    const activeSlide = page.locator('main.body .slide-deck .slide.is-active');
    const closeButton = page.locator('[data-slides-close]');
    const traceSlide = page
      .locator('main.body .slide-deck .slide')
      .filter({ hasText: 'End' });
    await expect(activeSlide).toBeVisible();
    await expect(activeSlide).toContainText('Intro');
    await expect(traceSlide).toBeHidden();
    await expect(page.locator('[data-slides-counter]')).toHaveCount(0);
    await expect(closeButton).toBeHidden();

    const revealBottom = await closeButton.evaluate(button => {
      const overlay = button.closest('[data-slides-overlay]') as HTMLElement;
      const wasHidden = overlay.hidden;
      if (wasHidden) {
        overlay.hidden = false;
      }

      const bottom = button.getBoundingClientRect().bottom;

      if (wasHidden) {
        overlay.hidden = true;
      }

      return bottom;
    });
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

    await page.mouse.move(100, revealBottom + 40);
    await expect(closeButton).toBeHidden();

    await page.mouse.move(100, Math.max(1, revealBottom - 1));
    await expect(closeButton).toBeVisible();

    const activeSlideBox = await activeSlide.boundingBox();
    const deckClickX =
      activeSlideBox && activeSlideBox.x > 2 ? activeSlideBox.x / 2 : 20;
    await page.mouse.click(deckClickX, viewport.height - 24);
    await expect(activeSlide).toContainText('Middle');
    await expect(closeButton).toBeHidden();
    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.body.classList.contains('is-presentation-cursor-hidden'),
        ),
      )
      .toBe(true);

    await page.mouse.move(100, revealBottom + 40);
    await expect(closeButton).toBeHidden();
    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.body.classList.contains('is-presentation-cursor-hidden'),
        ),
      )
      .toBe(false);

    await page.mouse.move(100, Math.max(1, revealBottom - 1));
    await expect(closeButton).toBeVisible();

    await page.keyboard.press('Space');
    await expect(activeSlide).toContainText('End');
    await expect(closeButton).toBeHidden();
    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.body.classList.contains('is-presentation-cursor-hidden'),
        ),
      )
      .toBe(true);

    const traceResizer = activeSlide.locator('.trace-resizer');
    await expect(traceResizer).toBeVisible();
    await expect(traceResizer).toHaveAttribute('role', 'separator');
    await expect(traceResizer).toHaveAttribute(
      'aria-orientation',
      'horizontal',
    );

    await page.locator('.question-a-body').click();
    await expect(closeButton).toBeHidden();
    await expect(page.locator('.question-a-body')).toHaveAttribute(
      'data-revealed',
      '',
    );

    await page.keyboard.press('ArrowRight');
    await expect(closeButton).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(activeSlide).toContainText('Middle');
    await expect(closeButton).toBeHidden();
    await page.keyboard.press('Escape');
    await expect
      .poll(async () =>
        page.evaluate(() => document.body.classList.contains('is-presenting')),
      )
      .toBe(false);
    await expect
      .poll(async () => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.location.hash)).toBe('');
  });

  test('presentation remains operable on small viewports', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 360 });
    await page.goto('/slides.html');

    await page.getByRole('checkbox', { name: 'Full screen' }).uncheck();
    await page.getByRole('button', { name: 'Present', exact: true }).click();

    const activeSlide = page.locator('main.body .slide-deck .slide.is-active');
    await expect(activeSlide).toContainText('Intro');
    await page.keyboard.press('ArrowRight');
    await expect(activeSlide).toContainText('Middle');

    await page.keyboard.press('Escape');
    await expect
      .poll(async () =>
        page.evaluate(() => document.body.classList.contains('is-presenting')),
      )
      .toBe(false);
  });

  test('presentation annotations draw and persist per slide', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 800 });
    await page.goto('/slides.html');

    await page.getByRole('checkbox', { name: 'Full screen' }).uncheck();
    await page.getByRole('button', { name: 'Present', exact: true }).click();

    const activeSlide = page.locator('main.body .slide-deck .slide.is-active');
    const deck = page.locator('main.body .slide-deck');
    await expect(activeSlide).toContainText('Intro');

    const rect = await activeSlide.boundingBox();
    expect(rect).not.toBeNull();
    if (!rect) {
      return;
    }

    const marginX = Math.max(24, rect.x / 2);
    const marginY = 160;

    await page.mouse.click(marginX, marginY, { button: 'right' });
    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.body.classList.contains('is-slides-annotating'),
        ),
      )
      .toBe(true);

    const penCursor = await cursorFor(deck);
    expect(penCursor).toContain('data:image/svg+xml');

    const introCanvas = page.locator(
      '[data-slides-annotations][data-slide-index="0"]',
    );
    const paintedPixels = () => nonTransparentPixels(introCanvas);

    await page.mouse.click(marginX, marginY);
    await expect
      .poll(() =>
        nonTransparentPixelsInRect(introCanvas, {
          x: marginX - 4,
          y: marginY - 4,
          width: 8,
          height: 8,
        }),
      )
      .toBeGreaterThan(0);

    await page.mouse.move(marginX, marginY);
    await page.mouse.down();
    await page.mouse.move(marginX + 120, marginY + 80, { steps: 8 });
    await page.mouse.up();

    await expect.poll(paintedPixels).toBeGreaterThan(0);
    await page.mouse.move(marginX + 24, marginY + 260);
    await page.mouse.down();
    await page.mouse.move(marginX + 72, marginY + 260, { steps: 3 });
    await page.mouse.move(-20, marginY + 260);
    await page.mouse.move(marginX + 72, marginY + 360);
    await page.mouse.move(marginX + 120, marginY + 360, { steps: 3 });
    await page.mouse.up();
    expect(
      await nonTransparentPixelsInRect(introCanvas, {
        x: marginX + 62,
        y: marginY + 292,
        width: 20,
        height: 36,
      }),
    ).toBe(0);

    const pixelsBeforeErase = await paintedPixels();

    await page.keyboard.down('Shift');
    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.body.classList.contains('is-slides-erasing'),
        ),
      )
      .toBe(true);

    const eraserCursor = await cursorFor(deck);
    expect(eraserCursor).toContain('data:image/svg+xml');
    expect(eraserCursor).not.toBe(penCursor);

    await page.mouse.move(marginX + 40, marginY + 24);
    const eraserPreview = page.locator('[data-slides-eraser-preview]');
    await expect(eraserPreview).toBeVisible();

    await page.mouse.move(marginX + 100, marginY + 64, { steps: 6 });
    await page.keyboard.up('Shift');
    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.body.classList.contains('is-slides-erasing'),
        ),
      )
      .toBe(false);
    await expect(eraserPreview).toBeHidden();

    expect(await paintedPixels()).toBeLessThan(pixelsBeforeErase);

    await activeSlide.click();
    await expect(activeSlide).toContainText('Intro');

    await page.keyboard.press('ArrowRight');
    await expect(activeSlide).toContainText('Middle');
    await expect(introCanvas).toBeHidden();
    await expect(
      page.locator('[data-slides-annotations][data-slide-index="1"]'),
    ).toHaveCount(0);

    await page.keyboard.press('ArrowLeft');
    await expect(activeSlide).toContainText('Intro');
    await expect(introCanvas).toBeVisible();
    await expect.poll(paintedPixels).toBeGreaterThan(0);
    const canvasWidthBeforeResize = await introCanvas.evaluate(
      canvas => (canvas as HTMLCanvasElement).width,
    );

    await page.setViewportSize({ width: 1700, height: 820 });
    await expect
      .poll(async () =>
        introCanvas.evaluate(canvas => (canvas as HTMLCanvasElement).width),
      )
      .toBeGreaterThan(canvasWidthBeforeResize);
    await expect.poll(paintedPixels).toBeGreaterThan(0);

    await page.mouse.click(marginX, marginY, { button: 'right' });
    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.body.classList.contains('is-slides-annotating'),
        ),
      )
      .toBe(false);

    await activeSlide.click();
    await expect(activeSlide).toContainText('Middle');

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-slides-annotations]')).toHaveCount(0);
  });

  test('presentation annotation cursors work in dark mode', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/slides.html');

    await page.getByRole('checkbox', { name: 'Full screen' }).uncheck();
    await page.getByRole('button', { name: 'Present', exact: true }).click();

    const deck = page.locator('main.body .slide-deck');
    await page.mouse.click(80, 120, { button: 'right' });

    const penCursor = await cursorFor(deck);
    expect(penCursor).toContain('data:image/svg+xml');

    await page.keyboard.down('Shift');
    const eraserCursor = await cursorFor(deck);
    expect(eraserCursor).toContain('data:image/svg+xml');
    expect(eraserCursor).not.toBe(penCursor);
    await page.keyboard.up('Shift');
  });

  test('fullscreen presentation enters native fullscreen and never shows the toolbar', async ({
    page,
  }) => {
    await page.goto('/slides.html');
    await page.addStyleTag({
      content:
        'body:not(.is-presenting) main.body .slide { min-height: 120vh; }',
    });

    await page.getByRole('checkbox', { name: 'Full screen' }).check();
    await page.getByRole('button', { name: 'Present', exact: true }).click();

    const activeSlide = page.locator('main.body .slide-deck .slide.is-active');
    const closeButton = page.locator('[data-slides-close]');

    await expect(activeSlide).toContainText('Intro');
    await expect
      .poll(async () =>
        page.evaluate(() => document.fullscreenElement !== null),
      )
      .toBe(true);

    await page.mouse.move(120, 20);
    await expect(closeButton).toBeHidden();

    await page.keyboard.press('ArrowRight');
    await expect(activeSlide).toContainText('Middle');

    await page.keyboard.press('Escape');
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          fullscreen: document.fullscreenElement !== null,
          presenting: document.body.classList.contains('is-presenting'),
        })),
      )
      .toEqual({ fullscreen: false, presenting: false });
    await expect
      .poll(async () => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.location.hash)).toBe('');
  });

  test('multiple choice selections reveal before slide clicks advance', async ({
    page,
  }) => {
    await page.goto('/slides.html');

    await page.getByRole('checkbox', { name: 'Full screen' }).uncheck();
    await page.getByRole('button', { name: 'Present', exact: true }).click();

    const activeSlide = page.locator('main.body .slide-deck .slide.is-active');
    const closeButton = page.locator('[data-slides-close]');
    const multipleChoice = activeSlide.locator('.question-multiple-choice');
    const wrongOption = multipleChoice
      .locator('.question-multiple-choice-option')
      .filter({ hasText: 'Eleven' });

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(activeSlide).toContainText('End');

    await wrongOption.click();
    await expect(closeButton).toBeHidden();
    await expect(multipleChoice).toHaveAttribute('data-revealed', '');
    await expect(wrongOption).toHaveAttribute('data-selected', '');

    await wrongOption.click();
    await expect(closeButton).toBeVisible();
  });

  test('ArrowLeft resets traces when returning to a trace slide', async ({
    page,
  }) => {
    await page.goto('/slides-reset.html');

    await page.getByRole('checkbox', { name: 'Full screen' }).uncheck();
    await page.getByRole('button', { name: 'Present', exact: true }).click();

    const activeSlide = page.locator('main.body .slide-deck .slide.is-active');
    const stepCounter = activeSlide.locator('.trace-step-counter');

    await expect(activeSlide).toContainText('Intro');

    await page.keyboard.press('ArrowRight');
    await expect(activeSlide).toContainText('Trace');
    await expect(stepCounter).toHaveText('1/2');

    await page.keyboard.press('ArrowRight');
    await expect(stepCounter).toHaveText('2/2');

    await page.keyboard.press('ArrowRight');
    await expect(activeSlide).toContainText('Wrap');

    await page.keyboard.press('ArrowLeft');
    await expect(activeSlide).toContainText('Trace');
    await expect(stepCounter).toHaveText('1/2');

    await page.keyboard.press('ArrowLeft');
    await expect(activeSlide).toContainText('Intro');

    await page.keyboard.press('Escape');
  });

  test('trace arrow keys work while annotation mode is active', async ({
    page,
  }) => {
    await page.goto('/slides-reset.html');

    await page.getByRole('checkbox', { name: 'Full screen' }).uncheck();
    await page.getByRole('button', { name: 'Present', exact: true }).click();

    const activeSlide = page.locator('main.body .slide-deck .slide.is-active');
    const stepCounter = activeSlide.locator('.trace-step-counter');

    await page.keyboard.press('ArrowRight');
    await expect(activeSlide).toContainText('Trace');
    await expect(stepCounter).toHaveText('1/2');

    await page.mouse.click(80, 120, { button: 'right' });
    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.body.classList.contains('is-slides-annotating'),
        ),
      )
      .toBe(true);

    await page.keyboard.press('ArrowRight');
    await expect(stepCounter).toHaveText('2/2');

    await page.keyboard.press('ArrowLeft');
    await expect(stepCounter).toHaveText('1/2');

    await page.keyboard.press('Escape');
  });
});

test.describe('slides controls on touch browsers', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test('hides the presentation controls', async ({ page }) => {
    await page.goto('/slides.html');

    await expect(page.locator('.slides-header')).toBeHidden();
    await expect(page.locator('[data-slides-present]')).toBeHidden();
    await expect(page.locator('[data-slides-fullscreen]')).toBeHidden();
    await expect(page.locator('.heading-present-button')).toBeHidden();
  });
});
