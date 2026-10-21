import { test, expect, type Page, waitForClientMount } from './test-fixtures';
import {
  LONG_DOCUMENT_TITLE,
  UNBROKEN_DOCUMENT_TITLE,
} from './document-index-fixtures';

function documentIndex(page: Page) {
  return page.getByRole('navigation', { name: 'Document navigation' });
}

function pagination(page: Page) {
  return page.getByRole('navigation', { name: 'Previous and next pages' });
}

test('shows only the current page context of the tree', async ({ page }) => {
  await page.goto('/labs/index.html');

  const index = documentIndex(page);
  await expect(
    index.getByRole('link', { name: 'Labs', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    index.getByRole('link', { name: 'Lab 0', exact: true }),
  ).toBeVisible();
  await expect(
    index.getByRole('link', { name: 'Counting vowels', exact: true }),
  ).toHaveCount(0);
  await expect(index.locator('button')).toHaveCount(0);
});

test('leaves pages outside every index without document navigation', async ({
  page,
}) => {
  await page.goto('/markdown.html');
  await expect(documentIndex(page)).toHaveCount(0);
  await expect(pagination(page)).toHaveCount(0);
});

for (const javaScriptEnabled of [true, false]) {
  test.describe(`with JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'}`, () => {
    test.use({ javaScriptEnabled });

    test('following a branch reveals its children', async ({ page }) => {
      await page.goto('/labs/index.html');
      await documentIndex(page)
        .getByRole('link', { name: 'Lab 0', exact: true })
        .click();
      await expect(page).toHaveURL(/\/labs\/00\/index\.html$/);
      await expect(
        documentIndex(page).locator('[aria-current="page"]'),
      ).toHaveText('Lab 0');

      await documentIndex(page)
        .getByRole('link', { name: 'Counting vowels', exact: true })
        .click();
      await expect(page).toHaveURL(/\/labs\/00\/VowelCounter\.java\.html$/);
      await expect(
        documentIndex(page).locator('[aria-current="page"]'),
      ).toHaveText('Counting vowels');
    });

    test('previous and next links walk the tree in order', async ({ page }) => {
      await page.goto('/labs/index.html');
      await expect(
        pagination(page).getByRole('link', { name: /Previous/ }),
      ).toHaveCount(0);

      for (const path of [
        '/labs/00/index.html',
        '/labs/00/VowelCounter.java.html',
        '/labs/01/index.html',
        '/labs/01/TraceDemo.java.html',
        '/labs/02/index.html',
      ]) {
        await pagination(page).getByRole('link', { name: /Next/ }).click();
        await expect(page).toHaveURL(
          new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
        );
      }
      await expect(
        pagination(page).getByRole('link', { name: /Next/ }),
      ).toHaveCount(0);

      await pagination(page)
        .getByRole('link', { name: /Previous/ })
        .click();
      await expect(page).toHaveURL(/\/labs\/01\/TraceDemo\.java\.html$/);
    });

    test('long titles wrap inside the index', async ({ page }) => {
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/document-index-tests/long-label.html');
        const index = documentIndex(page);
        const shortHeight = await index
          .getByRole('link', { name: 'Guide', exact: true })
          .evaluate(element => element.getBoundingClientRect().height);

        for (const title of [LONG_DOCUMENT_TITLE, UNBROKEN_DOCUMENT_TITLE]) {
          const geometry = await index
            .getByRole('link', { name: title, exact: true })
            .evaluate(element => {
              const box = element.getBoundingClientRect();
              const range = element.ownerDocument.createRange();
              range.selectNodeContents(element);
              return {
                height: box.height,
                fits: [...range.getClientRects()].every(
                  rect =>
                    rect.left >= box.left - 1 && rect.right <= box.right + 1,
                ),
              };
            });
          expect(geometry.height).toBeGreaterThan(shortHeight * 1.5);
          expect(geometry.fits).toBe(true);
        }
      }
    });
  });
}

test('sits below the heading on all screens, beside the body on wide ones', async ({
  page,
}) => {
  for (const [width, beside] of [
    [1280, true],
    [390, false],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/labs/00/index.html');
    const index = await documentIndex(page).boundingBox();
    const heading = await page.locator('.title-and-info').boundingBox();
    const body = await page.locator('main.body').boundingBox();
    expect(index).not.toBeNull();
    expect(heading).not.toBeNull();
    expect(body).not.toBeNull();
    expect(heading!.y + heading!.height).toBeLessThanOrEqual(index!.y);
    if (beside) {
      // The heading spans the index and body
      expect(heading!.x).toBeLessThanOrEqual(index!.x);
      expect(index!.x + index!.width).toBeLessThanOrEqual(body!.x);
      expect(Math.abs(index!.y - body!.y)).toBeLessThanOrEqual(1);
    } else {
      expect(index!.y + index!.height).toBeLessThanOrEqual(body!.y);
    }
  }
});

test('the index scrolls up under the heading and then sticks on wide screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/document-index-tests/long.html');
  const top = await headerBottom(page);
  const before = (await documentIndex(page).boundingBox())!.y;
  expect(before).toBeGreaterThan(top + 20);
  await scrollToBottom(page);
  const after = (await documentIndex(page).boundingBox())!.y;
  expect(after).toBeLessThan(before);
  expect(after).toBeGreaterThanOrEqual(top - 1);
});

