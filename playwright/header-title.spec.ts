import { test, expect, type Page } from './test-fixtures';

type HeadingPosition =
  // The whole heading block (title, breadcrumbs, info) is under the header
  | 'past-heading'
  // Half of the h1 is under the header; the info below it is still visible
  | 'title-half-hidden'
  // The h1 sits just below the header
  | 'title-below-header';

async function scrollHeadingTo(page: Page, position: HeadingPosition) {
  await page.evaluate(position => {
    const block = document.querySelector('.title-and-info, .file-header')!;
    const title = block.querySelector('h1')!;
    const headerBottom = document
      .querySelector('header summary')!
      .getBoundingClientRect().bottom;
    const titleBox = title.getBoundingClientRect();
    const blockBottom = block.getBoundingClientRect().bottom;
    const offsets = {
      'past-heading': blockBottom - headerBottom + 20,
      'title-half-hidden': titleBox.top - headerBottom + titleBox.height / 2,
      'title-below-header': titleBox.top - headerBottom - 2,
    };
    window.scrollTo({ top: Math.max(0, window.scrollY + offsets[position]) });
  }, position);
}

// Persistent components mount in order during idle time after load; once the
// back-to-top link exists, the earlier header component has mounted too, so a
// scroll now rolls the title rather than setting it at mount
async function waitForHeaderMount(page: Page) {
  await expect(page.locator('#to-top-container a')).toHaveCount(1);
}

// Let any intersection updates for the current scroll position run
async function waitForFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

// Count title changes that start a roll (scrolling) rather than switching at
// once (navigation)
async function countTitleRolls(page: Page) {
  await page.evaluate(() => {
    const container = document.querySelector('header .header-title')!;
    const reel = container.querySelector('.header-title-reel')!;
    const scoped = window as Window & { __titleRolls?: number };
    scoped.__titleRolls = 0;
    new MutationObserver(() => {
      if (reel.getAnimations().length > 0) {
        scoped.__titleRolls! += 1;
      }
    }).observe(container, { attributes: true, attributeFilter: ['class'] });
  });
  return () =>
    page.evaluate(
      () => (window as Window & { __titleRolls?: number }).__titleRolls,
    );
}

async function clickInjectedLink(page: Page, href: string) {
  await page.evaluate(href => {
    const link = document.createElement('a');
    link.href = href;
    link.setAttribute('data-tada-page', '');
    link.id = 'header-title-test-link';
    link.textContent = 'Injected link';
    const main = document.querySelector('main.body')!;
    main.appendChild(link);
  }, href);
  // A real click would scroll the link into view; dispatch it in place
  await page.locator('#header-title-test-link').dispatchEvent('click');
}

test.describe('header title', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('rolls to the page title past the heading and back to the site title above the h1', async ({
    page,
  }) => {
    await page.goto('/markdown.html');
    await waitForHeaderMount(page);
    const title = page.locator('header .header-title');
    const rolls = await countTitleRolls(page);
    await expect(title).not.toHaveClass(/is-page-title/);

    await scrollHeadingTo(page, 'past-heading');
    await expect(title).toHaveClass(/is-page-title/);
    await expect(page.locator('header .header-page-title')).toHaveText(
      'Markdown Examples',
    );

    // Scrolling back up keeps the page title until the h1 clears the header
    await scrollHeadingTo(page, 'title-half-hidden');
    await waitForFrames(page);
    await expect(title).toHaveClass(/is-page-title/);

    await scrollHeadingTo(page, 'title-below-header');
    await expect(title).not.toHaveClass(/is-page-title/);

    // Scrolling down keeps the site title until the info also passes
    await scrollHeadingTo(page, 'title-half-hidden');
    await waitForFrames(page);
    await expect(title).not.toHaveClass(/is-page-title/);

    expect(await rolls()).toBe(2);
  });

  test('shows the file name on code pages', async ({ page }) => {
    await page.goto('/lectures/01/Rectangle.java.html');
    const title = page.locator('header .header-title');
    await expect(title).not.toHaveClass(/is-page-title/);

    await scrollHeadingTo(page, 'past-heading');
    await expect(title).toHaveClass(/is-page-title/);
    await expect(page.locator('header .header-page-title code')).toHaveText(
      'Rectangle.java',
    );
  });

  test('switches without rolling when navigation changes the title', async ({
    page,
  }) => {
    await page.goto('/markdown.html');
    const title = page.locator('header .header-title');
    const pageTitle = page.locator('header .header-page-title');
    await scrollHeadingTo(page, 'past-heading');
    await expect(title).toHaveClass(/is-page-title/);
    const rolls = await countTitleRolls(page);

    // The destination starts at the top, where its h1 is visible
    await clickInjectedLink(page, '/index.html');
    await expect(page).toHaveURL(/\/index\.html$/);
    await expect(title).not.toHaveClass(/is-page-title/);
    await expect(pageTitle).toHaveText(
      (await page.locator('.title-and-info h1').textContent())!.trim(),
    );

    // Back restores the earlier position past the heading
    await page.goBack();
    await expect(page).toHaveURL(/\/markdown\.html$/);
    await expect(title).toHaveClass(/is-page-title/);
    await expect(pageTitle).toHaveText('Markdown Examples');

    expect(await rolls()).toBe(0);
  });

  test('switches page titles without rolling between pages scrolled past their headings', async ({
    page,
  }) => {
    await page.goto('/markdown.html');
    const headingId = await page.evaluate(() => {
      const headings = document.querySelectorAll('main.body h2[id]');
      return headings[headings.length - 1]?.id ?? null;
    });
    expect(headingId).toBeTruthy();

    await page.goto('/lectures/01/Rectangle.java.html');
    const title = page.locator('header .header-title');
    await scrollHeadingTo(page, 'past-heading');
    await expect(title).toHaveClass(/is-page-title/);
    const rolls = await countTitleRolls(page);

    await clickInjectedLink(page, `/markdown.html#${headingId}`);
    await expect(page).toHaveURL(new RegExp(`markdown\\.html#${headingId}$`));
    await expect(page.locator('header .header-page-title')).toHaveText(
      'Markdown Examples',
    );
    await expect(title).toHaveClass(/is-page-title/);

    expect(await rolls()).toBe(0);
  });

  test('switches at once when the visitor prefers reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/markdown.html');
    await waitForHeaderMount(page);
    const title = page.locator('header .header-title');
    const rolls = await countTitleRolls(page);

    await scrollHeadingTo(page, 'past-heading');
    await expect(title).toHaveClass(/is-page-title/);
    expect(await rolls()).toBe(0);
  });
});

test.describe('header title without JavaScript', () => {
  test('shows only the site title', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/markdown.html');

    await expect(page.locator('header .site-title')).toBeVisible();
    await expect(page.locator('header .header-page-title')).toBeHidden();

    await scrollHeadingTo(page, 'past-heading');
    await expect(page.locator('header .header-page-title')).toBeHidden();
    await expect(page.locator('header .header-title')).not.toHaveClass(
      /is-page-title/,
    );

    await context.close();
  });
});
