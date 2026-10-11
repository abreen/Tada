import { test, expect } from './test-fixtures';
import type { Page } from '@playwright/test';

interface ModuleCounts {
  evaluations: number;
  mounts: number;
  pings: number;
  aborts: number;
  cleanups: number;
}

function counts(page: Page): Promise<ModuleCounts> {
  return page.evaluate(
    () => (window as unknown as { moduleCounts: ModuleCounts }).moduleCounts,
  );
}

function mountOrder(page: Page): Promise<string[] | undefined> {
  return page.evaluate(
    () => (window as unknown as { mountOrder?: string[] }).mountOrder,
  );
}

test.describe('scripts from src/', () => {
  test('mount on a cold load, site-wide scripts first', async ({ page }) => {
    await page.goto('/author-modules.html');

    await expect(page.locator('#module-marker')).toHaveText(
      'mounted 1, evaluated 1',
    );
    await expect(page.locator('#delayed-marker')).toHaveText(
      'delayed mount finished',
    );
    expect(await mountOrder(page)).toEqual(['site-wide', 'counter']);
  });

  test('mount on every arrival and unmount on leaving, without reloading', async ({
    page,
  }) => {
    await page.goto('/author-modules-start.html');
    await page.evaluate(() => {
      (window as unknown as { sameWindow: boolean }).sameWindow = true;
    });

    await page
      .getByRole('link', { name: 'Go to the author modules page' })
      .click();
    await expect(page).toHaveURL(/\/author-modules\.html$/);
    await expect(page.locator('#module-marker')).toHaveText(
      'mounted 1, evaluated 1',
    );

    await page.evaluate(() => window.dispatchEvent(new Event('module-ping')));
    expect((await counts(page)).pings).toBe(1);

    await page.getByRole('link', { name: 'Back to the start page' }).click();
    await expect(page).toHaveURL(/\/author-modules-start\.html$/);
    await expect
      .poll(() => counts(page))
      .toMatchObject({ aborts: 1, cleanups: 1 });

    // The listener added with the signal was removed on leaving
    await page.evaluate(() => window.dispatchEvent(new Event('module-ping')));
    expect((await counts(page)).pings).toBe(1);

    await page
      .getByRole('link', { name: 'Go to the author modules page' })
      .click();
    await expect(page).toHaveURL(/\/author-modules\.html$/);
    // The module is evaluated once; its default export runs on each arrival
    await expect(page.locator('#module-marker')).toHaveText(
      'mounted 2, evaluated 1',
    );
    await expect(page.locator('#delayed-marker')).toHaveText(
      'delayed mount finished',
    );

    expect(
      await page.evaluate(
        () => (window as unknown as { sameWindow?: boolean }).sameWindow,
      ),
    ).toBe(true);
  });

  test('site-wide scripts mount on pages that list no scripts', async ({
    page,
  }) => {
    await page.goto('/author-modules-start.html');
    await expect(page.locator('html')).toHaveAttribute(
      'data-site-wide-mounted',
      'true',
    );
  });

  test("a page's stylesheets apply only while it is shown", async ({
    page,
  }) => {
    const authorStyles = page.locator('head link[data-tada-style]');

    await page.goto('/author-modules-start.html');
    await expect(authorStyles).toHaveCount(0);

    await page
      .getByRole('link', { name: 'Go to the author modules page' })
      .click();
    await expect(page).toHaveURL(/\/author-modules\.html$/);
    await expect(authorStyles).toHaveCount(1);

    await page.getByRole('link', { name: 'Back to the start page' }).click();
    await expect(page).toHaveURL(/\/author-modules-start\.html$/);
    await expect(authorStyles).toHaveCount(0);
  });

  test("a page's stylesheets have loaded when its content is shown", async ({
    page,
  }) => {
    // A slow stylesheet would otherwise apply after the new content appears
    await page.route('**/_scripts/modules/styled*.css', async route => {
      await new Promise(resolve => setTimeout(resolve, 800));
      await route.continue();
    });
    await page.goto('/author-modules-start.html');
    await page.evaluate(() => {
      const w = window as unknown as { stylesReadyAtSwap?: boolean };
      const container = document.querySelector('.container')!;
      new MutationObserver((_, observer) => {
        if (!document.getElementById('module-marker')) {
          return;
        }
        observer.disconnect();
        const links = [
          ...document.querySelectorAll<HTMLLinkElement>(
            'head link[data-tada-style]',
          ),
        ];
        w.stylesReadyAtSwap =
          links.length > 0 &&
          links.every(link => link.sheet !== null && !link.media);
      }).observe(container, { childList: true, subtree: true });
    });

    await page
      .getByRole('link', { name: 'Go to the author modules page' })
      .click();
    await expect(page).toHaveURL(/\/author-modules\.html$/);
    await expect(page.locator('#module-marker')).toBeAttached();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { stylesReadyAtSwap?: boolean })
            .stylesReadyAtSwap,
      ),
    ).toBe(true);
  });

  test('a stylesheet that never loads does not stop navigation', async ({
    page,
  }) => {
    await page.route('**/_scripts/modules/styled*.css', () => {
      // Never respond
    });
    await page.goto('/author-modules-start.html');
    await page
      .getByRole('link', { name: 'Go to the author modules page' })
      .click();

    await expect(page).toHaveURL(/\/author-modules\.html$/, {
      timeout: 10_000,
    });
    await expect(page.locator('#module-marker')).toHaveText(
      'mounted 1, evaluated 1',
    );
  });

  test('a navigation started again still waits for its stylesheets', async ({
    page,
  }) => {
    await page.route('**/_scripts/modules/styled*.css', async route => {
      await new Promise(resolve => setTimeout(resolve, 800));
      await route.continue();
    });
    await page.goto('/author-modules-start.html');
    await page.evaluate(() => {
      const w = window as unknown as { stylesReadyAtSwap?: boolean };
      new MutationObserver((_, observer) => {
        if (!document.getElementById('module-marker')) {
          return;
        }
        observer.disconnect();
        const links = [
          ...document.querySelectorAll<HTMLLinkElement>(
            'head link[data-tada-style]',
          ),
        ];
        w.stylesReadyAtSwap =
          links.length > 0 &&
          links.every(link => link.sheet !== null && !link.media);
      }).observe(document.querySelector('.container')!, {
        childList: true,
        subtree: true,
      });
    });

    // The second click abandons the first navigation while its stylesheet loads
    const link = page.getByRole('link', {
      name: 'Go to the author modules page',
    });
    await link.click();
    await expect(page.locator('head link[data-tada-style]')).toHaveCount(1);
    await link.click();

    await expect(page).toHaveURL(/\/author-modules\.html$/);
    await expect(page.locator('#module-marker')).toBeAttached();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { stylesReadyAtSwap?: boolean })
            .stylesReadyAtSwap,
      ),
    ).toBe(true);
    await expect(page.locator('head link[data-tada-style]')).toHaveCount(1);
  });

  test('without JS, the page shows its build-time content', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/author-modules.html');

    await expect(page.locator('#module-marker')).toHaveText(
      'rendered without JavaScript',
    );
    await expect(page.locator('#delayed-marker')).toHaveText(
      'delayed mount pending',
    );

    await context.close();
  });
});