test('indexed pages have no breadcrumbs', async ({ page }) => {
  for (const url of [
    '/labs/00/index.html',
    '/labs/00/VowelCounter.java.html',
    '/document-index-tests/Example.java.html',
  ]) {
    await page.goto(url);
    await expect(documentIndex(page)).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb', exact: true }),
    ).toHaveCount(0);
  }
});

test('narrow code pages keep the index but hide their TOC', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/document-index-tests/Example.java.html');
  await expect(documentIndex(page)).toBeVisible();
  await expect(page.locator('nav.toc')).toBeHidden();
});

test('the index and TOC stack on narrow screens', async ({ page }) => {
  for (const [width, height] of [
    [820, 1180],
    [744, 1133],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/document-index-tests/long.html');
    const index = (await documentIndex(page).boundingBox())!;
    const toc = (await page.locator('nav.toc').boundingBox())!;
    expect(index.y + index.height).toBeLessThanOrEqual(toc.y + 1);
  }
});

async function headerBottom(page: Page) {
  const header = await page.locator('body > header').boundingBox();
  return header!.y + header!.height;
}

async function scrollToBottom(page: Page) {
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
}

// Whether the index's list has more entries than it shows
function indexOverflows(page: Page) {
  return documentIndex(page)
    .locator(':scope > ol')
    .evaluate(list => list.scrollHeight > list.clientHeight + 1);
}

test('the index and TOC stay under the header while the page scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/document-index-tests/long.html');
  await scrollToBottom(page);

  const top = await headerBottom(page);
  const indexBox = await documentIndex(page).boundingBox();
  const tocBox = await page.locator('nav.toc').boundingBox();
  expect(indexBox!.y).toBeGreaterThanOrEqual(top - 1);
  expect(tocBox!.y).toBeGreaterThanOrEqual(indexBox!.y + indexBox!.height);
  expect(tocBox!.y + tocBox!.height).toBeLessThanOrEqual(600 + 1);
});

async function indexHeight(page: Page) {
  return (await documentIndex(page).boundingBox())!.height;
}

// The height of one entry in the index, a single-line link
async function entryHeight(page: Page) {
  return (await documentIndex(page)
    .getByRole('link', { name: 'Tall guide', exact: true })
    .boundingBox())!.height;
}

// The TOC's list has more entries than it shows
function tocOverflows(page: Page) {
  return page
    .locator('nav.toc')
    .evaluate(toc => toc.scrollHeight > toc.clientHeight + 1);
}

// The index's height without its padding, in single-line entries
async function indexEntries(page: Page) {
  const list = (await documentIndex(page).locator(':scope > ol').boundingBox())!
    .height;
  return list / (await entryHeight(page));
}

test('a short TOC is shown whole and a tall index takes the rest', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/document-index-tall-tests/page-20.html');
  await scrollToBottom(page);

  const top = await headerBottom(page);
  const indexBox = await documentIndex(page).boundingBox();
  const tocBox = await page.locator('nav.toc').boundingBox();
  expect(await tocOverflows(page)).toBe(false);
  expect(await indexOverflows(page)).toBe(true);
  expect(await indexEntries(page)).toBeGreaterThan(7);
  expect(indexBox!.y).toBeGreaterThanOrEqual(top - 1);
  expect(tocBox!.y).toBeGreaterThanOrEqual(indexBox!.y + indexBox!.height);
  expect(tocBox!.y + tocBox!.height).toBeLessThanOrEqual(800 + 1);
});

test('a long TOC pushes a tall index down to about six entries', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/document-index-tall-tests/page-25.html');
  await scrollToBottom(page);

  const entries = await indexEntries(page);
  expect(entries).toBeGreaterThan(5.5);
  expect(entries).toBeLessThan(6.5);
  expect(await tocOverflows(page)).toBe(true);
  const tocBox = await page.locator('nav.toc').boundingBox();
  expect(tocBox!.y + tocBox!.height).toBeLessThanOrEqual(800 + 1);
});

