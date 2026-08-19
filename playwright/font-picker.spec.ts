import { test, expect, type Locator, type Page } from './test-fixtures';

async function getKnobTransform(locator: Locator) {
  return locator.evaluate(
    element => getComputedStyle(element, '::before').transform,
  );
}

function relativeLuminance(color: string): number {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Unsupported color: ${color}`);
  }
  const linear = channels.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [
    relativeLuminance(first),
    relativeLuminance(second),
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function expectAchromatic(color: string): void {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  expect(channels).toBeDefined();
  expect(new Set(channels).size).toBe(1);
}

async function getNeutralPalette(page: Page) {
  return page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const probe = document.createElement('span');
    probe.style.color = 'var(--fg2-color)';
    document.body.appendChild(probe);
    const secondary = getComputedStyle(probe).color;
    probe.remove();
    return {
      background: body.backgroundColor,
      foreground: body.color,
      secondary,
      secondaryBackground: getComputedStyle(document.documentElement)
        .getPropertyValue('--bg2-color')
        .trim(),
    };
  });
}

test.describe('font picker without JavaScript', () => {
  test('stays visible and disabled with the defaults', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/index.html');

    await expect(page.getByRole('group', { name: 'Font style' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Contrast' })).toBeVisible();
    const appearanceButtons = page.locator('.appearance-pickers button');
    await expect(appearanceButtons).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(appearanceButtons.nth(index)).toBeDisabled();
    }
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-font-preference',
      'serif',
    );
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-contrast-preference',
      'high',
    );

    await context.close();
  });
});

test.describe('configured appearance defaults', () => {
  test('renders serif and high contrast without JavaScript', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('http://localhost:8082/index.html');

    await expect(page.locator('html')).toHaveAttribute(
      'data-default-font-preference',
      'serif',
    );
    await expect(page.locator('html')).toHaveAttribute(
      'data-default-contrast-preference',
      'high',
    );
    await expect(page.locator('html')).toHaveAttribute(
      'data-font-preference',
      'serif',
    );
    await expect(page.locator('html')).toHaveAttribute(
      'data-contrast-preference',
      'high',
    );
    await expect(
      page.getByRole('button', { name: 'Use serif fonts' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: 'Use high contrast' }),
    ).toHaveAttribute('aria-pressed', 'true');
    const buttons = page.locator('.appearance-pickers button');
    await expect(buttons).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(buttons.nth(index)).toBeDisabled();
    }

    await context.close();
  });

  test('requests only the configured default font pairing', async ({
    page,
  }) => {
    const fontRequests: string[] = [];
    page.on('request', request => {
      const pathname = decodeURIComponent(new URL(request.url()).pathname);
      if (pathname.endsWith('.woff2')) {
        fontRequests.push(pathname);
      }
    });

    await page.goto('http://localhost:8082/index.html');
    await page.waitForLoadState('networkidle');

    expect(fontRequests).toContain(
      '/source-serif-4/SourceSerif4-VariableFont_opsz,wght.woff2',
    );
    expect(fontRequests).toContain(
      '/libertinus-mono/LibertinusMono-Regular.woff2',
    );
    expect(fontRequests).not.toContain('/inter/InterVariable.woff2');
    expect(fontRequests).not.toContain(
      '/google-sans-code/GoogleSansCodeVariable.woff2',
    );
  });

  test('persists opposite overrides and clears configured defaults', async ({
    page,
  }) => {
    await page.goto('http://localhost:8082/index.html');
    await page.getByRole('button', { name: 'Use sans-serif fonts' }).click();
    await page.getByRole('button', { name: 'Use standard contrast' }).click();

    expect(
      await page.evaluate(() => localStorage.getItem('fontPreference')),
    ).toBe('sans');
    expect(
      await page.evaluate(() => localStorage.getItem('contrastPreference')),
    ).toBe('standard');

    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-font-preference',
      'serif',
    );
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-contrast-preference',
      'high',
    );
    await expect(
      page.getByRole('button', { name: 'Use sans-serif fonts' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: 'Use standard contrast' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('link', { name: 'Next page' }).click();
    await expect(page).toHaveURL('http://localhost:8082/next.html');
    await expect(
      page.getByRole('button', { name: 'Use sans-serif fonts' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: 'Use standard contrast' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Use serif fonts' }).click();
    await page.getByRole('button', { name: 'Use high contrast' }).click();
    expect(
      await page.evaluate(() => localStorage.getItem('fontPreference')),
    ).toBeNull();
    expect(
      await page.evaluate(() => localStorage.getItem('contrastPreference')),
    ).toBeNull();
  });

  test('applies stored opposite overrides before component mounting', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('fontPreference', 'sans');
      localStorage.setItem('contrastPreference', 'standard');
    });

    await page.goto('http://localhost:8082/index.html');

    await expect(page.locator('html')).not.toHaveAttribute(
      'data-font-preference',
      'serif',
    );
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-contrast-preference',
      'high',
    );
  });
});

test.describe('appearance pickers', () => {
  test('switches system stacks and exposes the selected option', async ({
    page,
  }) => {
    await page.goto('/index.html');

    const group = page.getByRole('group', { name: 'Font style' });
    const sans = page.getByRole('button', { name: 'Use sans-serif fonts' });
    const serif = page.getByRole('button', { name: 'Use serif fonts' });
    const standardContrast = page.getByRole('button', {
      name: 'Use standard contrast',
    });
    const highContrast = page.getByRole('button', {
      name: 'Use high contrast',
    });
    await expect(group).toBeVisible();
    await expect(sans).toHaveAttribute('aria-pressed', 'true');
    await expect(serif).toHaveAttribute('aria-pressed', 'false');
    await expect(standardContrast).toHaveAttribute('aria-pressed', 'true');
    await expect(highContrast).toHaveAttribute('aria-pressed', 'false');

    await serif.click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-font-preference',
      'serif',
    );
    await expect(serif).toHaveAttribute('aria-pressed', 'true');
    await expect(sans).toHaveAttribute('aria-pressed', 'false');

    const fonts = await page.evaluate(() => ({
      body: getComputedStyle(document.body).fontFamily,
      bodySize: getComputedStyle(document.body).fontSize,
      lineHeight: getComputedStyle(document.documentElement)
        .getPropertyValue('--line-height')
        .trim(),
      code: getComputedStyle(document.querySelector('code')!).fontFamily,
    }));
    expect(fonts.body).toContain('Source Serif 4');
    expect(fonts.bodySize).toBe('16px');
    expect(fonts.lineHeight).toBe('1.7');
    expect(fonts.code).toContain('Libertinus Mono');
    expect(
      await page.evaluate(() => localStorage.getItem('fontPreference')),
    ).toBe('serif');
  });

  test('requests bundled serif fonts only after serif mode is selected', async ({
    page,
  }) => {
    const fontRequests: string[] = [];
    page.on('request', request => {
      const pathname = decodeURIComponent(new URL(request.url()).pathname);
      if (
        pathname.includes('/source-serif-4/') ||
        pathname.includes('/libertinus-mono/')
      ) {
        fontRequests.push(pathname);
      }
    });

    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');

    expect(fontRequests).toEqual([]);
    await expect(
      page.locator(
        'link[rel="preload"][as="font"][href*="source-serif-4"], link[rel="preload"][as="font"][href*="libertinus-mono"]',
      ),
    ).toHaveCount(0);

    await page.evaluate(() => {
      const italicProbe = document.createElement('em');
      italicProbe.textContent = 'Serif italic probe';
      document.querySelector('main')!.appendChild(italicProbe);
    });
    await page.getByRole('button', { name: 'Use serif fonts' }).click();
    await page.evaluate(async () => {
      await Promise.all([
        document.fonts.load('400 16px "Source Serif 4"', 'Serif'),
        document.fonts.load('italic 400 16px "Source Serif 4"', 'Italic'),
        document.fonts.load('400 16px "Libertinus Mono"', 'Code'),
      ]);
    });

    expect(fontRequests).toContain(
      '/source-serif-4/SourceSerif4-VariableFont_opsz,wght.woff2',
    );
    expect(fontRequests).toContain(
      '/source-serif-4/SourceSerif4-Italic-VariableFont_opsz,wght.woff2',
    );
    expect(fontRequests).toContain(
      '/libertinus-mono/LibertinusMono-Regular.woff2',
    );
  });

  test('keeps content visible while selected serif fonts are loading', async ({
    page,
  }) => {
    let resolveFontRequest: (() => void) | undefined;
    const fontRequestStarted = new Promise<void>(resolve => {
      resolveFontRequest = resolve;
    });

    await page.route('**/*.woff2', async route => {
      const pathname = decodeURIComponent(
        new URL(route.request().url()).pathname,
      );
      if (
        pathname.includes('/source-serif-4/') ||
        pathname.includes('/libertinus-mono/')
      ) {
        resolveFontRequest?.();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      await route.continue();
    });

    await page.goto('/index.html');
    await page.getByRole('button', { name: 'Use serif fonts' }).click();
    await fontRequestStarted;

    await expect(page.locator('main.body')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'data-font-preference',
      'serif',
    );
  });

  test('uses an achromatic enhanced-contrast palette in light and dark modes', async ({
    page,
  }) => {
    await page.goto('/index.html');
    const high = page.getByRole('button', { name: 'Use high contrast' });
    await high.click();

    await expect(page.locator('html')).toHaveAttribute(
      'data-contrast-preference',
      'high',
    );
    await expect(high).toHaveAttribute('aria-pressed', 'true');
    expect(
      await page.evaluate(() => localStorage.getItem('contrastPreference')),
    ).toBe('high');

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      const palette = await getNeutralPalette(page);
      expectAchromatic(palette.background);
      expectAchromatic(palette.foreground);
      expectAchromatic(palette.secondary);
      if (colorScheme === 'light') {
        expect(palette.secondaryBackground).toBe('#f4f4f4');
      }
      expect(
        contrastRatio(palette.foreground, palette.background),
      ).toBeGreaterThan(20.9);
      expect(
        contrastRatio(palette.secondary, palette.background),
      ).toBeGreaterThan(7);
    }
  });

  test('persists across reload and client-side navigation, then resets', async ({
    page,
  }) => {
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'Use serif fonts' }).click();
    await page.getByRole('button', { name: 'Use high contrast' }).click();

    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Use serif fonts' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: 'Use high contrast' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.locator('main.body a[href="/markdown.html"]').click();
    await expect(page).toHaveURL(/markdown\.html/);
    await expect(
      page.getByRole('button', { name: 'Use serif fonts' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: 'Use high contrast' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Use standard contrast' }).click();
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-contrast-preference',
      'high',
    );
    expect(
      await page.evaluate(() => localStorage.getItem('contrastPreference')),
    ).toBeNull();
    await expect(
      page.getByRole('button', { name: 'Use serif fonts' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Use sans-serif fonts' }).click();
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-font-preference',
      'serif',
    );
    expect(
      await page.evaluate(() => localStorage.getItem('fontPreference')),
    ).toBeNull();
  });

  test('uses standard control treatments without moving either knob', async ({
    page,
  }) => {
    await page.goto('/index.html');

    for (const { group, alternate, reset } of [
      {
        group: page.getByRole('group', { name: 'Font style' }),
        alternate: page.getByRole('button', { name: 'Use serif fonts' }),
        reset: page.getByRole('button', { name: 'Use sans-serif fonts' }),
      },
      {
        group: page.getByRole('group', { name: 'Contrast' }),
        alternate: page.getByRole('button', { name: 'Use high contrast' }),
        reset: page.getByRole('button', { name: 'Use standard contrast' }),
      },
    ]) {
      const options = group.getByRole('button');
      const firstBox = await options.nth(0).boundingBox();
      const secondBox = await options.nth(1).boundingBox();
      expect(firstBox).not.toBeNull();
      expect(secondBox).not.toBeNull();
      expect(secondBox!.x - (firstBox!.x + firstBox!.width)).toBeGreaterThan(0);

      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        const knobBefore = await getKnobTransform(group);
        const colorBefore = await alternate.evaluate(
          element => getComputedStyle(element).color,
        );

        await alternate.hover();
        expect(await getKnobTransform(group)).toBe(knobBefore);
        expect(
          await alternate.evaluate(element => getComputedStyle(element).color),
        ).toBe(colorBefore);

        const box = await alternate.boundingBox();
        expect(box).not.toBeNull();
        await page.mouse.move(
          box!.x + box!.width / 2,
          box!.y + box!.height / 2,
        );
        await page.mouse.down();
        expect(await getKnobTransform(group)).toBe(knobBefore);
        expect(
          await alternate.evaluate(
            element => getComputedStyle(element).transform,
          ),
        ).toBe('none');
        await page.mouse.up();
        expect(
          await alternate.evaluate(
            element => getComputedStyle(element).backgroundColor,
          ),
        ).toBe('rgba(0, 0, 0, 0)');

        await page.waitForTimeout(200);
        expect(await getKnobTransform(group)).not.toBe(knobBefore);
        await reset.click();
        await page.waitForTimeout(200);
      }
    }
  });

  test('appears without the attribution footer on all page templates', async ({
    page,
  }) => {
    for (const path of [
      '/index.html',
      '/lectures/01/rectangle.py.html',
      '/lectures/01/Pair.java.html',
    ]) {
      await page.goto(path);
      await expect(page.locator('footer')).toHaveCount(0);
      await expect(
        page.getByRole('group', { name: 'Font style' }),
      ).toBeVisible();
      await expect(page.getByRole('group', { name: 'Contrast' })).toBeVisible();
    }
  });

  test('is excluded from printing', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.appearance-pickers')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.appearance-pickers')).toBeHidden();
  });
});
