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
