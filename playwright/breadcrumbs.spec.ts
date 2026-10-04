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

async function breadcrumbTransitionNames(page: Page) {
  return page
    .locator('nav.breadcrumbs, nav.breadcrumbs li')
    .evaluateAll(elements =>
      elements.map(
        element => (element as HTMLElement).style.viewTransitionName,
      ),
    );
}

async function expectNoBreadcrumbTransitionNames(page: Page) {
  await expect
    .poll(async () =>
      (await breadcrumbTransitionNames(page)).every(name => !name),
    )
    .toBe(true);
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
  await expectNoBreadcrumbTransitionNames(page);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { breadcrumbMarker?: boolean }).breadcrumbMarker,
    ),
  ).toBe(true);
  await page.getByRole('link', { name: 'VowelCounter program' }).click();
  await expectVowelTrail(page);
  await expectNoBreadcrumbTransitionNames(page);
  await page.goBack();
  await expect(nav.getByRole('listitem')).toHaveText(['Labs', 'Lab 0']);
});

type BreadcrumbSnapshot = {
  navName: string;
  itemNames: string[];
  left: number;
};
type GroupMotion = { duration: number | string; easing: string[] };
type BreadcrumbTransition = {
  old: BreadcrumbSnapshot;
  next: BreadcrumbSnapshot;
  ready: boolean;
  pseudos: string[];
  groupMotion: Record<string, GroupMotion>;
};
type BreadcrumbTestWindow = Window & {
  breadcrumbTransitions: BreadcrumbTransition[];
};

async function trackBreadcrumbTransitions(page: Page) {
  await page.evaluate(() => {
    const state = window as BreadcrumbTestWindow;
    state.breadcrumbTransitions = [];
    const snapshot = (): BreadcrumbSnapshot => {
      const nav = document.querySelector<HTMLElement>('nav.breadcrumbs')!;
      return {
        navName: nav.style.viewTransitionName,
        itemNames: Array.from(nav.querySelectorAll<HTMLElement>('li')).map(
          item => item.style.viewTransitionName,
        ),
        left: nav.querySelector('li')!.getBoundingClientRect().left,
      };
    };
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = callback => {
      const record: BreadcrumbTransition = {
        old: snapshot(),
        next: snapshot(),
        ready: false,
        pseudos: [],
        groupMotion: {},
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
          const animations = document.getAnimations();
          record.pseudos = animations.flatMap(animation => {
            const effect = animation.effect;
            return effect instanceof KeyframeEffect &&
              effect.pseudoElement?.includes('breadcrumb')
              ? [effect.pseudoElement]
              : [];
          });
          for (const animation of animations) {
            const effect = animation.effect;
            const name =
              effect instanceof KeyframeEffect &&
              effect.pseudoElement?.match(
                /^::view-transition-group\((.+)\)$/,
              )?.[1];
            if (effect instanceof KeyframeEffect && name) {
              // CSS animations apply animation-timing-function per keyframe
              record.groupMotion[name] = {
                duration: effect.getComputedTiming().duration!,
                easing: effect.getKeyframes().map(keyframe => keyframe.easing!),
              };
            }
          }
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

function expectSingleBreadcrumbGroup(transition: BreadcrumbTransition) {
  for (const side of [transition.old, transition.next]) {
    expect(side.navName).toBe('page-breadcrumbs');
    expect(side.itemNames.every(name => !name)).toBe(true);
  }
  expect(transition.pseudos).toContain(
    '::view-transition-group(page-breadcrumbs)',
  );
  expect(
    transition.pseudos.every(pseudo => pseudo.includes('(page-breadcrumbs)')),
  ).toBe(true);
}

test('the whole trail moves as one group when the page layout changes', async ({
  page,
}) => {
  await page.goto('/breadcrumb-tests/nested/index.html');
  await trackBreadcrumbTransitions(page);
  await page.getByRole('link', { name: 'First detail', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'First detail',
  );
  const descending = await lastBreadcrumbTransition(page);
  expectSingleBreadcrumbGroup(descending);
  // The TOC layout positions the trail differently. Geometry is the behavior
  // under test: every item, including the current one, must travel together.
  expect(Math.abs(descending.old.left - descending.next.left)).toBeGreaterThan(
    5,
  );

  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Nested page',
  );
  const ascending = await lastBreadcrumbTransition(page);
  expectSingleBreadcrumbGroup(ascending);
  await expectNoBreadcrumbTransitionNames(page);
});

test('the trail and page heading move with the same timing', async ({
  page,
}) => {
  await page.goto('/breadcrumb-tests/nested/index.html');
  await trackBreadcrumbTransitions(page);
  await page.getByRole('link', { name: 'First detail', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'First detail',
  );
  const { groupMotion } = await lastBreadcrumbTransition(page);
  // The trail and heading shift together between layouts; mismatched timing
  // makes them visibly drift apart mid-transition.
  expect(groupMotion['page-title']).toEqual(groupMotion['page-breadcrumbs']);
  expect(groupMotion['page-info']).toEqual(groupMotion['page-breadcrumbs']);
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
    expect((await breadcrumbTransitionNames(page)).every(name => !name)).toBe(
      true,
    );
  });
}
