import { test, expect, type Page } from './test-fixtures';

type WindowWithNavMarker = Window & { __navMarker?: string };
type WindowWithViewTransitionCount = Window & {
  __viewTransitionCount?: number;
};
type WindowWithSearchTransitionState = Window & {
  __searchWasAnimatingAtNavigation?: boolean;
};

async function setNavMarker(page: Page) {
  await page.evaluate(() => {
    (window as WindowWithNavMarker).__navMarker = 'alive';
  });
}

async function getNavMarker(page: Page) {
  return page.evaluate(() => (window as WindowWithNavMarker).__navMarker);
}

async function trackViewTransitions(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    if (typeof document.startViewTransition !== 'function') {
      return false;
    }

    const original = document.startViewTransition;
    (window as WindowWithViewTransitionCount).__viewTransitionCount = 0;
    document.startViewTransition = callback => {
      const trackedWindow = window as WindowWithViewTransitionCount;
      trackedWindow.__viewTransitionCount =
        (trackedWindow.__viewTransitionCount ?? 0) + 1;
      return original.call(document, callback);
    };
    return true;
  });
}

async function getViewTransitionCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as WindowWithViewTransitionCount).__viewTransitionCount ?? 0,
  );
}

async function emulateSearchDisabled(page: Page) {
  // The shared Playwright fixture enables search. With features.search false,
  // the template omits this element entirely.
  await page.locator('.search-controls').evaluate(element => element.remove());
}

async function getHeaderScrimStyles(page: Page) {
  return page.locator('body > .container').evaluate(container => {
    const style = getComputedStyle(container, '::before');
    return {
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
    };
  });
}

test.describe('graceful degradation without JS', () => {
  test('links work with JavaScript disabled', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/index.html');
    await expect(page.locator('h1')).toContainText('Home');

    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);
    await expect(page.locator('h1')).toContainText('Markdown Examples');

    await context.close();
  });

  test('header links work with JavaScript disabled', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/index.html');
    await page.locator('header details > summary').click();
    await page
      .locator('header details nav a[href="/lectures/index.html"]')
      .click();

    await expect(page).toHaveURL(/lectures\/index\.html/);
    await expect(page.locator('h1')).toContainText('Lectures');

    await context.close();
  });

  test('header scrim blocks page links with JavaScript disabled', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/index.html');
    const details = page.locator('header details');
    const summary = details.locator('summary');
    const pageLink = page.locator('main.body a[href="/markdown.html"]');
    await pageLink.evaluate(element =>
      element.scrollIntoView({ block: 'center' }),
    );
    const pageLinkBox = await pageLink.boundingBox();
    expect(pageLinkBox).not.toBeNull();

    await summary.click();
    await expect(details).toHaveAttribute('open', '');
    await expect
      .poll(async () => (await getHeaderScrimStyles(page)).opacity)
      .toBe('1');

    const originalUrl = page.url();
    await page.mouse.click(
      pageLinkBox!.x + pageLinkBox!.width / 2,
      pageLinkBox!.y + pageLinkBox!.height / 2,
    );

    await expect(details).toHaveAttribute('open', '');
    await expect(page).toHaveURL(originalUrl);

    await summary.click();
    await expect(details).not.toHaveAttribute('open', '');

    await context.close();
  });
});

test.describe('search control', () => {
  test('stays right-aligned without leaving a clipped icon at the narrow breakpoint', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 417, height: 800 });
    await page.goto('/index.html');

    const alignedEdges = await page.evaluate(() => ({
      details: document.querySelector('header details')!.getBoundingClientRect()
        .right,
      search: document
        .querySelector('input[name="quick-search"]')!
        .getBoundingClientRect().right,
    }));
    expect(alignedEdges.search).toBeLessThan(alignedEdges.details);

    await page.setViewportSize({ width: 400, height: 800 });
    expect(await page.locator('.search-controls').boundingBox()).toBeNull();
  });

  test('gives the Material search symbol enough space at its intended scale', async ({
    page,
  }) => {
    await page.goto('/index.html');

    const geometry = await page
      .locator('.search-controls')
      .evaluate(element => {
        const icon = getComputedStyle(element, '::before');
        const input = getComputedStyle(element.querySelector('input')!);
        const iconWidth = Number.parseFloat(icon.width);
        const iconLeft = Number.parseFloat(icon.left);
        const inputPaddingLeft = Number.parseFloat(input.paddingLeft);
        return {
          iconWidth,
          iconHeight: Number.parseFloat(icon.height),
          boxGap: inputPaddingLeft - iconLeft - iconWidth,
        };
      });

    expect(geometry.iconWidth).toBeGreaterThanOrEqual(20);
    expect(geometry.iconHeight).toBeGreaterThanOrEqual(20);
    expect(geometry.boxGap).toBeGreaterThanOrEqual(0);
    expect(geometry.boxGap).toBeLessThanOrEqual(4);
  });
});

