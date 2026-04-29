import { test, expect } from '@playwright/test';

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

  test('presentation mode caps slide width and supports browser interactions', async ({
    page,
  }) => {
    await page.goto('/slides.html');
    await page.addStyleTag({
      content:
        'body:not(.is-presenting) main.body .slide { min-height: 120vh; }',
    });

    await page.getByRole('checkbox', { name: 'Full screen' }).uncheck();
    await page.getByRole('button', { name: 'Present', exact: true }).click();

    const activeSlide = page.locator('main.body .slide-deck .slide.is-active');
    const closeButton = page.locator('[data-slides-close]');
    const overlay = page.locator('[data-slides-overlay]');
    const traceSlide = page
      .locator('main.body .slide-deck .slide')
      .filter({ hasText: 'End' });
    await expect(activeSlide).toBeVisible();
    await expect(activeSlide).toContainText('Intro');
    await expect(traceSlide).toBeHidden();
    await expect(page.locator('[data-slides-counter]')).toHaveCount(0);
    await expect(closeButton).toBeHidden();

    const metrics = await activeSlide.evaluate(slide => {
      const deck = slide.closest('.slide-deck') as HTMLElement;
      const style = window.getComputedStyle(slide);
      const rect = slide.getBoundingClientRect();
      const deckRect = deck.getBoundingClientRect();

      return {
        position: style.position,
        overflowY: style.overflowY,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        deckWidth: deckRect.width,
        deckHeight: deckRect.height,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      };
    });

    expect(metrics.position).toBe('fixed');
    expect(metrics.deckWidth).toBe(metrics.innerWidth);
    expect(metrics.deckHeight).toBe(metrics.innerHeight);
    expect(metrics.overflowY).toBe('auto');
    expect(metrics.top).toBe(0);
    expect(metrics.width).toBeLessThan(metrics.innerWidth);
    expect(metrics.width).toBeLessThanOrEqual(metrics.innerWidth);
    expect(metrics.height).toBe(metrics.innerHeight);
    expect(metrics.width).toBeLessThan(metrics.innerWidth - 8);

    const overlayStyles = await overlay.evaluate(node => {
      const style = window.getComputedStyle(node);
      return {
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
        borderRadius: style.borderRadius,
      };
    });
    const activeSlideStyles = await activeSlide.evaluate(slide => {
      const style = window.getComputedStyle(slide);
      return { userSelect: style.userSelect };
    });

    expect(overlayStyles.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(overlayStyles.boxShadow).toBe('none');
    expect(overlayStyles.borderRadius).toBe('0px');
    expect(activeSlideStyles.userSelect).toBe('none');

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

    await page.mouse.move(100, revealBottom + 40);
    await expect(closeButton).toBeHidden();

    await page.mouse.move(100, Math.max(1, revealBottom - 1));
    await expect(closeButton).toBeVisible();

    const sideGutterX = (metrics.innerWidth - metrics.width) / 4;
    await page.mouse.click(sideGutterX, metrics.innerHeight - 24);
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
    const traceLayout = await activeSlide
      .locator('.trace-body')
      .evaluate(traceBody => {
        const slide = traceBody.closest('.slide') as HTMLElement;
        const slideStyle = window.getComputedStyle(slide);
        const slideRect = slide.getBoundingClientRect();
        const traceRect = traceBody.getBoundingClientRect();
        const paddingBottom = Number.parseFloat(slideStyle.paddingBottom);

        return {
          traceBottom: traceRect.bottom,
          contentBottom: slideRect.bottom - paddingBottom,
        };
      });

    expect(traceLayout.traceBottom).toBeLessThanOrEqual(
      traceLayout.contentBottom + 1,
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

  test('presentation content scales down on small viewports', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/slides.html');

    await page.getByRole('checkbox', { name: 'Full screen' }).uncheck();
    await page.getByRole('button', { name: 'Present', exact: true }).click();

    const activeSlide = page.locator('main.body .slide-deck .slide.is-active');
    const largeFontSize = await activeSlide.evaluate(slide =>
      Number.parseFloat(window.getComputedStyle(slide).fontSize),
    );
    expect(largeFontSize).toBeCloseTo(24, 1);

    await page.setViewportSize({ width: 420, height: 360 });

    const smallMetrics = await activeSlide.evaluate(slide => {
      const style = window.getComputedStyle(slide);
      const rect = slide.getBoundingClientRect();

      return {
        fontSize: Number.parseFloat(style.fontSize),
        width: rect.width,
        height: rect.height,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      };
    });

    expect(smallMetrics.fontSize).toBeLessThan(largeFontSize);
    expect(smallMetrics.width).toBeLessThanOrEqual(smallMetrics.innerWidth);
    expect(smallMetrics.height).toBe(smallMetrics.innerHeight);

    await page.keyboard.press('Escape');
  });

  test('presentation annotations draw and persist per slide', async ({
    page,
  }) => {
    await page.goto('/slides.html');

    await page.getByRole('checkbox', { name: 'Full screen' }).uncheck();
    await page.getByRole('button', { name: 'Present', exact: true }).click();

    const activeSlide = page.locator('main.body .slide-deck .slide.is-active');
    await expect(activeSlide).toContainText('Intro');

    const rect = await activeSlide.boundingBox();
    expect(rect).not.toBeNull();
    if (!rect) {
      return;
    }

    await page.mouse.click(rect.x + 120, rect.y + 120, { button: 'right' });
    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.body.classList.contains('is-slides-annotating'),
        ),
      )
      .toBe(true);

    const penCursor = await activeSlide.evaluate(
      slide => window.getComputedStyle(slide).cursor,
    );
    expect(penCursor).toContain('data:image/svg+xml');

    await page.mouse.move(rect.x + 120, rect.y + 120);
    await page.mouse.down();
    await page.mouse.move(rect.x + 260, rect.y + 220, { steps: 8 });
    await page.mouse.up();

    const violetPixels = async () =>
      activeSlide.locator('[data-slides-annotations]').evaluate(canvas => {
        const annotationCanvas = canvas as HTMLCanvasElement;
        const context = annotationCanvas.getContext('2d');
        if (!context) {
          return 0;
        }

        const { data } = context.getImageData(
          0,
          0,
          annotationCanvas.width,
          annotationCanvas.height,
        );
        let count = 0;

        for (let i = 0; i < data.length; i += 4) {
          const red = data[i] ?? 0;
          const green = data[i + 1] ?? 0;
          const blue = data[i + 2] ?? 0;
          const alpha = data[i + 3] ?? 0;

          if (
            alpha > 0 &&
            Math.abs(red - 138) < 24 &&
            Math.abs(green - 43) < 24 &&
            Math.abs(blue - 226) < 24
          ) {
            count += 1;
          }
        }

        return count;
      });

    await expect.poll(violetPixels).toBeGreaterThan(0);
    const pixelsBeforeErase = await violetPixels();

    await page.keyboard.down('Shift');
    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.body.classList.contains('is-slides-erasing'),
        ),
      )
      .toBe(true);

    const eraserCursor = await activeSlide.evaluate(
      slide => window.getComputedStyle(slide).cursor,
    );
    expect(eraserCursor).toContain('data:image/svg+xml');
    expect(eraserCursor).not.toBe(penCursor);

    await page.mouse.move(rect.x + 170, rect.y + 155);
    const eraserPreview = page.locator('[data-slides-eraser-preview]');
    await expect(eraserPreview).toBeVisible();
    const previewStyle = await eraserPreview.evaluate(node => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();

      return {
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        borderTopColor: style.borderTopColor,
        borderTopStyle: style.borderTopStyle,
        borderTopWidth: Number.parseFloat(style.borderTopWidth),
        height: rect.height,
        width: rect.width,
      };
    });
    expect(previewStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(previewStyle.borderTopStyle).toBe('solid');
    expect(previewStyle.borderTopWidth).toBeGreaterThan(0);
    expect(previewStyle.borderTopColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(previewStyle.borderRadius).not.toBe('0px');
    expect(previewStyle.width).toBeGreaterThan(0);
    expect(previewStyle.height).toBe(previewStyle.width);

    await page.mouse.move(rect.x + 220, rect.y + 190, { steps: 6 });
    await page.keyboard.up('Shift');
    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.body.classList.contains('is-slides-erasing'),
        ),
      )
      .toBe(false);
    await expect(eraserPreview).toBeHidden();

    expect(await violetPixels()).toBeLessThan(pixelsBeforeErase);

    await activeSlide.click();
    await expect(activeSlide).toContainText('Intro');

    await page.keyboard.press('ArrowRight');
    await expect(activeSlide).toContainText('Middle');
    await expect(activeSlide.locator('[data-slides-annotations]')).toHaveCount(
      0,
    );

    await page.keyboard.press('ArrowLeft');
    await expect(activeSlide).toContainText('Intro');
    await expect.poll(violetPixels).toBeGreaterThan(0);

    const returnedRect = await activeSlide.boundingBox();
    expect(returnedRect).not.toBeNull();
    if (!returnedRect) {
      return;
    }

    await page.mouse.click(returnedRect.x + 120, returnedRect.y + 120, {
      button: 'right',
    });
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
