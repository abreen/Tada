import { test, expect, waitForClientMount } from './test-fixtures';
import type { Page } from './test-fixtures';

interface ChooserAtSwap {
  value: string;
  disabled: boolean;
  time: string;
}

type SwapTestWindow = Window & { choosersAtSwap: ChooserAtSwap[] };

async function followNavLink(page: Page, href: string) {
  await page.locator('header details > summary').click();
  await page.locator(`header details nav a[href="${href}"]`).click();
}

// The starter content's Lectures page lists src/lectures/timezone.ts in its
// front matter, an example of a script compiled with the site. Its renderer,
// src/lectures/timezone.render.ts, writes the chooser at build time.
test.describe('starter time zone example', () => {
  test('without JS, the chooser shows the default zone, disabled', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/lectures/index.html');

    const select = page.getByLabel('Show times in');
    await expect(select).toBeVisible();
    await expect(select).toBeDisabled();
    await expect(select).toHaveValue('America/New_York');
    await expect(page.locator('time[datetime="17:40"]')).toHaveText('5:40 PM');
    expect(await page.locator('body').innerText()).toContain(
      'Times shown in ET',
    );

    await context.close();
  });

  test('converts times and keeps the choice after client-side navigation', async ({
    page,
  }) => {
    await page.goto('/index.html');
    await page.locator('header details > summary').click();
    await page
      .locator('header details nav a[href="/lectures/index.html"]')
      .click();
    await expect(page).toHaveURL(/lectures\/index\.html/);

    const select = page.getByLabel('Show times in');
    const time = page.locator('time[datetime="17:40"]');
    await expect(select).toBeEnabled();

    await select.selectOption('UTC');
    await expect(time).toContainText('UTC');
    await expect(time).toHaveAttribute('title', /^5:40 PM /);

    await page.reload();
    await expect(page.getByLabel('Show times in')).toHaveValue('UTC');
    await expect(time).toContainText('UTC');

    await page.getByLabel('Show times in').selectOption('America/New_York');
    await expect(time).toHaveText('5:40 PM');
    await expect(time).not.toHaveAttribute('title');
  });

  test('does not show the no-JS note after client-side navigation', async ({
    page,
  }) => {
    await page.goto('/index.html');
    await waitForClientMount(page);
    await followNavLink(page, '/lectures/index.html');
    await expect(page.getByLabel('Show times in')).toBeEnabled();

    expect(await page.locator('body').innerText()).not.toContain(
      'Times shown in ET',
    );
  });

  test('the chooser still works after navigating away and back', async ({
    page,
  }) => {
    await page.goto('/lectures/index.html');
    const time = page.locator('time[datetime="17:40"]');

    await page.locator('header details > summary').click();
    await page.locator('header details nav a[href="/index.html"]').click();
    await expect(page).toHaveURL(/\/index\.html$/);
    await page.locator('header details > summary').click();
    await page
      .locator('header details nav a[href="/lectures/index.html"]')
      .click();
    await expect(page).toHaveURL(/lectures\/index\.html/);

    const select = page.getByLabel('Show times in');
    await expect(select).toBeEnabled();
    await select.selectOption('UTC');
    await expect(time).toContainText('UTC');
  });

  test('shows the stored choice as soon as the page is swapped in', async ({
    page,
  }) => {
    await page.goto('/index.html');
    await waitForClientMount(page);
    await page.evaluate(() => {
      localStorage.setItem('timeZone', 'UTC');
      const state = window as SwapTestWindow;
      state.choosersAtSwap = [];
      // Runs right after the content is swapped in, before the view
      // transition's new snapshot and before any mount function
      new MutationObserver(records => {
        const select =
          document.querySelector<HTMLSelectElement>('tz-chooser select');
        const swapped = records.some(
          record => record.addedNodes.length && record.removedNodes.length,
        );
        if (select && swapped) {
          state.choosersAtSwap.push({
            value: select.value,
            disabled: select.disabled,
            time:
              document.querySelector('time[datetime="17:40"]')?.textContent ??
              '',
          });
        }
      }).observe(document.querySelector('.container')!, { childList: true });
    });

    // The first arrival loads the script; the second reuses it
    await followNavLink(page, '/lectures/index.html');
    await expect(page.getByLabel('Show times in')).toBeEnabled();
    await followNavLink(page, '/index.html');
    await expect(page).toHaveURL(/\/index\.html$/);
    await followNavLink(page, '/lectures/index.html');
    await expect(page.getByLabel('Show times in')).toHaveValue('UTC');

    const choosers = await page.evaluate(
      () => (window as SwapTestWindow).choosersAtSwap,
    );
    expect(choosers).toHaveLength(2);
    for (const chooser of choosers) {
      expect(chooser.value).toBe('UTC');
      expect(chooser.disabled).toBe(false);
      expect(chooser.time).toContain('UTC');
    }
  });
});