test.describe('responsive header layout', () => {
  test('keeps the menu, logo, and title visible without search', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 348, height: 800 });
    await page.goto('/index.html');
    await emulateSearchDisabled(page);

    const summary = page.locator('header details > summary');
    await expect(summary).toBeVisible();
    await expect(summary.locator('.logo')).toBeVisible();
    await expect(summary.locator('.site-title')).toBeVisible();

    const menu = summary.locator('.menu-icon');
    await expect(menu).toBeVisible();
    expect(await menu.locator('.menu-icon-line').count()).toBe(3);
    const menuBox = await menu.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(menuBox!.width).toBeGreaterThan(0);
    expect(menuBox!.height).toBeGreaterThan(0);
  });

  test('lets back-to-top share narrow header space with the title', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 348, height: 800 });
    await page.goto('/lectures/01/Rectangle.java.html');
    await emulateSearchDisabled(page);
    await page.evaluate(() => window.scrollTo({ top: 700 }));

    const title = page.locator('header .site-title');
    const backToTop = page.locator('header a', { hasText: 'Back to top' });
    await expect(backToTop).toBeVisible();
    await expect(title).toBeVisible();

    const [titleBox, backToTopBox] = await Promise.all([
      title.boundingBox(),
      backToTop.boundingBox(),
    ]);
    expect(titleBox).not.toBeNull();
    expect(backToTopBox).not.toBeNull();
    expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(backToTopBox!.x);
  });
});

