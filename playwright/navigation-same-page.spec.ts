import {
  test,
  expect,
  waitForClientMount,
  visitorScrollBy,
  type Locator,
  type Page,
} from './test-fixtures';

type WindowWithMountGate = Window & {
  __initialMountGate?: { held: boolean; release(): Promise<void> };
};

async function holdInitialPerPageMounts(page: Page) {
  await page.addInitScript(() => {
    // WebKit uses scheduleTask's timer fallback; preserve native scheduling
    // there while exposing the same controllable completion gate.
    const scheduleIdle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback.bind(window)
        : (callback: IdleRequestCallback) =>
            window.setTimeout(
              () => callback({ didTimeout: false, timeRemaining: () => 0 }),
              0,
            );
    const held: (() => void)[] = [];
    const completions: Promise<void>[] = [];
    let released = false;
    const gate = {
      held: false,
      async release() {
        released = true;
        // Native scheduling already delivered these callbacks at the gate.
        // Run them with their original deadlines, without a second idle wait.
        for (const run of held.splice(0)) {
          run();
        }
        // Include registered callbacks that have not yet reached the gate.
        await Promise.all(completions);
        // Let startup's completion reaction run after all actual mounts finish.
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => resolve()),
        );
      },
    };
    (window as WindowWithMountGate).__initialMountGate = gate;
    window.requestIdleCallback = (callback, options) => {
      let complete!: () => void;
      let fail!: (error: unknown) => void;
      completions.push(
        new Promise<void>((resolve, reject) => {
          complete = resolve;
          fail = reject;
        }),
      );
      return scheduleIdle(deadline => {
        // Async mount callbacks return their actual completion promises despite
        // IdleRequestCallback's void signature. Preserve those outcomes.
        const run = () => {
          try {
            Promise.resolve(callback(deadline)).then(complete, fail);
          } catch (error) {
            fail(error);
          }
        };
        const appearance = document.querySelector<HTMLButtonElement>(
          '[data-font-preference-switch]',
        );
        if (!released && appearance && !appearance.disabled) {
          held.push(run);
          gate.held = true;
        } else {
          run();
        }
      }, options);
    };
  });
}

async function expectInitialMountHeld(page: Page) {
  await expect(
    page.getByRole('switch', { name: 'Use serif fonts' }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as WindowWithMountGate).__initialMountGate?.held,
      ),
    )
    .toBe(true);
}

async function releaseInitialMount(page: Page) {
  await page.evaluate(() =>
    (window as WindowWithMountGate).__initialMountGate!.release(),
  );
}

// Firefox applies a link's fragment scroll after the click returns. Wait for it,
// or it can land after the test scrolls elsewhere and win.
async function clickAndWaitForScroll(page: Page, link: Locator) {
  const before = await page.evaluate(() => window.scrollY);
  await link.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before);
}

for (const withHash of [true, false]) {
  test(`same-page URL scrolls to top ${withHash ? 'and clears the fragment' : 'without a previous fragment'}`, async ({
    page,
  }) => {
    await page.goto('/markdown.html');
    if (withHash) {
      await page.locator('nav.toc ol a').last().click();
      await expect(page).toHaveURL(/#/);
    }
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/markdown.html';
      link.textContent = 'Same page without fragment';
      link.id = 'same-page-link';
      link.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:1000';
      document.body.appendChild(link);
      window.scrollTo({ top: 600 });
    });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(400);
    const previousUrl = page.url();
    const previousScroll = await page.evaluate(() => window.scrollY);
    const historyLength = await page.evaluate(() => history.length);
    const link = page.locator('#same-page-link');
    await link.click();
    await expect(page).toHaveURL(/\/markdown\.html$/);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThan(10);
    await expect(link).toBeVisible(); // The existing document was retained.
    await expect(page.locator(':target')).toHaveCount(0);
    expect(await page.evaluate(() => history.length)).toBe(
      historyLength + (withHash ? 1 : 0),
    );
    if (withHash) {
      await page.goBack();
      await expect(page).toHaveURL(previousUrl);
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeCloseTo(previousScroll, -1);
      await page.goForward();
      await expect(page).toHaveURL(/\/markdown\.html$/);
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeLessThan(10);
    }
  });
}

