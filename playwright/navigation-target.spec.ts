import { test, expect, waitForClientMount, type Page } from './test-fixtures';

const CODE_PAGE = '/lectures/01/Rectangle.java.html';

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

// Select a line, then scroll away from it so restoring the entry's saved
// scroll position is distinguishable from scrolling to the target.
async function selectLineAndScrollAway(page: Page): Promise<number> {
  await page.goto(CODE_PAGE);
  await waitForClientMount(page);
  await page.locator('#L30').click();
  await expect(page).toHaveURL(/#L30$/);
  await expect(page.locator(':target')).toHaveId('L30');
  const targetScroll = await scrollY(page);
  await page.evaluate(() => window.scrollBy({ top: 200 }));
  await expect.poll(() => scrollY(page)).toBeCloseTo(targetScroll + 200, -1);
  return scrollY(page);
}

async function goToOtherPage(page: Page) {
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/markdown.html';
    link.setAttribute('data-tada-page', '');
    link.textContent = 'Other page';
    link.id = 'other-page-link';
    link.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:1000';
    document.body.appendChild(link);
  });
  await page.locator('#other-page-link').click();
  await expect(page).toHaveURL(/\/markdown\.html$/);
  await expect(page.locator('h1')).toContainText('Markdown Examples');
}

async function expectRestoredLine(page: Page, savedScroll: number) {
  await expect(page).toHaveURL(/Rectangle\.java\.html#L30$/);
  await expect(page.locator(':target')).toHaveId('L30');
  await expect.poll(() => scrollY(page)).toBeCloseTo(savedScroll, -1);
}

test('back and forward across pages restore the line target', async ({
  page,
}) => {
  const savedScroll = await selectLineAndScrollAway(page);
  await goToOtherPage(page);
  await expect(page.locator(':target')).toHaveCount(0);

  await page.goBack();
  await expectRestoredLine(page, savedScroll);

  await page.goForward();
  await expect(page).toHaveURL(/\/markdown\.html$/);
  await expect(page.locator(':target')).toHaveCount(0);

  await page.goBack();
  await expectRestoredLine(page, savedScroll);
});

test('back across pages keeps the saved scroll when the page adds a stylesheet', async ({
  page,
}) => {
  const savedScroll = await selectLineAndScrollAway(page);
  // As after a rebuild between visits, the restored page links a stylesheet
  // the document does not have yet, and it loads slowly.
  await page.route(`**${CODE_PAGE}`, async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      '</head>',
      '<link href="/late.css" rel="stylesheet"></head>',
    );
    await route.fulfill({ response, body });
  });
  await page.route('**/late.css', async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ contentType: 'text/css', body: '' });
  });
  await goToOtherPage(page);

  await page.goBack();
  await expectRestoredLine(page, savedScroll);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.styleSheets).some(sheet =>
          sheet.href?.endsWith('/late.css'),
        ),
      ),
    )
    .toBe(true);
  // Let any scrolling that waited for the stylesheet run
  await page.evaluate(
    () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(await scrollY(page)).toBeCloseTo(savedScroll, -1);
});

test('page update refresh keeps the line target', async ({ page }) => {
  const savedScroll = await selectLineAndScrollAway(page);
  // Report a different Last-Modified on every check so the update toast shows
  let version = 0;
  await page.route(`**${CODE_PAGE}`, async route => {
    if (route.request().method() !== 'HEAD') {
      return route.fallback();
    }
    version++;
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'last-modified': new Date(
          Date.UTC(2030, 0, 1, 0, 0, version),
        ).toUTCString(),
      },
    });
  });
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  await page.locator('#L30').evaluate(el => {
    el.dataset.beforeRefresh = '';
  });

  const reload = page.getByRole('button', { name: 'Reload' });
  await reload.click();
  await expect(reload).toBeHidden();
  await expect(page.locator('#L30[data-before-refresh]')).toHaveCount(0);
  await expectRestoredLine(page, savedScroll);
});

test('back across pages keeps the saved scroll while an earlier stylesheet loads', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${CODE_PAGE}#L30`);
  await waitForClientMount(page);
  await expect(page.locator(':target')).toHaveId('L30');
  await page.evaluate(() => window.scrollBy({ top: 200 }));
  const savedScroll = await scrollY(page);

  // The other page starts loading a stylesheet that is still pending on Back
  let releaseStylesheet = () => {};
  const stylesheetReleased = new Promise<void>(resolve => {
    releaseStylesheet = resolve;
  });
  await page.route('**/markdown.html', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      '</head>',
      '<link href="/slow.css" rel="stylesheet"></head>',
    );
    await route.fulfill({ response, body });
  });
  await page.route('**/slow.css', async route => {
    await stylesheetReleased;
    await route.fulfill({ contentType: 'text/css', body: '' });
  });
  await goToOtherPage(page);

  await page.goBack();
  await expect(page).toHaveURL(/Rectangle\.java\.html#L30$/);
  await expect.poll(() => scrollY(page)).toBeCloseTo(savedScroll, -1);
  releaseStylesheet();
  await expectRestoredLine(page, savedScroll);
  // Let any scrolling that waited for the stylesheet run
  await page.evaluate(
    () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(await scrollY(page)).toBeCloseTo(savedScroll, -1);
});

test('back across pages restores a legacy named anchor target', async ({
  page,
}) => {
  await page.route(`**${CODE_PAGE}`, async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      '<pre',
      '<a name="legacy-target">Legacy target</a><pre',
    );
    await route.fulfill({ response, body });
  });
  await page.goto(`${CODE_PAGE}#legacy-target`);
  await waitForClientMount(page);
  const target = page.locator(':target');
  await expect(target).toHaveAttribute('name', 'legacy-target');

  await goToOtherPage(page);
  await expect(target).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/Rectangle\.java\.html#legacy-target$/);
  await expect(target).toHaveAttribute('name', 'legacy-target');
});
