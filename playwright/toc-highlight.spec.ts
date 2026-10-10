import type { Page } from '@playwright/test';
import { test, expect } from './test-fixtures';

interface TocTransitionWindow extends Window {
  __tocTransitions?: string[];
}

async function recordTocTransitions(page: Page) {
  await page.addInitScript(() => {
    const win = window as TocTransitionWindow;
    win.__tocTransitions = [];
    document.addEventListener(
      'transitionrun',
      event => {
        const target = event.target;
        if (target instanceof Element && target.closest('nav.toc')) {
          win.__tocTransitions?.push(event.propertyName);
        }
      },
      true,
    );
  });
}

function getTocTransitions(page: Page) {
  return page.evaluate(
    () => (window as TocTransitionWindow).__tocTransitions ?? [],
  );
}

async function clearTocTransitions(page: Page) {
  await page.evaluate(() => {
    (window as TocTransitionWindow).__tocTransitions = [];
  });
}

async function expectHighlightOnCurrentItem(page: Page) {
  await expect(page.locator('nav.toc .toc-highlight')).toBeVisible();
  // Layout changes reposition the highlight on the next frame. The tolerance
  // allows for subpixel rounding but not for indentation.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .map(animation => animation.finished.catch(() => undefined)),
        );
        const highlight = document.querySelector('nav.toc .toc-highlight');
        const link = document.querySelector('nav.toc li.current > a');
        if (highlight == null || link == null) {
          return Infinity;
        }
        const highlightRect = highlight.getBoundingClientRect();
        const linkRect = link.getBoundingClientRect();
        return Math.max(
          ...[
            highlightRect.top - linkRect.top,
            highlightRect.bottom - linkRect.bottom,
            highlightRect.left - linkRect.left,
            highlightRect.right - linkRect.right,
          ].map(Math.abs),
        );
      }),
    )
    .toBeLessThanOrEqual(2);
}

async function expectCurrentItem(page: Page, href: string) {
  await expect(page.locator('nav.toc li.current > a')).toHaveAttribute(
    'href',
    href,
  );
}

async function scrollToHeading(page: Page, id: string) {
  await page
    .locator(`#${id}`)
    .evaluate(element => element.scrollIntoView({ block: 'start' }));
  await expectCurrentItem(page, `#${id}`);
}

// The fixture's last heading is current at the bottom of the page
async function pressScrollKey(page: Page, key: 'End' | 'Home', href: string) {
  await page.keyboard.press(key);
  await expectCurrentItem(page, href);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await recordTocTransitions(page);
});

test('highlight follows the current item and animates between items', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/layout-toc-scroll.html');
  await expectCurrentItem(page, '#first');
  await expectHighlightOnCurrentItem(page);
  await expect(page.locator('nav.toc ol > :not(li)')).toHaveCount(0);

  await pressScrollKey(page, 'End', '#second');
  await expect.poll(() => getTocTransitions(page)).toContain('transform');
  await expectHighlightOnCurrentItem(page);
});

test('highlight covers only the link of an indented item', async ({ page }) => {
  await page.goto('/layout-toc-nested.html');
  await page.locator('nav.toc a[href="#inner"]').click();
  await expectCurrentItem(page, '#inner');
  await expectHighlightOnCurrentItem(page);
});

test('highlight stays on the current item when content is added before the list', async ({
  page,
}) => {
  await page.goto('/layout-toc-scroll.html#second');
  await expectCurrentItem(page, '#second');
  await page.addStyleTag({ content: 'nav.toc { padding-top: 24px; }' });
  await expectHighlightOnCurrentItem(page);
});

test('highlight does not animate when the page scrolls without user input', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/layout-toc-scroll.html');
  await expectCurrentItem(page, '#first');
  await expectHighlightOnCurrentItem(page);

  // Such as the browser scrolling to a fragment after the TOC has mounted
  await scrollToHeading(page, 'second');
  await expectHighlightOnCurrentItem(page);
  expect(await getTocTransitions(page)).toEqual([]);
});

test('highlight does not animate when the page loads at a deep link', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/layout-toc-scroll.html#second');
  await expectCurrentItem(page, '#second');
  await expectHighlightOnCurrentItem(page);
  expect(await getTocTransitions(page)).toEqual([]);
});

