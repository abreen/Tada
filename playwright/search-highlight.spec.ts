import type { Page } from '@playwright/test';
import { test, expect, visitorScrollBy } from './test-fixtures';

const REMAINDER_URL = '/markdown.html?pagefind-highlight=remainder';

test('highlights search terms and opens the tab that contains them', async ({
  page,
}) => {
  await page.goto('/tabs.html?pagefind-highlight=Ferris');
  const mark = page.locator('mark.search-highlight');
  await expect(mark).toHaveText('Ferris');
  await expect(page.getByRole('tab', { name: 'Rust' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(mark).toBeVisible();
  await expect(mark).toBeInViewport();
  await expect(page).toHaveURL(/\?pagefind-highlight=Ferris$/);
});

test('leaves pages without search terms unhighlighted', async ({ page }) => {
  await page.goto('/tabs.html');
  await expect(page.getByRole('tab', { name: 'Java' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('mark.search-highlight')).toHaveCount(0);
});

for (const link of ['a.result', 'a.sub-result'] as const) {
  test(`a search result (${link}) opens the hidden tab with the match highlighted`, async ({
    page,
  }) => {
    await page.goto('/index.html');
    const input = page.locator('input.quick-search');
    await input.focus();
    await input.fill('remainder');
    const result = page.locator(link).first();
    await expect(result).toHaveAttribute(
      'href',
      /markdown\.html\?pagefind-highlight=remainder/,
    );
    await result.click();

    await expect(page).toHaveURL(
      /markdown\.html\?pagefind-highlight=remainder/,
    );
    await expect(page.getByRole('tab', { name: 'Prose' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const mark = page.locator('mark.search-highlight', {
      hasText: 'remainder',
    });
    await expect(mark).toBeVisible();
    await expect(mark).toBeInViewport();
  });
}

async function scrollToTop(page: Page) {
  // Like a visitor; one wheel event may not get there
  let top: number;
  do {
    top = await visitorScrollBy(page, -100_000);
  } while (top > 0);
}

test('keeps the restored scroll position on Back', async ({ page }) => {
  await page.goto(REMAINDER_URL);
  const mark = page.locator('mark.search-highlight', { hasText: 'remainder' });
  await expect(mark).toBeInViewport();
  await scrollToTop(page);

  await page.evaluate(() =>
    document
      .querySelector<HTMLAnchorElement>('main.body a[href$="index.html"]')!
      .click(),
  );
  await expect(page).toHaveURL(/\/index\.html$/);
  await page.goBack();

  await expect(page).toHaveURL(REMAINDER_URL);
  // The highlight is revealed again, but the page stays where it was
  await expect(page.getByRole('tab', { name: 'Prose' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(mark).toHaveAttribute('data-sweep');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(mark).not.toBeInViewport();
});

test('scrolls to the highlight again on reload', async ({ page }) => {
  await page.goto(REMAINDER_URL);
  const mark = page.locator('mark.search-highlight', { hasText: 'remainder' });
  await expect(mark).toBeInViewport();
  await scrollToTop(page);

  // Reloads keep no scroll position, so the page would otherwise open at the
  // top with the highlight out of view
  await page.reload();
  await expect(mark).toBeInViewport();
});

test('keeps the position a dev server refresh restores', async ({ page }) => {
  await page.goto(REMAINDER_URL);
  const mark = page.locator('mark.search-highlight', { hasText: 'remainder' });
  await expect(mark).toBeInViewport();
  await scrollToTop(page);

  // Like the watch-mode reload client, which turns the browser's scroll
  // restoration back on, then reloads. (Playwright's own reload is not a
  // reload navigation in Firefox.)
  const reloaded = page.waitForEvent('load');
  await page.evaluate(() => {
    window.history.scrollRestoration = 'auto';
    window.setTimeout(() => window.location.reload());
  });
  await reloaded;
  await expect(mark).toHaveAttribute('data-sweep');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(mark).not.toBeInViewport();
});

test('keeps the tab with the link target selected', async ({ page }) => {
  // The only match is in a sibling tab of the target
  await page.goto('/tabs.html?pagefind-highlight=Ferris#python-details');
  await expect(page.getByRole('tab', { name: 'Python' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('heading', { name: 'Python details' }),
  ).toBeVisible();
  await expect(page.locator('mark.search-highlight')).toHaveText('Ferris');
  await expect(page.getByRole('tab', { name: 'Rust' })).toHaveAttribute(
    'aria-selected',
    'false',
  );
});
