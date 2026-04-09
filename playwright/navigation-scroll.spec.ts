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
