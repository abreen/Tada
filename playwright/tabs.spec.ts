import { test, expect, visitorScrollBy, type Page } from './test-fixtures';

// Whether the indicator's drawn pieces, inside the ring around them, span the
// tab
const indicatorCovers = (page: Page, name: string) =>
  page.getByRole('tab', { name }).evaluate(tab => {
    const indicator = tab.parentElement!.querySelector('.tabs-indicator')!;
    const pieces = Array.from(indicator.children, piece =>
      piece.getBoundingClientRect(),
    );
    const ring = parseFloat(
      getComputedStyle(indicator.children[1]).borderTopWidth,
    );
    const left = Math.min(...pieces.map(piece => piece.left)) + ring;
    const right = Math.max(...pieces.map(piece => piece.right)) - ring;
    const top = Math.min(...pieces.map(piece => piece.top)) + ring;
    const bottom = Math.max(...pieces.map(piece => piece.bottom)) - ring;
    const box = tab.getBoundingClientRect();
    return (
      Math.abs(left - box.left) < 1 &&
      Math.abs(right - box.right) < 1 &&
      Math.abs(top - box.top) < 1 &&
      Math.abs(bottom - box.bottom) < 1
    );
  });

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
  await expect(indicator).toHaveAttribute('aria-hidden', 'true');
  // Polling waits out the slide between tabs
  await expect.poll(() => indicatorCovers(page, 'Java')).toBe(true);
  await page.getByRole('tab', { name: 'Rust' }).click();
  await expect.poll(() => indicatorCovers(page, 'Rust')).toBe(true);
});

test('arrow keys scroll the page to the newly focused tab', async ({
  page,
}) => {
  await page.goto('/tabs.html');
  await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');
  // The tabs are below the fold
  await page.evaluate(() => {
    document
      .querySelector<HTMLElement>('#tabs-1-tab-1')!
      .focus({ preventScroll: true });
    window.scrollTo(0, 0);
  });
  await page.keyboard.press('ArrowRight');
  const python = page.getByRole('tab', { name: 'Python' });
  await expect(python).toBeFocused();
  await expect(python).toBeInViewport();
});

// Whether the tab is entirely within the tab list's visible track
const tabInTrack = (page: Page, name: string) =>
  page.getByRole('tab', { name }).evaluate(tab => {
    const box = tab.getBoundingClientRect();
    const track = tab.parentElement!.getBoundingClientRect();
    return box.left >= track.left - 1 && box.right <= track.right + 1;
  });

