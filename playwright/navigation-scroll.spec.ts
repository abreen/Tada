import { test, expect } from '@playwright/test';

test.describe('scroll and hash behavior', () => {
  test('same-page hash links scroll to target', async ({ page }) => {
    await page.goto('/markdown.html');

    // The markdown page has a TOC; click a TOC link
    const tocLink = page.locator('nav.toc ol a').first();
    const href = await tocLink.getAttribute('href');
    expect(href).toBeTruthy();
    const targetId = href!.slice(1);

    await tocLink.click();

    // URL should have the hash
    const escapedId = targetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(page).toHaveURL(new RegExp(`#${escapedId}`));

    // Wait for smooth scroll to finish
    await page.waitForTimeout(500);

    // Target element should be visible in the viewport
    const targetTop = await page.evaluate(id => {
      const el = document.getElementById(id);
      return el?.getBoundingClientRect().top ?? Infinity;
    }, targetId);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(targetTop).toBeLessThan(viewportHeight);
    expect(targetTop).toBeGreaterThanOrEqual(-50); // allow slight overshoot
  });

  test('hash in cross-page navigation scrolls to target', async ({ page }) => {
    // First, find a heading ID on the markdown page
    await page.goto('/markdown.html');
    const headingId = await page.evaluate(() => {
      const h2 = document.querySelector('main.body h2[id]');
      return h2?.id ?? null;
    });
    expect(headingId).toBeTruthy();

    // Go to home and navigate with hash
    await page.goto('/index.html');
    await page.evaluate(() => {
      (window as any).__navMarker = 'alive';
    });

    // Inject a link with hash and click it
    await page.evaluate(hash => {
      const a = document.createElement('a');
      a.href = `/markdown.html#${hash}`;
      a.textContent = 'test link';
      a.id = 'test-hash-link';
      document.querySelector('main.body')!.appendChild(a);
    }, headingId!);

    await page.locator('#test-hash-link').click();
    await expect(page).toHaveURL(new RegExp(`markdown\\.html#${headingId}`));

    // Wait for scroll
    await page.waitForTimeout(500);

    const targetTop = await page.evaluate(id => {
      const el = document.getElementById(id);
      return el?.getBoundingClientRect().top ?? Infinity;
    }, headingId!);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(targetTop).toBeLessThan(viewportHeight);

    // Should have been SPA navigation
    const marker = await page.evaluate(() => (window as any).__navMarker);
    expect(marker).toBe('alive');
  });

  test('back button after hash navigation stays on same page', async ({
    page,
  }) => {
    await page.goto('/markdown.html');

    // Click a TOC link
    const tocLink = page.locator('nav.toc ol a').first();
    await tocLink.click();

    // URL now has hash
    expect(page.url()).toContain('#');

    // Go back should remove the hash, stay on same page
    await page.goBack();
    await expect(page.locator('h1')).toContainText('Markdown Examples');
  });

  test(':target moves between line-number clicks on the same page', async ({
    page,
  }) => {
    await page.goto('/lectures/01/Rectangle.java.html');

    // Click line 7
    await page.locator('a.line-number#L7').click();
    await expect(page).toHaveURL(/#L7$/);

    let matches = await page.evaluate(() => ({
      l7: document.getElementById('L7')?.matches(':target') ?? false,
      l40: document.getElementById('L40')?.matches(':target') ?? false,
    }));
    expect(matches.l7).toBe(true);
    expect(matches.l40).toBe(false);

    // Click line 40
    await page.locator('a.line-number#L40').click();
    await expect(page).toHaveURL(/#L40$/);

    matches = await page.evaluate(() => ({
      l7: document.getElementById('L7')?.matches(':target') ?? false,
      l40: document.getElementById('L40')?.matches(':target') ?? false,
    }));
    expect(matches.l7).toBe(false);
    expect(matches.l40).toBe(true);
  });

  test('cross-page hash navigation sets :target on the new page', async ({
    page,
  }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
      (window as any).__navMarker = 'alive';
    });

    // Inject a link to a code page with a hash and click it
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = '/lectures/01/Rectangle.java.html#L20';
      a.textContent = 'jump to L20';
      a.id = 'test-cross-hash-link';
      document.querySelector('main.body')!.appendChild(a);
    });

    await page.locator('#test-cross-hash-link').click();
    await expect(page).toHaveURL(/Rectangle\.java\.html#L20$/);

    // Should have been SPA navigation
    const marker = await page.evaluate(() => (window as any).__navMarker);
    expect(marker).toBe('alive');

    // L20 should match :target
    const isTarget = await page.evaluate(
      () => document.getElementById('L20')?.matches(':target') ?? false,
    );
    expect(isTarget).toBe(true);
  });

  test('refresh preserves scroll position to hash target', async ({ page }) => {
    await page.goto('/lectures/01/Rectangle.java.html');

    // Click a line far down the page
    await page.locator('a.line-number#L40').click();
    await expect(page).toHaveURL(/#L40$/);

    // Refresh
    await page.reload();

    // Wait for the manual scroll-to-hash that runs after per-page
    // components mount.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document.getElementById('L40')?.getBoundingClientRect().top ??
              Infinity,
          ),
        { timeout: 5000 },
      )
      .toBeLessThan(await page.evaluate(() => window.innerHeight));

    const targetTop = await page.evaluate(
      () => document.getElementById('L40')?.getBoundingClientRect().top ?? -1,
    );
    expect(targetTop).toBeGreaterThanOrEqual(-50);

    // :target should still match after reload
    const isTarget = await page.evaluate(
      () => document.getElementById('L40')?.matches(':target') ?? false,
    );
    expect(isTarget).toBe(true);
  });

  test('TOC current-line indicator follows hash clicks', async ({ page }) => {
    await page.goto('/lectures/01/Rectangle.java.html');

    // Click line 20
    await page.locator('a.line-number#L20').click();
    await expect(page).toHaveURL(/#L20$/);

    // Wait for the TOC current-line indicator to appear (TOC mount is
    // asynchronous and may settle after the initial click).
    await expect(page.locator('nav.toc li.current')).toHaveCount(1, {
      timeout: 5000,
    });
    const currentText1 = await page
      .locator('nav.toc li.current')
      .first()
      .textContent();

    // Click a different line and verify the current item moves
    await page.locator('a.line-number#L40').click();
    await expect(page).toHaveURL(/#L40$/);

    await expect
      .poll(() => page.locator('nav.toc li.current').first().textContent(), {
        timeout: 5000,
      })
      .not.toBe(currentText1);
  });

  test('back-to-top clears :target and scrolls to top', async ({ page }) => {
    await page.goto('/lectures/01/Rectangle.java.html');

    await page.locator('a.line-number#L40').click();
    await expect(page).toHaveURL(/#L40$/);

    // The back-to-top button only shows past a scroll threshold
    await page.waitForFunction(() => window.scrollY > 250);

    await page
      .locator('a.button.is-visible', { hasText: 'Back to top' })
      .click();

    // URL should have no fragment
    await expect(page).toHaveURL(/Rectangle\.java\.html$/);

    // No element should match :target
    const anyTarget = await page.evaluate(
      () => document.querySelector(':target') !== null,
    );
    expect(anyTarget).toBe(false);

    // Scroll position should be at the top
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });

  test('per-page components re-mount after navigation', async ({ page }) => {
    await page.goto('/markdown.html');
    await expect(page.locator('nav.toc')).toBeVisible();

    // Navigate to home using JS click
    await page.evaluate(() => {
      const link = document.querySelector(
        'a[href="/index.html"]',
      ) as HTMLAnchorElement;
      if (link) {
        link.click();
      }
    });
    await expect(page).toHaveURL(/index\.html/);

    // Navigate back to markdown
    await page.evaluate(() => {
      const link = document.querySelector(
        'a[href="/markdown.html"]',
      ) as HTMLAnchorElement;
      if (link) {
        link.click();
      }
    });
    await expect(page).toHaveURL(/markdown\.html/);

    // TOC should be present and functional
    await expect(page.locator('nav.toc')).toBeVisible();
    const tocItems = await page.locator('nav.toc ol li').count();
    expect(tocItems).toBeGreaterThan(0);
  });
});
