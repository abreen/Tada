import { test, expect, type Page } from './test-fixtures';

const templates = ['.html', '-toc.html', '.py.html', '.java.html'];
const sites = [
  { name: 'pickers only', base: '', footer: false },
  {
    name: 'footer, pickers, and banner',
    base: 'http://localhost:8082/custom',
    footer: true,
  },
];

async function expectAtViewportBottom(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page
    .locator('.appearance-pickers')
    .evaluate(element => ({
      bottom: element.getBoundingClientRect().bottom,
      height: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
    }));
  expect(geometry.bottom).toBeGreaterThan(geometry.height - 100);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height + 2);
}

for (const site of sites) {
  for (const javaScriptEnabled of [true, false]) {
    test.describe(`${site.name}, JavaScript ${javaScriptEnabled}`, () => {
      test.use({ javaScriptEnabled });
      for (const width of [390, 1280]) {
        for (const template of templates) {
          test(`short ${template} page at width ${width}`, async ({ page }) => {
            await page.setViewportSize({ width, height: 1000 });
            await page.goto(`${site.base}/layout-short${template}`);
            await expectAtViewportBottom(page);
            await expect(page.locator('.page-bottom > footer')).toHaveCount(
              site.footer ? 1 : 0,
            );
            await expect(
              page.locator('.page-bottom > .appearance-pickers'),
            ).toBeVisible();
            const content = await page.locator('.page-content').boundingBox();
            const bottom = await page.locator('.page-bottom').boundingBox();
            expect(content).not.toBeNull();
            expect(bottom).not.toBeNull();
            expect(bottom!.y - (content!.y + content!.height)).toBeGreaterThan(
              100,
            );
            if (!javaScriptEnabled) {
              await expect(page.getByRole('switch').first()).toBeDisabled();
            }
          });
        }
      }
      for (const width of [390, 1280]) {
        for (const template of templates) {
          test(`long ${template} page follows content at width ${width}`, async ({
            page,
          }) => {
            await page.setViewportSize({ width, height: 700 });
            await page.goto(`${site.base}/layout-long${template}`);
            const bottom = page.locator('.page-bottom');
            await expect(bottom).not.toBeInViewport();
            await bottom.scrollIntoViewIfNeeded();
            await expect(bottom).toBeInViewport();
            const contentBox = await page
              .locator('.page-content')
              .boundingBox();
            const bottomBox = await bottom.boundingBox();
            expect(bottomBox!.y).toBeGreaterThan(
              contentBox!.y + contentBox!.height,
            );
          });
        }
      }
      test('printing hides the whole group without reserving viewport height', async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1280, height: 1000 });
        await page.goto(`${site.base}/layout-short.html`);
        await page.emulateMedia({ media: 'print' });
        await expect(page.locator('.page-bottom')).toBeHidden();
        const main = await page.locator('main.body').boundingBox();
        expect(main!.height).toBeLessThan(500);
      });
      for (const template of templates) {
        test(`printing a ${template} page gives the content the full width`, async ({
          page,
        }) => {
          await page.setViewportSize({ width: 1400, height: 1000 });
          await page.goto(`${site.base}/layout-long${template}`);
          await page.emulateMedia({ media: 'print' });
          await expect(page.locator('nav.toc')).toBeHidden();
          const geometry = await page.locator('main.body').evaluate(main => {
            const container = main.closest('.container')!;
            const style = getComputedStyle(container);
            const box = container.getBoundingClientRect();
            const mainBox = main.getBoundingClientRect();
            return {
              mainLeft: mainBox.left,
              mainWidth: mainBox.width,
              contentLeft: box.left + parseFloat(style.paddingLeft),
              contentWidth:
                box.width -
                parseFloat(style.paddingLeft) -
                parseFloat(style.paddingRight),
            };
          });
          expect(geometry.mainLeft).toBeCloseTo(geometry.contentLeft, 0);
          expect(geometry.mainWidth).toBeCloseTo(geometry.contentWidth, 0);
        });
      }
    });
  }
}

test('TOC highlighting still accounts for alerts and dividers inside content', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto('/layout-toc-scroll.html');
  await page
    .locator('#second')
    .evaluate(element => element.scrollIntoView({ block: 'start' }));
  await expect(page.locator('nav.toc li.current > a')).toHaveAttribute(
    'href',
    '#second',
  );
});