test.describe('header menu control', () => {
  test('expands and collapses the navigation content', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/index.html');
    const details = page.locator('header details');

    const getContentStyles = () =>
      details.evaluate(element => {
        const detailsStyle = getComputedStyle(element);
        const contentStyle = getComputedStyle(element, '::details-content');
        const scrimStyle = getComputedStyle(
          document.querySelector('body > .container')!,
          '::before',
        );
        return {
          blockSize: Number.parseFloat(contentStyle.blockSize),
          opacity: contentStyle.opacity,
          transform: contentStyle.transform,
          detailsTransition: detailsStyle.transitionProperty,
          contentTransition: contentStyle.transitionProperty,
          scrimOpacity: scrimStyle.opacity,
          scrimPointerEvents: scrimStyle.pointerEvents,
          scrimTransition: scrimStyle.transitionProperty,
        };
      });

    const closed = await getContentStyles();
    await details.locator('summary').click();
    await expect
      .poll(async () => {
        const styles = await getContentStyles();
        return [
          styles.blockSize > 0,
          styles.opacity,
          styles.scrimOpacity,
          styles.scrimPointerEvents,
        ];
      })
      .toEqual([true, '1', '1', 'auto']);
    const open = await getContentStyles();
    await details.locator('summary').click();
    await expect
      .poll(async () => {
        const styles = await getContentStyles();
        return [
          styles.blockSize,
          styles.opacity,
          styles.scrimOpacity,
          styles.scrimPointerEvents,
        ];
      })
      .toEqual([0, '0', '0', 'none']);
    const closedAgain = await getContentStyles();

    expect(closed.blockSize).toBe(0);
    expect(closed.opacity).toBe('0');
    expect(closed.scrimOpacity).toBe('0');
    expect(closed.scrimPointerEvents).toBe('none');
    expect(open.opacity).toBe('1');
    expect(open.scrimOpacity).toBe('1');
    expect(open.scrimPointerEvents).toBe('auto');
    expect(open.transform).not.toBe(closed.transform);
    expect(closedAgain.opacity).toBe('0');
    expect(closedAgain.scrimOpacity).toBe('0');
    expect(closedAgain.scrimPointerEvents).toBe('none');
    expect(closed.detailsTransition).toContain('grid-template-rows');
    expect(closed.contentTransition).toContain('content-visibility');
    expect(closed.contentTransition).toContain('opacity');
    expect(closed.contentTransition).toContain('transform');
    expect(closed.scrimTransition).toContain('opacity');
  });

  test('scrim dismisses the menu without activating page links', async ({
    page,
  }) => {
    await page.goto('/index.html');
    const details = page.locator('header details');
    const pageLink = page.locator('main.body a[href="/markdown.html"]');
    await pageLink.evaluate(element =>
      element.scrollIntoView({ block: 'center' }),
    );
    const pageLinkBox = await pageLink.boundingBox();
    expect(pageLinkBox).not.toBeNull();

    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');
    await expect
      .poll(async () => (await getHeaderScrimStyles(page)).opacity)
      .toBe('1');

    const originalUrl = page.url();
    await page.mouse.click(
      pageLinkBox!.x + pageLinkBox!.width / 2,
      pageLinkBox!.y + pageLinkBox!.height / 2,
    );

    await expect(details).not.toHaveAttribute('open', '');
    await expect(page).toHaveURL(originalUrl);
  });

  test('morphs the hamburger strokes into a close symbol', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/index.html');
    const summary = page.locator('header details > summary');
    const icon = summary.locator('.menu-icon');

    const getIconStyles = () =>
      icon.evaluate(element => {
        const top = getComputedStyle(
          element.querySelector('.menu-icon-line-top')!,
        );
        const middle = getComputedStyle(
          element.querySelector('.menu-icon-line-middle')!,
        );
        const bottom = getComputedStyle(
          element.querySelector('.menu-icon-line-bottom')!,
        );
        return {
          topTransform: top.transform,
          middleOpacity: middle.opacity,
          middleTransform: middle.transform,
          bottomTransform: bottom.transform,
          topTransition: top.transitionProperty,
          middleTransition: middle.transitionProperty,
          bottomTransition: bottom.transitionProperty,
        };
      });

    const closed = await getIconStyles();
    await summary.click();
    await expect
      .poll(async () => {
        const styles = await getIconStyles();
        return [
          styles.topTransform !== closed.topTransform,
          styles.middleOpacity,
          styles.bottomTransform !== closed.bottomTransform,
        ];
      })
      .toEqual([true, '0', true]);
    const open = await getIconStyles();

    expect(await icon.locator('.menu-icon-line').count()).toBe(3);
    expect(closed.middleOpacity).toBe('1');
    expect(closed.topTransform).not.toBe(open.topTransform);
    expect(closed.middleTransform).not.toBe(open.middleTransform);
    expect(closed.bottomTransform).not.toBe(open.bottomTransform);
    expect(closed.topTransition).toContain('transform');
    expect(closed.middleTransition).toContain('opacity');
    expect(closed.middleTransition).toContain('transform');
    expect(closed.bottomTransition).toContain('transform');
  });

  test('does not animate the header when reduced motion is requested', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/index.html');

    const durations = await page.locator('header details').evaluate(details => {
      const icon = details.querySelector('.menu-icon')!;
      return [
        getComputedStyle(icon.querySelector('.menu-icon-line-top')!)
          .transitionDuration,
        getComputedStyle(icon.querySelector('.menu-icon-line-middle')!)
          .transitionDuration,
        getComputedStyle(icon.querySelector('.menu-icon-line-bottom')!)
          .transitionDuration,
        getComputedStyle(details).transitionDuration,
        getComputedStyle(details, '::details-content').transitionDuration,
        getComputedStyle(
          document.querySelector('body > .container')!,
          '::before',
        ).transitionDuration,
      ];
    });

    expect(durations).toEqual(['0s', '0s', '0s', '0s', '0s', '0s']);
  });
});