test('highlight moves without animating under reduced motion and follows a live preference change', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/layout-toc-scroll.html');
  await expectCurrentItem(page, '#first');
  await expectHighlightOnCurrentItem(page);

  await pressScrollKey(page, 'End', '#second');
  await expectHighlightOnCurrentItem(page);
  expect(await getTocTransitions(page)).toEqual([]);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await pressScrollKey(page, 'Home', '#first');
  await expect.poll(() => getTocTransitions(page)).toContain('transform');
  await expectHighlightOnCurrentItem(page);
});

test('highlight follows the current item on code pages', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/Interleaved.java.html', { waitUntil: 'networkidle' });
  const highlight = page.locator('nav.toc .toc-highlight');
  await expect(highlight).toBeHidden();

  await page.locator('nav.toc a[href="#L3"]').click();
  await expectCurrentItem(page, '#L3');
  await expectHighlightOnCurrentItem(page);

  await clearTocTransitions(page);
  await page.locator('nav.toc a[href="#L4"]').click();
  await expectCurrentItem(page, '#L4');
  await expect.poll(() => getTocTransitions(page)).toContain('transform');
  await expectHighlightOnCurrentItem(page);

  await page.evaluate(() => {
    window.location.hash = '';
  });
  await expect(page.locator('nav.toc li.current')).toHaveCount(0);
  await expect(highlight).toBeHidden();
});

test('current item changes where a clicked heading comes to rest', async ({
  page,
}) => {
  await page.goto('/layout-toc-scroll.html');
  await expectCurrentItem(page, '#first');

  // A heading becomes current at the line where clicking its TOC link puts it
  await page.locator('nav.toc a[href="#second"]').click();
  await expectCurrentItem(page, '#second');
  const restingTop = await page
    .locator('#second')
    .evaluate(element => element.getBoundingClientRect().top);

  // Above that line, the heading has not been reached yet, so the alert before
  // it is current
  await page.evaluate(offset => window.scrollBy(0, -offset), 40);
  await expect
    .poll(() =>
      page
        .locator('#second')
        .evaluate(element => element.getBoundingClientRect().top),
    )
    .toBeCloseTo(restingTop + 40, 0);
  await expectCurrentItem(page, '#note');
});

test('alerts become the current item', async ({ page }) => {
  await page.goto('/layout-toc-scroll.html');
  await expectCurrentItem(page, '#first');

  await page.locator('nav.toc a[href="#note"]').click();
  await expectCurrentItem(page, '#note');
  await expectHighlightOnCurrentItem(page);

  // The heading above the alert is current again once the alert is not reached
  await page.locator('nav.toc a[href="#first"]').click();
  await expectCurrentItem(page, '#first');
});

test('items follow their link targets when the page has unlisted headings', async ({
  page,
}) => {
  await page.goto('/layout-toc-scroll.html');
  await expect(page.locator('#unlisted')).toBeAttached();
  await expect(page.locator('nav.toc a[href="#unlisted"]')).toHaveCount(0);

  await page.locator('nav.toc a[href="#second"]').click();
  await expectCurrentItem(page, '#second');
});

test('short final sections become current when their links are clicked', async ({
  page,
}) => {
  await page.goto('/layout-toc-short-end.html');
  await expectCurrentItem(page, '#first');

  // Both final headings rest below the header when the page is at its bottom
  for (const href of ['#second', '#third', '#second']) {
    await page.locator(`nav.toc a[href="${href}"]`).click();
    await expectCurrentItem(page, href);
    await expectHighlightOnCurrentItem(page);
  }
});

test('the last visible item is current at the bottom of the page', async ({
  page,
}) => {
  await page.goto('/layout-toc-short-end.html');
  await pressScrollKey(page, 'End', '#third');
  await pressScrollKey(page, 'Home', '#first');
});

test('highlight stays on the current item when a long TOC list moves', async ({
  page,
}) => {
  await page.goto('/layout-toc-many.html#section-30');
  await expectCurrentItem(page, '#section-30');
  // The TOC is capped and scrolls, so moving the list does not resize it
  expect(
    await page
      .locator('nav.toc')
      .evaluate(toc => toc.scrollHeight > toc.clientHeight),
  ).toBe(true);

  await page.addStyleTag({ content: 'nav.toc { padding-top: 24px; }' });
  await expectHighlightOnCurrentItem(page);
});