interface PageBottomTransitionSample {
  oldDisplay: string;
  animations: string[];
  buttons: { disabled: boolean; checked: string | null }[];
}

type WindowWithPageBottomTransitions = Window & {
  __pageBottomTransitions?: PageBottomTransitionSample[];
};

async function trackPageBottomTransitions(page: Page): Promise<void> {
  await page.evaluate(() => {
    const trackedWindow = window as WindowWithPageBottomTransitions;
    trackedWindow.__pageBottomTransitions = [];
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = callback => {
      const transition = original(callback);
      void transition.ready.then(() => {
        const root = document.documentElement;
        const bottom = document.querySelector('.page-bottom')!;
        trackedWindow.__pageBottomTransitions!.push({
          oldDisplay: getComputedStyle(
            root,
            '::view-transition-old(page-bottom)',
          ).display,
          animations: document
            .getAnimations()
            .flatMap(animation =>
              animation instanceof CSSAnimation &&
              animation.effect instanceof KeyframeEffect &&
              animation.effect.pseudoElement?.includes('page-bottom')
                ? [
                    // A fade-out without a forwards fill shows the snapshot
                    // again in the transition's last frame
                    `${animation.effect.pseudoElement} ${animation.animationName} ${animation.effect.getComputedTiming().fill}`,
                  ]
                : [],
            )
            .sort(),
          buttons: Array.from(
            bottom.querySelectorAll<HTMLButtonElement>('button'),
            button => ({
              disabled: button.disabled,
              checked: button.getAttribute('aria-checked'),
            }),
          ),
        });
      });
      return transition;
    };
  });
}

async function pageBottomTransitionCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as WindowWithPageBottomTransitions).__pageBottomTransitions
        ?.length ?? 0,
  );
}

async function clickInjectedLink(page: Page, href: string): Promise<void> {
  await page.locator('.page-content').evaluate((content, href) => {
    const link = document.createElement('a');
    link.href = href;
    link.setAttribute('data-tada-page', '');
    link.id = 'page-layout-test-link';
    link.textContent = 'Injected link';
    content.prepend(link);
  }, href);
  // A real click would scroll the link into view; dispatch it in place
  await page.locator('#page-layout-test-link').dispatchEvent('click');
}

test('keeps appearance controls stationary while on screen and fades them in or out of view', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/layout-short.html');
  const font = page.getByRole('switch', { name: 'Use serif fonts' });
  const contrast = page.getByRole('switch', { name: 'Use high contrast' });
  await font.click();
  await expect(font).toHaveAttribute('aria-checked', 'true');
  await contrast.click();
  await expect(contrast).toHaveAttribute('aria-checked', 'true');
  await trackPageBottomTransitions(page);

  const navigations: [() => Promise<void>, RegExp][] = [
    // On screen on both pages, but the TOC column moves the group sideways
    [
      () => clickInjectedLink(page, '/layout-short-toc.html'),
      /layout-short-toc\.html/,
    ],
    // On screen only on the old page
    [() => clickInjectedLink(page, '/layout-long.html'), /layout-long\.html/],
    // On screen only on the new page
    [async () => void (await page.goBack()), /layout-short-toc\.html/],
    [async () => void (await page.goBack()), /layout-short\.html/],
  ];
  for (const [index, [navigate, url]] of navigations.entries()) {
    await navigate();
    await expect(page).toHaveURL(url);
    await expect.poll(() => pageBottomTransitionCount(page)).toBe(index + 1);
    await expect(font).toBeEnabled();
  }

  const buttons = [
    { disabled: false, checked: 'true' },
    { disabled: false, checked: 'true' },
  ];
  const stationary = { oldDisplay: 'none', animations: [], buttons };
  const leaving = {
    oldDisplay: 'block',
    animations: ['::view-transition-old(page-bottom) page-fade-out both'],
    buttons,
  };
  const entering = {
    // There is no old snapshot to style
    oldDisplay: expect.any(String),
    animations: ['::view-transition-new(page-bottom) page-fade-in both'],
    buttons,
  };
  expect(
    await page.evaluate(
      () => (window as WindowWithPageBottomTransitions).__pageBottomTransitions,
    ),
  ).toEqual([stationary, leaving, entering, stationary]);
  await font.click();
  await expect(font).toHaveAttribute('aria-checked', 'false');
  await contrast.click();
  await expect(contrast).toHaveAttribute('aria-checked', 'false');
});
