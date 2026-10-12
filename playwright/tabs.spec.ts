import { test, expect, visitorScrollBy } from './test-fixtures';

test('exposes tabs with WAI-ARIA roles and states', async ({ page }) => {
  await page.goto('/tabs.html');
  const tablist = page.getByRole('tablist');
  await expect(tablist).toBeVisible();
  const tabs = tablist.getByRole('tab');
  await expect(tabs).toHaveText(['Java', 'Python', 'Rust']);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'false');
  await expect(tabs.nth(0)).toBeEnabled();

  const panel = page.getByRole('tabpanel', { name: 'Java' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Java content');
  // Check the panel, not its text: WebKit reports layout boxes for text inside
  // a content-visibility: hidden (until-found) panel, though none is painted
  await expect(page.locator('#tabs-1-panel-2')).toBeHidden();
  await expect(page.locator('.tabs-panel-label')).toHaveCount(3);
  await expect(page.locator('.tabs-panel-label').first()).toBeHidden();
});

test('clicking a tab shows its panel', async ({ page }) => {
  await page.goto('/tabs.html');
  await page.getByRole('tab', { name: 'Python' }).click();
  await expect(page.getByRole('tab', { name: 'Python' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tabpanel', { name: 'Python' })).toBeVisible();
  await expect(page.locator('#tabs-1-panel-1')).toBeHidden();
});

test('the selection indicator moves to the selected tab', async ({ page }) => {
  await page.goto('/tabs.html');
  const indicator = page.locator('#tabs-1 .tabs-indicator');
  // Waits out the slide between tabs
  const coversTab = async (name: string) => {
    const tab = await page.getByRole('tab', { name }).boundingBox();
    const box = await indicator.boundingBox();
    return (
      tab != null &&
      box != null &&
      Math.abs(tab.x - box.x) < 1 &&
      Math.abs(tab.width - box.width) < 1
    );
  };

  await expect(indicator).toHaveAttribute('aria-hidden', 'true');
  await expect.poll(() => coversTab('Java')).toBe(true);
  await page.getByRole('tab', { name: 'Rust' }).click();
  await expect.poll(() => coversTab('Rust')).toBe(true);
});

test('the panel box resizes smoothly to the selected panel', async ({
  page,
}) => {
  await page.goto('/tabs.html');
  // A disabled tab ignores a script's click
  await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');
  const panels = page.locator('#tabs-1 > .tabs-panels');
  const before = (await panels.boundingBox())!.height;

  // Rust's panel is taller than Java's
  const animating = await page.evaluate(() => {
    document.querySelector<HTMLElement>('#tabs-1-tab-3')!.click();
    return document.querySelector('#tabs-1 > .tabs-panels')!.getAnimations()
      .length;
  });
  expect(animating).toBe(1);

  // Afterward, the box holds the whole panel and nothing is left clipped
  await expect
    .poll(() => panels.evaluate(element => element.getAnimations().length))
    .toBe(0);
  const box = (await panels.boundingBox())!;
  const last = (await page
    .getByText('Ferris is the Rust mascot.')
    .boundingBox())!;
  expect(box.height).toBeGreaterThan(before);
  expect(last.y + last.height).toBeLessThanOrEqual(box.y + box.height);
  await expect(panels).not.toHaveAttribute('style', /overflow/);
});

test('panels crossfade, and the old one is inert until hidden', async ({
  page,
}) => {
  await page.goto('/tabs.html');
  // A disabled tab ignores a script's click
  await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');
  const oldPanel = page.locator('#tabs-1-panel-1');

  const fading = await page.evaluate(() => {
    document.querySelector<HTMLElement>('#tabs-1-tab-2')!.click();
    const old = document.querySelector<HTMLElement>('#tabs-1-panel-1')!;
    const next = document.querySelector<HTMLElement>('#tabs-1-panel-2')!;
    return {
      oldHidden: old.hasAttribute('hidden'),
      oldInert: old.inert,
      oldAnimations: old.getAnimations().length,
      newAnimations: next.getAnimations().length,
    };
  });
  expect(fading).toEqual({
    oldHidden: false,
    oldInert: true,
    oldAnimations: 1,
    newAnimations: 1,
  });
  await expect(page.getByRole('tabpanel', { name: 'Python' })).toBeVisible();

  await expect(oldPanel).toBeHidden();
  await expect(oldPanel).toHaveAttribute('hidden', 'until-found');
  expect(await oldPanel.evaluate(panel => panel.inert)).toBe(false);
});

test('nothing animates with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tabs.html');
  await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');
  const animating = await page.evaluate(() => {
    document.querySelector<HTMLElement>('#tabs-1-tab-3')!.click();
    return {
      box: document.querySelector('#tabs-1 > .tabs-panels')!.getAnimations()
        .length,
      oldHidden: document
        .querySelector('#tabs-1-panel-1')!
        .hasAttribute('hidden'),
    };
  });
  expect(animating).toEqual({ box: 0, oldHidden: true });
  await expect(page.getByText('Ferris is the Rust mascot.')).toBeVisible();
});

test('arrow, Home, and End keys move selection and focus', async ({ page }) => {
  await page.goto('/tabs.html');
  const java = page.getByRole('tab', { name: 'Java' });
  const python = page.getByRole('tab', { name: 'Python' });
  const rust = page.getByRole('tab', { name: 'Rust' });

  await java.focus();
  await page.keyboard.press('ArrowRight');
  await expect(python).toBeFocused();
  await expect(python).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Python content.')).toBeVisible();

  await page.keyboard.press('End');
  await expect(rust).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(java).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(rust).toBeFocused();
  await page.keyboard.press('Home');
  await expect(java).toBeFocused();
  await expect(java).toHaveAttribute('aria-selected', 'true');
});

test('Tab moves from the selected tab into its panel', async ({ page }) => {
  await page.goto('/tabs.html');
  const python = page.getByRole('tab', { name: 'Python' });
  await python.click();
  await expect(python).toHaveAttribute('tabindex', '0');
  await expect(page.getByRole('tab', { name: 'Java' })).toHaveAttribute(
    'tabindex',
    '-1',
  );

  await page.getByRole('link', { name: 'Link to the Python heading' }).focus();
  await page.keyboard.press('Tab');
  await expect(python).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tabpanel', { name: 'Python' })).toBeFocused();
});

test('a URL hash inside an inactive tab selects that tab', async ({ page }) => {
  await page.goto('/tabs.html#python-details');
  await expect(page.getByRole('tab', { name: 'Python' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('heading', { name: 'Python details' }),
  ).toBeInViewport();
});

test('an in-page link into an inactive tab selects that tab', async ({
  page,
}) => {
  await page.goto('/tabs.html');
  await page.getByRole('link', { name: 'Link to the Python heading' }).click();
  await expect(page).toHaveURL(/#python-details$/);
  await expect(page.getByRole('tab', { name: 'Python' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('heading', { name: 'Python details' }),
  ).toBeVisible();
});

test('a link to the current fragment selects its tab again', async ({
  page,
}) => {
  await page.goto('/tabs.html');
  const link = page.getByRole('link', { name: 'Link to the Python heading' });
  await link.click();
  await expect(page).toHaveURL(/#python-details$/);
  await page.getByRole('tab', { name: 'Java' }).click();
  await expect(page.getByRole('tab', { name: 'Python' })).toHaveAttribute(
    'aria-selected',
    'false',
  );

  await link.click();
  await expect(page.getByRole('tab', { name: 'Python' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('heading', { name: 'Python details' }),
  ).toBeInViewport();
});

test('Back keeps the restored scroll position when the fragment is in a tab', async ({
  page,
}) => {
  await page.goto('/tabs.html#python-details');
  const heading = page.getByRole('heading', { name: 'Python details' });
  await expect(heading).toBeInViewport();
  // Back to the top like a visitor; one wheel event may not get there
  let top: number;
  do {
    top = await visitorScrollBy(page, -100_000);
  } while (top > 0);

  await page.evaluate(() =>
    document
      .querySelector<HTMLAnchorElement>('main.body a[href$="questions.html"]')!
      .click(),
  );
  await expect(page).toHaveURL(/\/questions\.html$/);
  await page.goBack();

  await expect(page).toHaveURL(/\/tabs\.html#python-details$/);
  await expect(page.getByRole('tab', { name: 'Python' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(heading).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(heading).not.toBeInViewport();
});

test('shows every panel with its label without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/tabs.html');
    await expect(page.locator('.tabs-list')).toBeHidden();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.locator('.tabs-panel-label')).toHaveText([
      'Java',
      'Python',
      'Rust',
    ]);
    for (const text of ['Java content', 'Python content.', 'Rust content.']) {
      await expect(page.getByText(text)).toBeVisible();
    }
  } finally {
    await context.close();
  }
});
