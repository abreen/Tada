import { test, expect, type Page } from './test-fixtures';

// The title may keep a small fixed margin before the controls, but it should
// otherwise use all of the room the visible controls leave behind.
const MAX_TITLE_TO_CONTROLS_GAP_PX = 16;

async function scrollUntilBackToTopShows(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 700 }));
  await expect(
    page.locator('header a', { hasText: 'Back to top' }),
  ).toBeVisible();
}

async function getHeaderLayout(page: Page) {
  return page.locator('header').evaluate(header => {
    const rect = (element: Element | null) => {
      if (!element) {
        return null;
      }
      const { left, right, width } = element.getBoundingClientRect();
      return width > 0 ? { left, right, width } : null;
    };
    const title = header.querySelector<HTMLElement>('summary .header-title')!;
    const shownTitle = header.querySelector<HTMLElement>(
      title.classList.contains('is-page-title')
        ? '.header-page-title'
        : '.site-title',
    )!;
    const controls = [
      rect(header.querySelector('.to-top-container a')),
      rect(header.querySelector('.search-controls input')),
    ].filter(box => box !== null);
    return {
      viewportWidth: document.documentElement.clientWidth,
      menu: rect(header.querySelector('summary .menu-icon'))!,
      logo: rect(header.querySelector('summary .logo, summary .logo-image'))!,
      title: rect(title),
      titleIsTruncated: shownTitle.scrollWidth > shownTitle.clientWidth,
      controlsLeft: Math.min(...controls.map(box => box.left)),
      controlsRight: Math.max(...controls.map(box => box.right)),
    };
  });
}

test.describe('header title space', () => {
  for (const scrolled of [false, true]) {
    test(`gives the title the room left by the visible controls${scrolled ? ' after scrolling' : ''}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 420, height: 800 });
      await page.goto('/lectures/01/Rectangle.java.html');
      if (scrolled) {
        await scrollUntilBackToTopShows(page);
      }

      const layout = await getHeaderLayout(page);
      expect(layout.title).not.toBeNull();
      expect(layout.titleIsTruncated).toBe(true);
      const gap = layout.controlsLeft - layout.title!.right;
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(MAX_TITLE_TO_CONTROLS_GAP_PX);
    });
  }

  test('adapts to the rendered width of the back-to-top label', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto('/lectures/01/Rectangle.java.html');
    await scrollUntilBackToTopShows(page);
    await page
      .locator('header a', { hasText: 'Back to top' })
      .evaluate(link => {
        link.textContent = 'Back to the top of this page';
      });

    const layout = await getHeaderLayout(page);
    expect(layout.title).not.toBeNull();
    const gap = layout.controlsLeft - layout.title!.right;
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(MAX_TITLE_TO_CONTROLS_GAP_PX);
  });

  test('keeps the same trailing inset when back-to-top is the only control', async ({
    page,
  }) => {
    const rightInset = (selector: string) =>
      page.locator(selector).evaluate(element => {
        const header = document.querySelector('header')!;
        return (
          header.getBoundingClientRect().right -
          element.getBoundingClientRect().right
        );
      });

    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto('/lectures/01/Rectangle.java.html');
    const searchInset = await rightInset('.search-controls input');

    await page.setViewportSize({ width: 400, height: 800 });
    await scrollUntilBackToTopShows(page);
    await expect(page.locator('.search-controls')).toBeHidden();
    const backToTopInset = await rightInset('.to-top-container a');

    expect(backToTopInset).toBeCloseTo(searchInset, 0);
  });

  test('opens the navigation across the full header width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 420, height: 800 });
    await page.goto('/lectures/01/Rectangle.java.html');
    await scrollUntilBackToTopShows(page);
    await page
      .locator('header details > summary')
      .click({ position: { x: 30, y: 20 } });
    await expect(page.locator('header details')).toHaveAttribute('open', '');

    const edges = await page.locator('header').evaluate(header => {
      const nav = header.querySelector('details nav')!.getBoundingClientRect();
      const box = header.getBoundingClientRect();
      return {
        leftInset: nav.left - box.left,
        rightInset: box.right - nav.right,
      };
    });
    expect(edges.leftInset).toBeGreaterThan(0);
    expect(edges.rightInset).toBeCloseTo(edges.leftInset, 0);
  });

  test('keeps the menu, logo, and controls on screen without overlap at the narrowest search width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 401, height: 800 });
    await page.goto('/lectures/01/Rectangle.java.html');
    await scrollUntilBackToTopShows(page);
    await expect(page.locator('.search-controls input')).toBeVisible();

    const layout = await getHeaderLayout(page);
    expect(layout.menu.left).toBeGreaterThanOrEqual(0);
    expect(layout.logo.left).toBeGreaterThanOrEqual(layout.menu.right);
    expect(layout.controlsLeft).toBeGreaterThanOrEqual(layout.logo.right);
    if (layout.title) {
      expect(layout.title.left).toBeGreaterThanOrEqual(layout.logo.right);
      expect(layout.controlsLeft).toBeGreaterThanOrEqual(layout.title.right);
    }
    expect(layout.controlsRight).toBeLessThanOrEqual(layout.viewportWidth);
  });
});