test.describe('a tab list too wide for its box', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('stays on one row, with buttons that show the hidden tabs', async ({
    page,
  }) => {
    await page.goto('/tabs-many.html');
    await expect(page.locator('.tabs')).toHaveAttribute('data-mounted', '');
    const tops = await page
      .getByRole('tab')
      .evaluateAll(tabs =>
        tabs.map(tab => Math.round(tab.getBoundingClientRect().top)),
      );
    expect(new Set(tops).size).toBe(1);
    expect(await tabInTrack(page, 'Clojure')).toBe(false);

    const back = page.locator('.tabs-scroll-start');
    const forward = page.locator('.tabs-scroll-end');
    // Both stay shown, so the scrolling tabs keep their width
    await expect(back).toBeVisible();
    await expect(back).toBeDisabled();
    await expect(forward).toBeVisible();
    await expect(forward).toBeEnabled();

    // The buttons sit beside the scrolling tabs, never over them
    const list = (await page.getByRole('tablist').boundingBox())!;
    for (const button of [back, forward]) {
      const box = (await button.boundingBox())!;
      const overlaps =
        box.x < list.x + list.width && box.x + box.width > list.x;
      expect(overlaps).toBe(false);
    }

    // Until the end of the list is shown
    await expect
      .poll(async () => {
        if (await forward.isEnabled()) {
          await forward.click();
        }
        return tabInTrack(page, 'Clojure');
      })
      .toBe(true);
    await expect(forward).toBeDisabled();
    await expect(back).toBeEnabled();
    await page.getByRole('tab', { name: 'Clojure' }).click();
    await expect(page.getByRole('tab', { name: 'Clojure' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('the tabs never ask to scroll past either end', async ({ page }) => {
    // iOS Safari animates a smooth scroll past an end into its overscroll
    // area and stops there, instead of stopping at the end
    await page.addInitScript(() => {
      const requests: { left: number; max: number }[] = [];
      (window as unknown as { requests: typeof requests }).requests = requests;
      const { scrollTo, scrollBy } = Element.prototype;
      Element.prototype.scrollTo = function (
        this: Element,
        ...args: unknown[]
      ) {
        const options = args[0] as ScrollToOptions;
        requests.push({
          left: options.left ?? NaN,
          max: this.scrollWidth - this.clientWidth,
        });
        return scrollTo.apply(this, args as [ScrollToOptions]);
      };
      Element.prototype.scrollBy = function (
        this: Element,
        ...args: unknown[]
      ) {
        requests.push({ left: NaN, max: NaN });
        return scrollBy.apply(this, args as [ScrollToOptions]);
      };
    });
    await page.goto('/tabs-many.html');
    await expect(page.locator('.tabs')).toHaveAttribute('data-mounted', '');
    await page.getByRole('tab', { name: 'Java' }).focus();
    await page.keyboard.press('End');
    await expect.poll(() => tabInTrack(page, 'Clojure')).toBe(true);
    const back = page.locator('.tabs-scroll-start');
    await expect
      .poll(async () => {
        if (await back.isEnabled()) {
          await back.click();
        }
        return tabInTrack(page, 'Java');
      })
      .toBe(true);

    const requests = await page.evaluate(
      () =>
        (window as unknown as { requests: { left: number; max: number }[] })
          .requests,
    );
    expect(requests.length).toBeGreaterThan(0);
    const outside = requests.filter(
      request => !(request.left >= 0 && request.left <= request.max),
    );
    expect(outside).toEqual([]);
  });

  test('the selected tab stays in view when the track resizes', async ({
    page,
  }) => {
    await page.goto('/tabs-many.html');
    await expect(page.locator('.tabs')).toHaveAttribute('data-mounted', '');
    await page.getByRole('tab', { name: 'Java' }).focus();
    await page.keyboard.press('End');
    await expect.poll(() => tabInTrack(page, 'Clojure')).toBe(true);
    await expect.poll(() => indicatorCovers(page, 'Clojure')).toBe(true);

    // Narrower, as when a phone turns or a window shrinks
    await page.setViewportSize({ width: 320, height: 844 });
    await expect.poll(() => tabInTrack(page, 'Clojure')).toBe(true);
    await expect.poll(() => indicatorCovers(page, 'Clojure')).toBe(true);
  });

  test('Home shows the first tab even when it is already selected', async ({
    page,
  }) => {
    await page.goto('/tabs-many.html');
    await expect(page.locator('.tabs')).toHaveAttribute('data-mounted', '');
    await page.locator('.tabs-scroll-end').click();
    await expect.poll(() => tabInTrack(page, 'Java')).toBe(false);
    await page
      .getByRole('tab', { name: 'Java' })
      .evaluate(tab => (tab as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Home');
    await expect.poll(() => tabInTrack(page, 'Java')).toBe(true);
  });

  test('clicking a scroll button leaves focus where it was', async ({
    page,
  }) => {
    await page.goto('/tabs-many.html');
    await expect(page.locator('.tabs')).toHaveAttribute('data-mounted', '');
    // The buttons are hidden from assistive technology
    await page.locator('.tabs-scroll-end').click();
    await expect(page.locator('.tabs-scroll-end')).not.toBeFocused();
    expect(
      await page.evaluate(() => document.activeElement === document.body),
    ).toBe(true);
  });

  test('selecting a hidden tab scrolls it into view', async ({ page }) => {
    await page.goto('/tabs-many.html');
    await expect(page.locator('.tabs')).toHaveAttribute('data-mounted', '');
    await page.getByRole('tab', { name: 'Java' }).focus();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Clojure' })).toBeFocused();
    await expect.poll(() => tabInTrack(page, 'Clojure')).toBe(true);
    await expect.poll(() => indicatorCovers(page, 'Clojure')).toBe(true);
    await page.keyboard.press('Home');
    await expect.poll(() => tabInTrack(page, 'Java')).toBe(true);
  });
});

test('the panel box takes the selected panel height at once', async ({
  page,
}) => {
  await page.goto('/tabs.html');
  // A disabled tab ignores a script's click
  await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');
  const panels = page.locator('#tabs-1 > .tabs-panels');
  const before = (await panels.boundingBox())!.height;

  // Rust's panel is taller than Java's. Animating the box's height would lay
  // out the page on every frame, so it changes at once.
  const grow = await page.evaluate(() => {
    document.querySelector<HTMLElement>('#tabs-1-tab-3')!.click();
    const box = document.querySelector('#tabs-1 > .tabs-panels')!;
    const last = Array.from(document.querySelectorAll('#tabs-1-panel-3 p'))
      .at(-1)!
      .getBoundingClientRect();
    return {
      animations: box.getAnimations().length,
      height: box.getBoundingClientRect().height,
      fits: last.bottom <= box.getBoundingClientRect().bottom,
    };
  });
  expect(grow.animations).toBe(0);
  expect(grow.height).toBeGreaterThan(before);
  expect(grow.fits).toBe(true);
});

test('the selected panel replaces the old one at once', async ({ page }) => {
  await page.goto('/tabs.html');
  // A disabled tab ignores a script's click
  await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');

  const switched = await page.evaluate(() => {
    document.querySelector<HTMLElement>('#tabs-1-tab-2')!.click();
    return {
      oldHidden: document
        .querySelector('#tabs-1-panel-1')!
        .getAttribute('hidden'),
      animations: document
        .querySelector('#tabs-1 > .tabs-panels')!
        .getAnimations({ subtree: true }).length,
    };
  });
  expect(switched).toEqual({ oldHidden: 'until-found', animations: 0 });
  await expect(page.getByRole('tabpanel', { name: 'Python' })).toBeVisible();
  await expect(page.locator('#tabs-1-panel-1')).toBeHidden();
});

test('the indicator does not slide with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tabs.html');
  await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');
  const animations = await page.evaluate(() => {
    document.querySelector<HTMLElement>('#tabs-1-tab-3')!.click();
    return document
      .querySelector('#tabs-1 .tabs-indicator')!
      .getAnimations({ subtree: true }).length;
  });
  expect(animations).toBe(0);
  expect(await indicatorCovers(page, 'Rust')).toBe(true);
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

test.describe('dragging the selection indicator by touch', () => {
  test.use({ hasTouch: true });
  // Real touches, which honor touch-action, need Chromium's DevTools protocol
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'touch input uses CDP',
  );

  // The tabs are below the fold, and touches do not scroll them into view
  const centerOf = async (page: Page, name: string) => {
    const tab = page.getByRole('tab', { name });
    await tab.scrollIntoViewIfNeeded();
    const box = (await tab.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  // Puts a finger down at the start, then moves it through each point in steps
  const touch = async (page: Page, start: { x: number; y: number }) => {
    const cdp = await page.context().newCDPSession(page);
    let at = start;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [at],
    });
    return {
      async moveTo(to: { x: number; y: number }, steps = 8) {
        const from = at;
        for (let step = 1; step <= steps; step++) {
          at = {
            x: from.x + ((to.x - from.x) * step) / steps,
            y: from.y + ((to.y - from.y) * step) / steps,
          };
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [at],
          });
        }
      },
      async lift() {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
        await cdp.detach();
      },
    };
  };

  test('dragging the selected tab selects each tab the finger crosses', async ({
    page,
  }) => {
    await page.goto('/tabs.html');
    await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');
    const python = page.getByRole('tab', { name: 'Python' });
    const rust = page.getByRole('tab', { name: 'Rust' });

    const finger = await touch(page, await centerOf(page, 'Java'));
    await finger.moveTo(await centerOf(page, 'Python'));
    await expect(python).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Python' })).toBeVisible();

    await finger.moveTo(await centerOf(page, 'Rust'));
    await expect(rust).toHaveAttribute('aria-selected', 'true');
    await finger.lift();

    // Lifting the finger does not select the tab where the drag started
    await expect.poll(() => indicatorCovers(page, 'Rust')).toBe(true);
    await expect(rust).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Rust' })).toBeVisible();
  });

  test('pressing an unselected tab selects it, then drags', async ({
    page,
  }) => {
    await page.goto('/tabs.html');
    await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');
    const python = page.getByRole('tab', { name: 'Python' });
    const rust = page.getByRole('tab', { name: 'Rust' });

    const finger = await touch(page, await centerOf(page, 'Python'));
    await expect(python).toHaveAttribute('aria-selected', 'true');

    await finger.moveTo(await centerOf(page, 'Rust'));
    await expect(rust).toHaveAttribute('aria-selected', 'true');
    await finger.lift();
    await expect(rust).toHaveAttribute('aria-selected', 'true');
    // Safari draws a focus ring around a tab that script focuses
    await expect(page.getByRole('tab', { name: 'Java' })).not.toBeFocused();
    await expect(python).not.toBeFocused();
    await expect(rust).not.toBeFocused();
  });

  test('a press slides the indicator onto the tab, not the fingertip', async ({
    page,
  }) => {
    await page.goto('/tabs.html');
    await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');
    const python = page.getByRole('tab', { name: 'Python' });
    await python.scrollIntoViewIfNeeded();
    const box = (await python.boundingBox())!;

    // Near the tab's edge, so centering on the finger would miss the tab
    const finger = await touch(page, {
      x: box.x + 3,
      y: box.y + box.height / 2,
    });
    await expect.poll(() => indicatorCovers(page, 'Python')).toBe(true);
    // Lifting the finger leaves it there, without a second slide
    await finger.lift();
    const animations = await page
      .locator('#tabs-1 .tabs-indicator')
      .evaluate(indicator => indicator.getAnimations({ subtree: true }).length);
    expect(animations).toBe(0);
  });

  test.describe('in a tab list too wide for its box', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('holding the indicator at the edge scrolls on through the tabs', async ({
      page,
    }) => {
      await page.goto('/tabs-many.html');
      await expect(page.locator('.tabs')).toHaveAttribute('data-mounted', '');
      const java = await centerOf(page, 'Java');
      const track = (await page.getByRole('tablist').boundingBox())!;
      const scrollY = await page.evaluate(() => window.scrollY);

      const finger = await touch(page, java);
      await finger.moveTo({ x: track.x + track.width - 8, y: java.y });
      // The row keeps scrolling while the finger stays at its edge
      await expect(page.getByRole('tab', { name: 'Clojure' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await finger.lift();
      await expect.poll(() => tabInTrack(page, 'Clojure')).toBe(true);
      await expect.poll(() => indicatorCovers(page, 'Clojure')).toBe(true);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    });
  });

  test('after a drag, a later click still selects its tab', async ({
    page,
  }) => {
    await page.goto('/tabs.html');
    await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');
    const finger = await touch(page, await centerOf(page, 'Java'));
    await finger.moveTo(await centerOf(page, 'Rust'));
    await finger.lift();
    await expect(page.getByRole('tab', { name: 'Rust' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Like an assistive technology's activation, with no pointer or key
    await page.waitForTimeout(500);
    await page.evaluate(() =>
      document.querySelector<HTMLElement>('#tabs-1-tab-1')!.click(),
    );
    await expect(page.getByRole('tab', { name: 'Java' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('a press mid-scroll keeps the tab under the finger selected', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tabs-many.html');
    await expect(page.locator('.tabs')).toHaveAttribute('data-mounted', '');
    const track = (await page.getByRole('tablist').boundingBox())!;
    const point = {
      x: track.x + track.width / 2,
      y: track.y + track.height / 2,
    };

    // The button starts a smooth scroll, which moves the tabs under the
    // finger after it goes down
    await page.locator('.tabs-scroll-end').click();
    const finger = await touch(page, point);
    await page.waitForTimeout(800);
    const underFinger = await page
      .getByRole('tab', { selected: true })
      .evaluate((tab, x) => {
        const box = tab.getBoundingClientRect();
        return box.left <= x && x <= box.right;
      }, point.x);
    expect(underFinger).toBe(true);
    await finger.lift();
  });

  test('a drag moves focus along when a tab already has it', async ({
    page,
  }) => {
    await page.goto('/tabs.html');
    await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');
    await page.getByRole('tab', { name: 'Java' }).focus();
    const finger = await touch(page, await centerOf(page, 'Java'));
    await finger.moveTo(await centerOf(page, 'Python'));
    await finger.lift();
    await expect(page.getByRole('tab', { name: 'Python' })).toBeFocused();
  });

  test('a drag that wanders vertically keeps the finger and does not scroll', async ({
    page,
  }) => {
    await page.goto('/tabs.html');
    await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');
    const java = await centerOf(page, 'Java');
    const python = await centerOf(page, 'Python');
    const scrollY = await page.evaluate(() => window.scrollY);

    // A real finger rarely moves straight sideways
    const finger = await touch(page, java);
    await finger.moveTo({ x: java.x, y: java.y + 40 });
    await finger.moveTo({ x: python.x, y: python.y + 80 });
    await expect(page.getByRole('tab', { name: 'Python' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('#tabs-1').getByRole('tablist')).toHaveAttribute(
      'data-dragging',
      '',
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    await finger.lift();
  });

  test('dragging with a mouse does not move the selection', async ({
    page,
  }) => {
    await page.goto('/tabs.html');
    await expect(page.locator('#tabs-1')).toHaveAttribute('data-mounted', '');
    const java = await centerOf(page, 'Java');
    const rust = await centerOf(page, 'Rust');
    await page.mouse.move(java.x, java.y);
    await page.mouse.down();
    await page.mouse.move(rust.x, rust.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole('tab', { name: 'Java' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: 'Rust' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