test.describe('search results motion', () => {
  test('reveals and dismisses the results panel', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/index.html');
    const input = page.locator('input[name="quick-search"]');
    const container = page.locator('.results-container');
    const results = container.locator('.results');

    await expect(input).toBeEnabled();
    const closed = await results.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        opacity: style.opacity,
        transform: style.transform,
        transition: style.transitionProperty,
      };
    });

    await input.focus();
    await expect(container).toHaveClass(/is-showing/);
    await expect
      .poll(() =>
        results.evaluate(element => {
          const style = getComputedStyle(element);
          return [style.opacity, style.transform];
        }),
      )
      .toEqual(['1', 'none']);

    await page.keyboard.press('Escape');
    await expect(container).toHaveAttribute('aria-hidden', 'true');
    await expect(container).toHaveAttribute('inert', '');
    await expect
      .poll(() =>
        results.evaluate(element => {
          const style = getComputedStyle(element);
          return [style.opacity, style.transform];
        }),
      )
      .toEqual([closed.opacity, closed.transform]);

    expect(closed.opacity).toBe('0');
    expect(closed.transform).not.toBe('none');
    expect(closed.transition).toContain('opacity');
    expect(closed.transition).toContain('transform');
  });

  test('does not animate the panel when reduced motion is requested', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/index.html');

    const duration = await page
      .locator('.results-container .results')
      .evaluate(element => getComputedStyle(element).transitionDuration);

    expect(duration).toBe('0s');
  });
});

