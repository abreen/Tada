import { test, expect, type Locator, type Page } from './test-fixtures';

// Whether the element's box lies entirely in the viewport below the fixed header
async function isFullyOnScreen(page: Page, locator: Locator) {
  return locator.evaluate((element, viewportHeight) => {
    const headerBottom = document
      .querySelector('header')!
      .getBoundingClientRect().bottom;
    const box = element.getBoundingClientRect();
    return box.top >= headerBottom - 0.5 && box.bottom <= viewportHeight + 0.5;
  }, page.viewportSize()!.height);
}

// Whether the element draws a focus outline
function hasOutline(locator: Locator) {
  return locator.evaluate(
    element => getComputedStyle(element).outlineStyle !== 'none',
  );
}

test.describe('Details in content', () => {
  test.beforeEach(async ({ page }) => {
    // Development builds log this once every component has mounted
    const mounted = page.waitForEvent('console', message =>
      message.text().startsWith('Components mounted'),
    );
    await page.goto('/long-details.html');
    await mounted;
  });

  function longDetails(page: Page) {
    return page.locator('main details', {
      has: page.locator('summary', { hasText: 'Long details' }),
    });
  }

  test('scrolling over a tall open details scrolls the page', async ({
    page,
    browserName,
  }) => {
    // Only real wheel input shows the details element does not trap scrolling
    test.skip(
      browserName === 'webkit' && process.platform === 'linux',
      "Playwright's WebKit does not scroll the page on a wheel event on Linux",
    );

    const details = longDetails(page);
    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');

    const box = (await details.boundingBox())!;
    const viewportHeight = page.viewportSize()!.height;
    await page.mouse.move(box.x + box.width / 2, viewportHeight - 100);
    await page.mouse.wheel(0, 300);

    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
  });

  test('a tall open details keeps its summary on screen while scrolling through it', async ({
    page,
  }) => {
    const details = longDetails(page);
    const summary = details.locator('summary');
    await summary.click();

    await details
      .getByText('Paragraph 25 of the long details element.')
      .evaluate(element => element.scrollIntoView({ block: 'center' }));

    await expect(details.getByText('Paragraph 1 of')).not.toBeInViewport();
    await expect(
      details.getByText('The last paragraph of the long details element.'),
    ).not.toBeInViewport();
    expect(await isFullyOnScreen(page, summary)).toBe(true);

    await summary.click();
    await expect(details).not.toHaveAttribute('open');
  });

  test('a stuck summary leaves the box as tall as a closed one once the body has scrolled past', async ({
    page,
  }) => {
    const details = longDetails(page);
    const summary = details.locator('summary');
    const closedHeight = (await details.boundingBox())!.height;
    await summary.click();

    // Leave exactly a closed box's height of the details below the header
    const headerBottom = await page.evaluate(
      () => document.querySelector('header')!.getBoundingClientRect().bottom,
    );
    await details.evaluate(
      (element, target) =>
        window.scrollBy(0, element.getBoundingClientRect().bottom - target),
      headerBottom + closedHeight,
    );

    const box = (await details.boundingBox())!;
    const summaryBox = (await summary.boundingBox())!;
    expect(
      Math.abs(box.y + box.height - summaryBox.y - closedHeight),
    ).toBeLessThan(1);
  });

  test('closing a tall details from its stuck summary scrolls it into view', async ({
    page,
  }) => {
    const details = longDetails(page);
    const summary = details.locator('summary');
    await summary.click();

    // Deep in the body, with nothing past the details on screen
    await details
      .getByText('Paragraph 30 of the long details element.')
      .evaluate(element => element.scrollIntoView({ block: 'center' }));
    const box = (await summary.boundingBox())!;

    // Locator clicks would first scroll the stuck summary to where it sits in
    // the page, so click where it is on screen
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    // The closed details lands where fragment links scroll to, below the
    // header with the page's scroll padding above it
    await expect(details).not.toHaveAttribute('open');
    const offset = await details.evaluate(element => {
      const padding = getComputedStyle(
        document.documentElement,
      ).scrollPaddingTop;
      return element.getBoundingClientRect().top - parseFloat(padding);
    });
    expect(Math.abs(offset)).toBeLessThan(1);
  });

  test('a target in a tall open details is not hidden under its summary', async ({
    page,
  }) => {
    const details = longDetails(page);
    await details.locator('summary').click();

    const target = page.locator('#long-details-target');
    await target.evaluate(element => element.scrollIntoView());

    const uncovered = await target.evaluate(element => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + 1, box.top + 1);
      return element.contains(hit);
    });
    expect(uncovered).toBe(true);
  });

  test('a control in an open summary works without closing the details', async ({
    page,
  }) => {
    const details = page.locator('main details', {
      has: page.locator('summary', { hasText: 'Checkbox details' }),
    });
    const checkbox = details.getByRole('checkbox', { name: 'Done' });

    await checkbox.click();

    await expect(checkbox).toBeChecked();
    await expect(details).toHaveAttribute('open', '');
  });

  test('a short open details shows all its content', async ({ page }) => {
    const details = page.locator('main details', {
      has: page.locator('summary', { hasText: 'Short details' }),
    });

    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');

    const detailsBox = (await details.boundingBox())!;
    const paragraphBox = (await details
      .getByText('The only paragraph of the short details element.')
      .boundingBox())!;
    expect(paragraphBox.y).toBeGreaterThanOrEqual(detailsBox.y);
    expect(paragraphBox.y + paragraphBox.height).toBeLessThanOrEqual(
      detailsBox.y + detailsBox.height,
    );
  });

  test('clicking a summary does not outline the box', async ({ page }) => {
    const details = page.locator('main details', {
      has: page.locator('summary', { hasText: 'Short details' }),
    });

    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');
    expect(await hasOutline(details)).toBe(false);
  });

  test('keyboard focus on a summary outlines the box', async ({ page }) => {
    const details = page.locator('main details', {
      has: page.locator('summary', { hasText: 'Short details' }),
    });

    // Focus with no pointer interaction first matches :focus-visible
    await details.locator('summary').focus();
    await expect(details.locator('summary')).toBeFocused();
    expect(await hasOutline(details)).toBe(true);
  });
});
