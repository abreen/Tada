import { test, expect } from '@playwright/test';

test.describe('slides presentation mode', () => {
  test('presentation mode fills the viewport and supports browser interactions', async ({
    page,
  }) => {
    await page.goto('/slides.html');

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
    expect(metrics.width / metrics.height).toBeCloseTo(4 / 3, 2);
    expect(metrics.width).toBeLessThanOrEqual(metrics.innerWidth);
    expect(metrics.height).toBeLessThanOrEqual(metrics.innerHeight);

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

    await activeSlide.evaluate(slide => {
      slide.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
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
  });

  test('fullscreen presentation enters native fullscreen and never shows the toolbar', async ({
    page,
  }) => {
    await page.goto('/slides.html');

    await page.getByRole('button', { name: 'Present (Full Screen)' }).click();

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

    await page.keyboard.press('Escape');
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          fullscreen: document.fullscreenElement !== null,
          presenting: document.body.classList.contains('is-presenting'),
        })),
      )
      .toEqual({ fullscreen: false, presenting: false });
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
    await expect(page.locator('[data-slides-present-fullscreen]')).toBeHidden();
  });
});