test.describe('client-side navigation', () => {
  test('uses View Transitions when motion is allowed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/index.html');
    expect(await trackViewTransitions(page)).toBe(true);

    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);

    expect(await getViewTransitionCount(page)).toBe(1);
  });

  test('keeps the site banner stationary during View Transitions', async ({
    page,
  }) => {
    await page.goto('/index.html');
    await page.locator('.container').evaluate(container => {
      const banner = document.createElement('aside');
      banner.className = 'site-banner';
      container.prepend(banner);
    });

    const transitionStyles = await page.locator('.site-banner').evaluate(el => {
      const root = el.ownerDocument.documentElement;
      const pseudoStyle = (pseudo: string) => getComputedStyle(root, pseudo);
      const group = pseudoStyle('::view-transition-group(site-banner)');
      const oldImage = pseudoStyle('::view-transition-old(site-banner)');
      const newImage = pseudoStyle('::view-transition-new(site-banner)');

      return {
        name: getComputedStyle(el).viewTransitionName,
        groupAnimation: group.animationName,
        oldAnimation: oldImage.animationName,
        newAnimation: newImage.animationName,
        oldBlend: oldImage.mixBlendMode,
        newBlend: newImage.mixBlendMode,
      };
    });

    expect(transitionStyles).toEqual({
      name: 'site-banner',
      groupAnimation: 'none',
      oldAnimation: 'none',
      newAnimation: 'none',
      oldBlend: 'normal',
      newBlend: 'normal',
    });
  });

  test('skips View Transitions when reduced motion is preferred', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/index.html');
    await setNavMarker(page);
    expect(await trackViewTransitions(page)).toBe(true);

    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);
    await expect(page.locator('h1')).toContainText('Markdown Examples');

    expect(await getNavMarker(page)).toBe('alive');
    expect(await getViewTransitionCount(page)).toBe(0);
  });

  test('clicking an internal link navigates without full reload', async ({
    page,
  }) => {
    await page.goto('/index.html');
    await setNavMarker(page);

    // Click the Markdown examples link in the page body
    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);
    await expect(page.locator('h1')).toContainText('Markdown Examples');

    const marker = await getNavMarker(page);
    expect(marker).toBe('alive');
  });

  test('document title updates after navigation', async ({ page }) => {
    await page.goto('/index.html');
    const homeTitle = await page.title();

    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);

    const newTitle = await page.title();
    expect(newTitle).not.toBe(homeTitle);
    expect(newTitle).toContain('Markdown');
  });

  test('external links in body have target=_blank', async ({ page }) => {
    await page.goto('/markdown.html');
    const externalLink = page.locator('main.body a.external').first();
    await expect(externalLink).toHaveAttribute('target', '_blank');
    await expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('ctrl+click does not trigger client-side navigation', async ({
    page,
  }) => {
    await page.goto('/index.html');
    const homeUrl = page.url();

    const navLink = page.locator('main.body a[href="/markdown.html"]');
    await navLink.click({ modifiers: ['ControlOrMeta'] });

    expect(page.url()).toBe(homeUrl);
  });

  test('header details closes on navigation', async ({ page }) => {
    await page.goto('/index.html');

    // Open the header details
    await page.locator('header details > summary').click();
    await expect(page.locator('header details')).toHaveAttribute('open', '');

    // Use a real pointer click so browser-specific focus behavior runs.
    await page
      .locator('header details nav a[href="/lectures/index.html"]')
      .click();
    await expect(page).toHaveURL(/lectures\/index\.html/);

    const isOpen = await page.evaluate(
      () =>
        (document.querySelector('header details') as HTMLDetailsElement)?.open,
    );
    expect(isOpen).toBe(false);
  });

  test('header details closes when clicking link to current page', async ({
    page,
  }) => {
    await page.goto('/lectures/index.html');

    // Open the header details
    await page.locator('header details > summary').click();
    await expect(page.locator('header details')).toHaveAttribute('open', '');

    // Click the nav link for the current page
    await page.evaluate(() => {
      const link = document.querySelector(
        'header details nav a[href="/lectures/index.html"]',
      ) as HTMLAnchorElement;
      link?.click();
    });

    const isOpen = await page.evaluate(
      () =>
        (document.querySelector('header details') as HTMLDetailsElement)?.open,
    );
    expect(isOpen).toBe(false);
  });

  test('search input clears on navigation', async ({ page }) => {
    await page.goto('/index.html');

    // Focus and type into the search input using evaluate (it may be hidden)
    await page.evaluate(() => {
      const input = document.querySelector(
        'input[name="quick-search"]',
      ) as HTMLInputElement;
      input.value = 'test query';
    });

    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);

    const value = await page.evaluate(() => {
      const input = document.querySelector(
        'input[name="quick-search"]',
      ) as HTMLInputElement;
      return input?.value ?? '';
    });
    expect(value).toBe('');
  });

  test('search results disappear after clicking a search result link', async ({
    page,
  }) => {
    await page.goto('/index.html');
    await setNavMarker(page);

    // Type a search query
    const searchInput = page.locator('input[name="quick-search"]');
    await searchInput.focus();
    await searchInput.fill('markdown');

    // Wait for search results to appear
    const results = page.locator('.results-container .results a');
    await expect(results.first()).toBeVisible({ timeout: 5000 });

    const targetHref = await results.first().getAttribute('href');
    expect(targetHref).not.toBeNull();
    await page.evaluate(async href => {
      const destination = new URL(href!, window.location.href);
      const response = await window.fetch(destination);
      const html = await response.text();
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const requestUrl = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
          window.location.href,
        );
        if (requestUrl.href === destination.href) {
          return new Response(html, {
            headers: { 'content-type': 'text/html' },
            status: 200,
          });
        }
        return originalFetch(input, init);
      };

      if (typeof document.startViewTransition === 'function') {
        const originalTransition = document.startViewTransition.bind(document);
        document.startViewTransition = callback => {
          const panel = document.querySelector('.results-container .results');
          (
            window as WindowWithSearchTransitionState
          ).__searchWasAnimatingAtNavigation =
            panel
              ?.getAnimations()
              .some(animation => animation instanceof CSSTransition) ?? false;
          return originalTransition(callback);
        };
      }
    }, targetHref);

    // Click the first search result
    await results.first().click();

    // Should have navigated
    await expect(page).not.toHaveURL(/index\.html/);

    // Search input should be cleared
    const value = await page.evaluate(() => {
      const input = document.querySelector(
        'input[name="quick-search"]',
      ) as HTMLInputElement;
      return input?.value ?? '';
    });
    expect(value).toBe('');

    const resultsContainer = page.locator('.results-container');
    await expect(resultsContainer).toHaveAttribute('aria-hidden', 'true');
    await expect(resultsContainer).toHaveAttribute('inert', '');
    await expect(searchInput).toHaveAttribute('aria-expanded', 'false');

    // Should be SPA navigation (no full reload)
    const marker = await getNavMarker(page);
    expect(marker).toBe('alive');
    expect(
      await page.evaluate(
        () =>
          (window as WindowWithSearchTransitionState)
            .__searchWasAnimatingAtNavigation,
      ),
    ).toBe(false);
  });

  test('search results disappear after clicking result for current page', async ({
    page,
  }) => {
    await page.goto('/markdown.html', { waitUntil: 'networkidle' });

    // Search for something that will match this page
    const searchInput = page.locator('input[name="quick-search"]');
    await searchInput.focus();
    await searchInput.fill('markdown');

    // Wait for search results to appear
    const results = page.locator('.results-container .results a');
    await expect(results.first()).toBeVisible({ timeout: 10000 });

    // Find and click a result that links to the current page
    const currentPageResult = page.locator(
      '.results-container .results a[href="/markdown.html"]',
    );
    // Fall back to first result if exact match not found
    const target =
      (await currentPageResult.count()) > 0
        ? currentPageResult.first()
        : results.first();
    await target.click();

    // Results should be dismissed
    const resultsContainer = page.locator('.results-container');
    await expect(resultsContainer).toHaveAttribute('aria-hidden', 'true');
    await expect(resultsContainer).toHaveAttribute('inert', '');
    await expect(searchInput).toHaveAttribute('aria-expanded', 'false');

    // Search input should be cleared
    const value = await page.evaluate(() => {
      const input = document.querySelector(
        'input[name="quick-search"]',
      ) as HTMLInputElement;
      return input?.value ?? '';
    });
    expect(value).toBe('');
  });

  test('search results disappear after clicking result for heading on current page', async ({
    page,
  }) => {
    await page.goto('/markdown.html', { waitUntil: 'networkidle' });

    // Search for a heading on this page
    const searchInput = page.locator('input[name="quick-search"]');
    await searchInput.focus();
    await searchInput.fill('markdown');

    // Wait for search results with hash links (sub-results point to headings)
    const results = page.locator('.results-container .results a');
    await expect(results.first()).toBeVisible({ timeout: 10000 });

    // Find a result with a hash (heading anchor)
    const hashResult = page.locator(
      '.results-container .results a[href*="/markdown.html#"]',
    );
    if ((await hashResult.count()) > 0) {
      await hashResult.first().click();
    } else {
      // Click any result to verify dismissal
      await results.first().click();
    }

    // Results should be dismissed
    const resultsContainer = page.locator('.results-container');
    await expect(resultsContainer).toHaveAttribute('aria-hidden', 'true');
    await expect(resultsContainer).toHaveAttribute('inert', '');
    await expect(searchInput).toHaveAttribute('aria-expanded', 'false');

    // Search input should be cleared
    const value = await page.evaluate(() => {
      const input = document.querySelector(
        'input[name="quick-search"]',
      ) as HTMLInputElement;
      return input?.value ?? '';
    });
    expect(value).toBe('');
  });

  test('search keyboard controls focus and dismiss results', async ({
    page,
  }) => {
    await page.goto('/index.html');

    await page.evaluate(() => {
      const main = document.querySelector('main.body');
      const input = document.createElement('input');
      input.id = 'other-input';
      input.setAttribute('aria-label', 'Other input');
      const button = document.createElement('button');
      button.id = 'return-focus';
      button.textContent = 'Return focus';
      main?.prepend(input, button);
    });

    const searchInput = page.locator('input[name="quick-search"]');
    const otherInput = page.getByLabel('Other input');
    const returnFocus = page.getByRole('button', { name: 'Return focus' });

    await expect(searchInput).toBeEnabled();

    await otherInput.focus();
    await page.keyboard.press('/');
    await expect(otherInput).toHaveValue('/');
    await expect(searchInput).not.toBeFocused();

    await returnFocus.focus();
    await page.keyboard.press('/');
    await expect(searchInput).toBeFocused();

    await searchInput.fill('markdown');
    const results = page.locator('.results-container .results a');
    await expect(results.first()).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('ArrowDown');
    await expect(results.first()).toBeFocused();
    await expect(
      page.locator('.results-container [role="option"]').first(),
    ).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowDown');
    await expect(results.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(results.first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(searchInput).toBeFocused();

    await page.keyboard.press('Escape');
    const resultsContainer = page.locator('.results-container');
    await expect(resultsContainer).toHaveAttribute('aria-hidden', 'true');
    await expect(resultsContainer).toHaveAttribute('inert', '');

    await page.keyboard.press('Escape');
    await expect(returnFocus).toBeFocused();
  });
});