test('a short index is not stretched to the minimum height', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/labs/index.html');
  const list = documentIndex(page).locator(':scope > ol');
  const { height, content } = await list.evaluate(element => ({
    height: element.getBoundingClientRect().height,
    content: element.scrollHeight,
  }));
  expect(await documentIndex(page).locator('li').count()).toBeLessThan(6);
  expect(Math.abs(height - content)).toBeLessThanOrEqual(1);
});

test('a tall index without a TOC fits in the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/document-index-tall-tests/page-30.html');
  await scrollToBottom(page);

  const top = await headerBottom(page);
  const indexBox = await documentIndex(page).boundingBox();
  expect(await indexOverflows(page)).toBe(true);
  expect(indexBox!.y).toBeGreaterThanOrEqual(top - 1);
  expect(indexBox!.y + indexBox!.height).toBeLessThanOrEqual(800 + 1);
});

test('a tall index is capped above the body on narrow screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/document-index-tall-tests/page-20.html');
  const indexBox = await documentIndex(page).boundingBox();
  expect(await indexOverflows(page)).toBe(true);
  expect(indexBox!.height).toBeLessThanOrEqual(800 / 2 + 1);
});

test('a tall index starts with the current page in view', async ({
  page,
  browserName,
}) => {
  // Only Chromium supports scroll-initial-target
  test.skip(browserName !== 'chromium');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/document-index-tall-tests/page-25.html');
  const list = documentIndex(page).locator(':scope > ol');
  await expect
    .poll(() => list.evaluate(element => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(
    documentIndex(page).getByRole('link', {
      name: 'Tall page 25',
      exact: true,
    }),
  ).toBeInViewport({ ratio: 1 });
});

test('the current page stays centered when the viewport gets shorter', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/document-index-tall-tests/page-20.html');
  await waitForClientMount(page);
  await page.setViewportSize({ width: 1280, height: 500 });

  const list = documentIndex(page).locator(':scope > ol');
  const current = documentIndex(page).getByRole('link', {
    name: 'Tall page 20',
    exact: true,
  });
  // Geometry is the behavior under test: the entry's center is within about
  // one entry of the list's center
  await expect
    .poll(async () => {
      const listBox = (await list.boundingBox())!;
      const linkBox = (await current.boundingBox())!;
      return Math.abs(
        linkBox.y + linkBox.height / 2 - (listBox.y + listBox.height / 2),
      );
    })
    .toBeLessThanOrEqual(30);
});

test('a wider viewport keeps where the reader scrolled the index', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/document-index-tall-tests/page-20.html');
  await waitForClientMount(page);
  const list = documentIndex(page).locator(':scope > ol');
  // The client centers the entry once after mounting; scroll after that
  await expect
    .poll(() => list.evaluate(element => element.scrollTop))
    .toBeGreaterThan(0);
  await list.evaluate(element => element.scrollTo({ top: 0 }));
  await page.setViewportSize({ width: 430, height: 800 });
  // Let a resize observer run before checking that nothing moved
  await page.evaluate(
    () =>
      new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve))),
  );
  expect(await list.evaluate(element => element.scrollTop)).toBe(0);
});

test('presenting slides hides document navigation', async ({ page }) => {
  await page.goto('/labs/02/index.html');
  await page.getByRole('checkbox', { name: 'Full screen' }).uncheck();
  await expect(pagination(page)).toBeVisible();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(pagination(page)).toBeHidden();
  await expect(documentIndex(page)).toBeHidden();
});

test('search results name the document a page belongs to', async ({ page }) => {
  await page.goto('/index.html');
  const search = page.locator('input.quick-search');
  await expect(search).toBeEnabled();
  await search.fill('Counting vowels');
  const result = page
    .locator('a.result')
    .filter({ hasText: 'Counting vowels' })
    .first();
  await expect(result.locator('.document-context')).toHaveText('Labs ›');
  await expect(result).toHaveAccessibleName(/^Labs › Counting vowels/);

  await search.fill('Labs');
  const root = page
    .locator('a.result')
    .filter({ has: page.locator('.title', { hasText: /^Labs$/ }) })
    .first();
  await expect(root).toHaveAttribute('href', /\/labs\/index\.html(\?|$)/);
  await expect(root.locator('.document-context')).toHaveCount(0);
});

test('code page results keep their template and document', async ({ page }) => {
  await page.goto('/index.html');
  const search = page.locator('input.quick-search');
  await expect(search).toBeEnabled();
  await search.fill('TraceDemo');
  const result = page
    .locator('a.result')
    .filter({
      has: page.locator('.title.code-page', { hasText: 'TraceDemo.java' }),
    })
    .first();
  await expect(result).toHaveAttribute('data-tada-page', '');
  await expect(result.locator('.document-context')).toHaveText('Labs ›');
});
