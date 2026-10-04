import { test, expect, type Page } from './test-fixtures';

async function expectVowelTrail(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
  await expect(nav.getByRole('listitem')).toHaveText([
    'Labs',
    'Lab 0',
    'Counting vowels',
  ]);
  await expect(nav.getByRole('link')).toHaveText(['Labs', 'Lab 0']);
  await expect(nav.locator('[aria-current="page"]')).toHaveText(
    'Counting vowels',
  );
  await expect(nav.locator('[aria-current="page"] a')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Counting vowels',
  );
}

for (const javaScriptEnabled of [true, false]) {
  test(`ancestor links navigate with JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled });
    const page = await context.newPage();
    try {
      await page.goto('/labs/00/VowelCounter.java.html');
      await expectVowelTrail(page);
      await page
        .getByRole('navigation', { name: 'Breadcrumb', exact: true })
        .getByRole('link', { name: 'Lab 0', exact: true })
        .click();
      await expect(page).toHaveURL(/labs\/00\/index\.html$/);
      const nav = page.getByRole('navigation', {
        name: 'Breadcrumb',
        exact: true,
      });
      await expect(nav.getByRole('listitem')).toHaveText(['Labs', 'Lab 0']);
      await nav.getByRole('link', { name: 'Labs', exact: true }).click();
      await expect(page).toHaveURL(/labs\/index\.html$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Labs');
      await expect(
        page.getByRole('navigation', { name: 'Breadcrumb', exact: true }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}

test('client navigation replaces trails and clears breadcrumb transition names', async ({
  page,
}) => {
  await page.goto('/labs/00/VowelCounter.java.html');
  await page.evaluate(() => {
    (window as Window & { breadcrumbMarker?: boolean }).breadcrumbMarker = true;
  });
  await expectVowelTrail(page);
  await page
    .getByRole('navigation', { name: 'Breadcrumb', exact: true })
    .getByRole('link', { name: 'Lab 0', exact: true })
    .click();
  await expect(page).toHaveURL(/labs\/00\/index\.html$/);
  const nav = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
  await expect(nav.getByRole('listitem')).toHaveText(['Labs', 'Lab 0']);
  await expect
    .poll(() =>
      nav
        .locator('li')
        .evaluateAll(items =>
          items.every(item => !(item as HTMLElement).style.viewTransitionName),
        ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { breadcrumbMarker?: boolean }).breadcrumbMarker,
    ),
  ).toBe(true);
  await page.getByRole('link', { name: 'VowelCounter program' }).click();
  await expectVowelTrail(page);
  await expect
    .poll(() =>
      nav
        .locator('li')
        .evaluateAll(items =>
          items.every(item => !(item as HTMLElement).style.viewTransitionName),
        ),
    )
    .toBe(true);
  await page.goBack();
  await expect(nav.getByRole('listitem')).toHaveText(['Labs', 'Lab 0']);
});

type BreadcrumbSnapshot = { label: string; name: string; left: number }[];
type BreadcrumbTransition = {
  old: BreadcrumbSnapshot;
  next: BreadcrumbSnapshot;
  ready: boolean;
  animations: { pseudo: string; opacityChanges: boolean }[];
};
type BreadcrumbTestWindow = Window & {
  breadcrumbTransitions: BreadcrumbTransition[];
};

async function trackBreadcrumbTransitions(page: Page) {
  await page.evaluate(() => {
    const state = window as BreadcrumbTestWindow;
    state.breadcrumbTransitions = [];
    const snapshot = (): BreadcrumbSnapshot =>
      Array.from(
        document.querySelectorAll<HTMLElement>('nav.breadcrumbs li'),
      ).map(item => ({
        label: item.textContent!.trim(),
        name: item.style.viewTransitionName,
        left: item.getBoundingClientRect().left,
      }));
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = callback => {
      const record: BreadcrumbTransition = {
        old: snapshot(),
        next: [],
        ready: false,
        animations: [],
      };
      state.breadcrumbTransitions.push(record);
      const transition = original(async () => {
        if (typeof callback === 'function') {
          await callback();
        }
        record.next = snapshot();
      });
      transition.ready
        .then(() => {
          record.ready = true;
          record.animations = document.getAnimations().flatMap(animation => {
            const effect = animation.effect;
            if (
              !(effect instanceof KeyframeEffect) ||
              !effect.pseudoElement?.includes('page-breadcrumb-')
            ) {
              return [];
            }
            const frames = effect.getKeyframes();
            return [
              {
                pseudo: effect.pseudoElement,
                opacityChanges:
                  new Set(
                    frames
                      .map(frame => frame.opacity)
                      .filter(value => value !== undefined),
                  ).size > 1,
              },
            ];
          });
        })
        .catch(() => {});
      return transition;
    };
  });
}

async function lastBreadcrumbTransition(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as BreadcrumbTestWindow).breadcrumbTransitions.at(-1)?.ready,
      ),
    )
    .toBe(true);
  return page.evaluate(
    () => (window as BreadcrumbTestWindow).breadcrumbTransitions.at(-1)!,
  );
}

test('ancestor navigation preserves the shared trail and fades only removed items', async ({
  page,
}) => {
  await page.goto('/labs/00/VowelCounter.java.html');
  await trackBreadcrumbTransitions(page);
  await page
    .getByRole('navigation', { name: 'Breadcrumb', exact: true })
    .getByRole('link', { name: 'Lab 0', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lab 0');
  const transition = await lastBreadcrumbTransition(page);
  expect(transition.old.slice(0, 2).map(item => item.name)).toEqual(
    transition.next.map(item => item.name),
  );
  expect(transition.next.map(item => item.name)).toEqual([
    'page-breadcrumb-shared-0',
    'page-breadcrumb-shared-1',
  ]);
  // Left alignment keeps the shared leading ancestor in place as the tail
  // disappears. Geometry is the navigation behavior under test here.
  expect(
    Math.abs(transition.old[0].left - transition.next[0].left),
  ).toBeLessThan(5);
  const sharedAnimations = transition.animations.filter(animation =>
    animation.pseudo.includes('shared'),
  );
  expect(sharedAnimations.length).toBeGreaterThan(0);
  expect(sharedAnimations.every(animation => !animation.opacityChanges)).toBe(
    true,
  );
  expect(
    transition.animations.some(
      animation =>
        animation.pseudo.includes('leave') && animation.opacityChanges,
    ),
  ).toBe(true);
});

test('descending and history navigation preserve the same breadcrumb identities', async ({
  page,
}) => {
  await page.goto('/labs/00/index.html');
  await trackBreadcrumbTransitions(page);
  await page.getByRole('link', { name: 'VowelCounter program' }).click();
  await expectVowelTrail(page);
  const descending = await lastBreadcrumbTransition(page);
  expect(descending.old.map(item => item.name)).toEqual(
    descending.next.slice(0, 2).map(item => item.name),
  );
  expect(descending.next.map(item => item.name)).toEqual([
    'page-breadcrumb-shared-0',
    'page-breadcrumb-shared-1',
    'page-breadcrumb-enter-2',
  ]);
  expect(
    descending.animations.some(
      animation =>
        animation.pseudo.includes('enter') && animation.opacityChanges,
    ),
  ).toBe(true);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lab 0');
  const ascending = await lastBreadcrumbTransition(page);
  expect(ascending.next.map(item => item.name)).toEqual([
    'page-breadcrumb-shared-0',
    'page-breadcrumb-shared-1',
  ]);
  await expect
    .poll(() =>
      page.locator('nav.breadcrumbs li').evaluateAll(items =>
        items.every(item => {
          const style = (item as HTMLElement).style;
          return !style.viewTransitionName;
        }),
      ),
    )
    .toBe(true);
  await expect(page.locator('[data-breadcrumb-transition-styles]')).toHaveCount(
    0,
  );
});

test('relative breadcrumb identities survive history navigation between directories', async ({
  page,
}) => {
  await page.goto('/breadcrumb-tests/index.html');
  await trackBreadcrumbTransitions(page);
  await page.getByRole('link', { name: 'Nested page', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Nested page',
  );
  await lastBreadcrumbTransition(page);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Section');
  const transition = await lastBreadcrumbTransition(page);
  expect(transition.old.slice(0, 2).map(item => item.name)).toEqual(
    transition.next.map(item => item.name),
  );
  expect(transition.next.map(item => item.name)).toEqual([
    'page-breadcrumb-shared-0',
    'page-breadcrumb-shared-1',
  ]);
});

test('sibling pages keep ancestors while different trails fade all items', async ({
  page,
}) => {
  await page.goto('/breadcrumb-tests/nested/first.html');
  await trackBreadcrumbTransitions(page);
  await page.getByRole('link', { name: 'Sibling detail' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Second detail',
  );
  const sibling = await lastBreadcrumbTransition(page);
  expect(sibling.old.slice(0, 3).map(item => item.name)).toEqual(
    sibling.next.slice(0, 3).map(item => item.name),
  );
  expect(sibling.old[3].name).toContain('leave');
  expect(sibling.next[3].name).toContain('enter');
  await page.getByRole('link', { name: 'Different trail' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lab 0');
  const different = await lastBreadcrumbTransition(page);
  expect(different.old.every(item => item.name.includes('leave'))).toBe(true);
  expect(different.next.every(item => item.name.includes('enter'))).toBe(true);
});

for (const mode of ['reduced motion', 'no view transition API'] as const) {
  test(`breadcrumb navigation remains immediate with ${mode}`, async ({
    page,
  }) => {
    await page.goto('/labs/00/VowelCounter.java.html');
    await trackBreadcrumbTransitions(page);
    if (mode === 'reduced motion') {
      await page.emulateMedia({ reducedMotion: 'reduce' });
    } else {
      await page.evaluate(() =>
        Object.defineProperty(document, 'startViewTransition', {
          value: undefined,
        }),
      );
    }
    await page
      .getByRole('navigation', { name: 'Breadcrumb', exact: true })
      .getByRole('link', { name: 'Lab 0', exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lab 0');
    expect(
      await page.evaluate(
        () => (window as BreadcrumbTestWindow).breadcrumbTransitions,
      ),
    ).toEqual([]);
    await expect(
      page.locator('[data-breadcrumb-transition-styles]'),
    ).toHaveCount(0);
    expect(
      await page
        .locator('nav.breadcrumbs li')
        .evaluateAll(items =>
          items.every(item => !(item as HTMLElement).style.viewTransitionName),
        ),
    ).toBe(true);
  });
}