test('history back to the URL without a fragment clears the line target', async ({
  page,
}) => {
  await page.goto('/lectures/01/Rectangle.java.html');
  await waitForClientMount(page);
  // Start away from the top so restoring the entry's scroll is observable.
  await page
    .locator('#L30')
    .evaluate(el => el.scrollIntoView({ block: 'center' }));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  const initialUrl = page.url();
  const initialScroll = await page.evaluate(() => window.scrollY);

  for (const line of [30, 40, 50]) {
    await page.locator(`#L${line}`).click();
    await expect(page).toHaveURL(new RegExp(`#L${line}$`));
    await expect(page.locator(':target')).toHaveId(`L${line}`);
  }
  for (const line of [40, 30]) {
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#L${line}$`));
    await expect(page.locator(':target')).toHaveId(`L${line}`);
  }

  await page.goBack();
  await expect(page).toHaveURL(initialUrl);
  await expect(page.locator(':target')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(initialScroll, -1);

  await page.goForward();
  await expect(page).toHaveURL(/#L30$/);
  await expect(page.locator(':target')).toHaveId('L30');
});

test('history back to the initial fragment restores its line target', async ({
  page,
}) => {
  await page.goto('/lectures/01/Rectangle.java.html#L30');
  await waitForClientMount(page);
  await expect(page.locator(':target')).toHaveId('L30');
  const initialUrl = page.url();
  const initialScroll = await page.evaluate(() => window.scrollY);

  await page.locator('#L40').click();
  await expect(page).toHaveURL(/#L40$/);
  await expect(page.locator(':target')).toHaveId('L40');

  await page.goBack();
  await expect(page).toHaveURL(initialUrl);
  await expect(page.locator(':target')).toHaveId('L30');
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(initialScroll, -1);
});

test('late startup keeps the scroll position restored by fragment history', async ({
  page,
}) => {
  await holdInitialPerPageMounts(page);
  await page.goto('/markdown.html');
  await expectInitialMountHeld(page);
  await clickAndWaitForScroll(page, page.locator('nav.toc ol a').last());
  await expect(page).toHaveURL(/#/);
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/markdown.html';
    link.textContent = 'Same page without fragment';
    link.id = 'same-page-link';
    link.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:1000';
    document.body.appendChild(link);
    window.scrollTo({ top: 600 });
  });
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(600, -1);
  const previousUrl = page.url();
  await page.locator('#same-page-link').click();
  await expect(page).toHaveURL(/\/markdown\.html$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(10);
  await page.goBack();
  await expect(page).toHaveURL(previousUrl);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(600, -1);

  await releaseInitialMount(page);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(600, -1);
});

test('late startup leaves a changed initial fragment at the visitor scroll position', async ({
  page,
}) => {
  await holdInitialPerPageMounts(page);
  await page.goto('/markdown.html#time-zone-chooser');
  await expectInitialMountHeld(page);
  const initialUrl = page.url();
  await clickAndWaitForScroll(page, page.locator('nav.toc ol a').first());
  await expect(page).not.toHaveURL(initialUrl);
  const visitorScroll = await visitorScrollBy(page, 300);

  await releaseInitialMount(page);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(visitorScroll, -1);
});

test('startup aligns an unchanged initial fragment on cold load and reload', async ({
  page,
}) => {
  await holdInitialPerPageMounts(page);
  await page.goto('/markdown.html#time-zone-chooser');
  for (const reload of [false, true]) {
    if (reload) {
      await page.reload();
    }
    await expectInitialMountHeld(page);
    // Native fragment positioning can happen before mounts finish. Move away
    // so this control independently proves the late startup realignment.
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await expect
      .poll(() =>
        page
          .locator('#time-zone-chooser')
          .evaluate(
            element =>
              element.getBoundingClientRect().top >= window.innerHeight,
          ),
      )
      .toBe(true);
    await releaseInitialMount(page);
    await expect
      .poll(() =>
        page.locator('#time-zone-chooser').evaluate(element => {
          const rect = element.getBoundingClientRect();
          return rect.top >= 0 && rect.top < window.innerHeight;
        }),
      )
      .toBe(true);
  }
});
