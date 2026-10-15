import { test, expect, type Page } from './test-fixtures';
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

test('sits beside the body on wide screens and above it on narrow ones', async ({
  page,
}) => {
  for (const [width, beside] of [
    [1280, true],
    [390, false],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/labs/00/index.html');
    const index = await documentIndex(page).boundingBox();
    const body = await page.locator('main.body').boundingBox();
    expect(index).not.toBeNull();
    expect(body).not.toBeNull();
    if (beside) {
      expect(index!.x + index!.width).toBeLessThanOrEqual(body!.x);
    } else {
      expect(index!.y + index!.height).toBeLessThanOrEqual(body!.y);
    }
  }
});

test('narrow code pages keep the index but hide their TOC', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/document-index-tests/Example.java.html');
  await expect(documentIndex(page)).toBeVisible();
  await expect(page.locator('nav.toc')).toBeHidden();
  await expect(
    page.getByRole('navigation', { name: 'Breadcrumb', exact: true }),
  ).toBeVisible();
});

test('the index scrolls away while the TOC stays under the header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/document-index-tests/long.html');
  const index = documentIndex(page);
  const toc = page.locator('nav.toc');
  const indexBox = await index.boundingBox();
  expect(indexBox).not.toBeNull();

  await page.evaluate(
    y => window.scrollTo(0, y),
    indexBox!.y + indexBox!.height + 200,
  );
  const header = await page.locator('body > header').boundingBox();
  await expect(index).not.toBeInViewport();
  await expect(toc).toBeInViewport();
  const tocBox = await toc.boundingBox();
  expect(tocBox!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
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
