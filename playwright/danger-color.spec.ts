import { expect, test, type Page } from './test-fixtures';

// Injects probe elements covering both nesting orders of the strong/em pair,
// standalone elements, and a pair inside a link
async function injectProbes(page: Page) {
  await page.evaluate(() => {
    const holder = document.createElement('div');
    holder.id = 'danger-probes';
    holder.innerHTML = String.raw`
      <strong data-probe="strong-outer"><em data-probe="em-inner">x</em></strong>
      <em data-probe="em-outer"><strong data-probe="strong-inner">x</strong></em>
      <strong data-probe="strong-alone">x</strong>
      <em data-probe="em-alone">x</em>
      <a href="#" data-probe="link">
        <strong data-probe="link-strong"><em data-probe="link-em">x</em></strong>
      </a>`;
    document.body.appendChild(holder);
  });
}

// Returns the probe's computed color, or the body's for 'body'
async function getProbeColor(page: Page, probe: string) {
  const color = await page.evaluate(probe => {
    const el =
      probe === 'body'
        ? document.body
        : document.querySelector(`[data-probe="${probe}"]`);
    return el ? getComputedStyle(el).color : null;
  }, probe);
  if (color === null) {
    throw new Error(`No probe element for ${probe}`);
  }
  return color;
}

function channels(color: string) {
  return color
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number);
}

// Sets --tint-hue on the root and returns the danger pair's RGB channels
async function getDangerChannels(page: Page, tintHue: number) {
  await page.evaluate(hue => {
    document.documentElement.style.setProperty('--tint-hue', `${hue}deg`);
  }, tintHue);
  return channels(await getProbeColor(page, 'strong-outer'));
}

test.describe('danger text color', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await injectProbes(page);
  });

  test('colors both elements of a nested pair, in either order', async ({
    page,
  }) => {
    const foreground = await getProbeColor(page, 'strong-alone');

    const outer = await getProbeColor(page, 'strong-outer');
    const inner = await getProbeColor(page, 'em-inner');
    expect(outer).toEqual(inner);
    expect(outer).not.toEqual(foreground);

    const emOuter = await getProbeColor(page, 'em-outer');
    const strongInner = await getProbeColor(page, 'strong-inner');
    expect(emOuter).toEqual(strongInner);
    expect(emOuter).not.toEqual(foreground);
  });

  test('reads as red', async ({ page }) => {
    for (const probe of ['strong-outer', 'em-outer']) {
      const [r, g, b] = channels(await getProbeColor(page, probe));
      expect(r).toBeGreaterThan(g);
      expect(r).toBeGreaterThan(b);
    }
  });

  test('leaves standalone strong and em at the foreground color', async ({
    page,
  }) => {
    const foreground = await getProbeColor(page, 'body');
    expect(await getProbeColor(page, 'strong-alone')).toEqual(foreground);
    expect(await getProbeColor(page, 'em-alone')).toEqual(foreground);
  });

  test('keeps pairs inside links at the link color', async ({ page }) => {
    const link = await getProbeColor(page, 'link');
    const danger = await getProbeColor(page, 'strong-outer');
    expect(await getProbeColor(page, 'link-strong')).toEqual(link);
    expect(await getProbeColor(page, 'link-em')).toEqual(link);
    expect(link).not.toEqual(danger);
  });

  test('follows a tint hue changed at runtime', async ({ page }) => {
    expect(await getDangerChannels(page, 120)).not.toEqual(
      await getDangerChannels(page, 300),
    );
  });

  test('changes gradually all the way around the hue wheel', async ({
    page,
  }) => {
    let previous = await getDangerChannels(page, 0);
    for (let tintHue = 10; tintHue <= 360; tintHue += 10) {
      const current = await getDangerChannels(page, tintHue);
      for (const [i, channel] of current.entries()) {
        expect(Math.abs(channel - previous[i])).toBeLessThan(8);
      }
      previous = current;
    }
  });

  test('is lighter in dark mode', async ({ page }) => {
    const sum = (channels: number[]) => channels.reduce((a, b) => a + b, 0);
    const light = await getDangerChannels(page, 190);
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await getDangerChannels(page, 190);
    expect(sum(dark)).toBeGreaterThan(sum(light));
  });
});
