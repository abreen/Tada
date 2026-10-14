import { test, expect, type Locator, type Page } from './test-fixtures';

function preview(page: Page) {
  return page.locator('main details.details-preview').first();
}

function shortPreview(page: Page) {
  return page.locator('main details.details-preview', {
    hasText: 'The only paragraph of the short preview.',
  });
}

function button(details: Locator) {
  return details.locator('summary > span:visible');
}

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

test.describe('Details preview', () => {
  test.beforeEach(async ({ page }) => {
    // Development builds log this once every component has mounted
    const mounted = page.waitForEvent('console', message =>
      message.text().startsWith('Components mounted'),
    );
    await page.goto('/details-preview.html');
    await mounted;
  });

  test('a closed preview shows the start of its body above a Show more button', async ({
    page,
  }) => {
    const details = preview(page);
    await details.scrollIntoViewIfNeeded();
    await expect(details).not.toHaveAttribute('open');
    await expect(button(details)).toHaveText('Show more');

    await expect(
      details.getByText('Paragraph 1 of the preview'),
    ).toBeInViewport();
    await expect(
      details.getByText('Paragraph 12 of the preview.'),
    ).not.toBeInViewport();

    const detailsBox = (await details.boundingBox())!;
    const buttonBox = (await button(details).boundingBox())!;
    const paragraphBox = (await details
      .getByText('Paragraph 1 of the preview')
      .boundingBox())!;
    expect(buttonBox.y).toBeGreaterThan(paragraphBox.y + paragraphBox.height);
    expect(buttonBox.y + buttonBox.height).toBeLessThan(
      detailsBox.y + detailsBox.height,
    );
  });

  test('the Show more button opens the preview and becomes a Show less button', async ({
    page,
  }) => {
    const details = preview(page);
    await button(details).click();

    await expect(details).toHaveAttribute('open', '');
    await expect(button(details)).toHaveText('Show less');

    await details
      .getByText('Paragraph 12 of the preview.')
      .scrollIntoViewIfNeeded();
    await expect(
      details.getByText('Paragraph 12 of the preview.'),
    ).toBeInViewport();
  });

  test('clicking anywhere in the faded bottom of a closed preview opens it', async ({
    page,
  }) => {
    const details = preview(page);
    await details.scrollIntoViewIfNeeded();
    const summaryBox = (await details.locator('summary').boundingBox())!;

    // Near the left edge, at the top of the fade
    await page.mouse.click(summaryBox.x + 10, summaryBox.y + 5);

    await expect(details).toHaveAttribute('open', '');
  });

  test('an open preview keeps its Show less button at the bottom of the viewport', async ({
    page,
  }) => {
    const details = preview(page);
    await button(details).click();

    await details
      .getByText('Paragraph 20 of the preview.')
      .evaluate(element => element.scrollIntoView({ block: 'center' }));

    await expect(
      details.getByText('Paragraph 1 of the preview'),
    ).not.toBeInViewport();
    await expect(
      details.getByText('The last paragraph of the preview.'),
    ).not.toBeInViewport();

    const closeButton = button(details);
    await expect(closeButton).toHaveText('Show less');
    expect(await isFullyOnScreen(page, closeButton)).toBe(true);
    const box = (await closeButton.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(
      page.viewportSize()!.height - 100,
    );
  });

  test('closing from the stuck Show less button keeps the button where it was clicked', async ({
    page,
  }) => {
    const details = preview(page);
    await button(details).click();

    await details
      .getByText('Paragraph 30 of the preview')
      .evaluate(element => element.scrollIntoView({ block: 'center' }));
    const before = (await button(details).boundingBox())!;

    // Locator clicks would first scroll the stuck button to where it sits in
    // the page, so click where it is on screen
    await page.mouse.click(
      before.x + before.width / 2,
      before.y + before.height / 2,
    );

    await expect(details).not.toHaveAttribute('open');
    await expect(button(details)).toHaveText('Show more');
    const after = (await button(details).boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  });

  test('opening and closing a preview whose top is in view leaves the box where it was', async ({
    page,
  }) => {
    const details = preview(page);
    await details.evaluate(element =>
      element.scrollIntoView({ block: 'center' }),
    );
    const before = (await details.boundingBox())!;

    for (let i = 0; i < 3; i++) {
      await button(details).click();
      await expect(details).toHaveAttribute('open', '');

      // The open button is stuck to the bottom of the viewport, so click
      // where it is on screen
      const box = (await button(details).boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(details).not.toHaveAttribute('open');
    }

    const after = (await details.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  });

  test('focusing a link in the clipped body of a closed preview opens it', async ({
    page,
  }) => {
    // WebKit does not move keyboard focus to links with Tab by default, so
    // focus the link directly. It also leaves the body of a closed details
    // element out of the accessibility tree, so find the link by its href.
    const details = preview(page);
    const link = details.locator('a[href="#preview-end"]');
    await link.focus();

    await expect(link).toBeFocused();
    await expect(details).toHaveAttribute('open', '');
  });

  test('clicking a control in the visible part of a closed preview leaves it closed', async ({
    page,
  }) => {
    const details = preview(page);
    await details.scrollIntoViewIfNeeded();
    // WebKit leaves the body of a closed details element out of the
    // accessibility tree, and Playwright treats it as hidden there, so click
    // where the button is on screen
    const box = (await details
      .locator('button', { hasText: 'a button' })
      .boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(details).not.toHaveAttribute('open');
  });

  test('clicking the Show more button draws no focus outline', async ({
    page,
  }) => {
    const details = preview(page);
    await button(details).click();
    await expect(details).toHaveAttribute('open', '');

    expect(await hasOutline(details)).toBe(false);
    expect(await hasOutline(button(details))).toBe(false);
  });

  test('keyboard focus outlines the label but not the box', async ({
    page,
  }) => {
    const details = preview(page);
    // Focus with no pointer interaction first matches :focus-visible
    await details.locator('summary').focus();

    expect(await hasOutline(button(details))).toBe(true);
    expect(await hasOutline(details)).toBe(false);
  });

  test('a closed preview with a short body keeps its label inside the box', async ({
    page,
  }) => {
    const details = shortPreview(page);
    await details.scrollIntoViewIfNeeded();

    const detailsBox = (await details.boundingBox())!;
    const labelBox = (await button(details).boundingBox())!;
    const paragraphBox = (await details
      .getByText('The only paragraph of the short preview.')
      .boundingBox())!;
    expect(labelBox.y).toBeGreaterThan(paragraphBox.y + paragraphBox.height);
    expect(labelBox.y + labelBox.height).toBeLessThan(
      detailsBox.y + detailsBox.height,
    );
  });
});

test.describe('Details preview without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the Show more button opens the preview and the Show less button closes it', async ({
    page,
  }) => {
    await page.goto('/details-preview.html');
    const details = preview(page);

    await expect(button(details)).toHaveText('Show more');
    await button(details).click();
    await expect(details).toHaveAttribute('open', '');
    await expect(button(details)).toHaveText('Show less');

    await button(details).click();
    await expect(details).not.toHaveAttribute('open');
  });

  test('printing shows the whole body of a closed preview', async ({
    page,
  }) => {
    await page.goto('/details-preview.html');
    await page.emulateMedia({ media: 'print' });
    const details = preview(page);

    await expect(details).not.toHaveAttribute('open');
    const detailsBox = (await details.boundingBox())!;
    const lastBox = (await details
      .getByText('The last paragraph of the preview.')
      .boundingBox())!;
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(
      detailsBox.y + detailsBox.height,
    );
  });
});

test('a search highlight in the clipped body of a closed preview opens it', async ({
  page,
}) => {
  await page.goto('/details-preview.html?pagefind-highlight=zebra');
  const details = preview(page);

  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('mark', { hasText: 'zebra' })).toBeInViewport();
});
