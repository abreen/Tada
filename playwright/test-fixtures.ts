import {
  test as base,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

type IstanbulCoverage = Record<string, unknown>;

interface CoverageWindow {
  __coverage__?: IstanbulCoverage;
}

const repoDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const coverageDir = path.join(repoDir, 'coverage', 'playwright');

function coverageEnabled(testInfo: { config: { metadata?: unknown } }) {
  const metadata = testInfo.config.metadata;
  return Boolean(
    metadata &&
    typeof metadata === 'object' &&
    (metadata as Record<string, unknown>).coverage === true,
  );
}

function coverageFileName(testInfo: { workerIndex: number; testId: string }) {
  const safeTestId = testInfo.testId.replace(/[^a-zA-Z0-9.-]+/g, '-');
  return `coverage-browser-${testInfo.workerIndex}-${safeTestId}-${Date.now()}.json`;
}

async function writeBrowserCoverage(page: Page, testInfo: TestInfo) {
  if (page.isClosed()) {
    return;
  }

  const coverage = await page
    .evaluate(() => (window as CoverageWindow).__coverage__ ?? null)
    .catch(() => null);

  if (!coverage) {
    return;
  }

  fs.mkdirSync(coverageDir, { recursive: true });
  fs.writeFileSync(
    path.join(coverageDir, coverageFileName(testInfo)),
    JSON.stringify(coverage),
  );
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page);
    if (coverageEnabled(testInfo)) {
      await writeBrowserCoverage(page, testInfo);
    }
  },
});

export { expect };
export type { Locator, Page } from '@playwright/test';

// Scroll like a visitor and return the settled position. Firefox can pull a
// page that only scripts scrolled back to a link's fragment after layout
// changes, but not one scrolled with the wheel. Other browsers do not need real
// input, and Playwright's WebKit does not scroll the page on a wheel event on
// Linux.
export async function visitorScrollBy(
  page: Page,
  deltaY: number,
): Promise<number> {
  const start = await page.evaluate(() => window.scrollY);
  if (page.context().browser()?.browserType().name() === 'firefox') {
    await page.mouse.move(400, 300);
    await page.mouse.wheel(0, deltaY);
  } else {
    await page.evaluate(top => window.scrollBy({ top }), deltaY);
  }
  let last = start;
  await expect
    .poll(async () => {
      const current = await page.evaluate(() => window.scrollY);
      const settled = current !== start && current === last;
      last = current;
      return settled;
    })
    .toBe(true);
  return last;
}

export async function waitForClientMount(page: Page) {
  // Appearance controls enable after all persistent components have mounted.
  await expect(
    page.getByRole('switch', { name: 'Use serif fonts' }),
  ).toBeEnabled();
}

export interface Point {
  x: number;
  y: number;
}

// Puts a finger down at the start; it then moves through each point in steps.
// Real touches, which honor touch-action, need Chromium's DevTools protocol.
export async function touch(page: Page, start: Point) {
  const cdp = await page.context().newCDPSession(page);
  let at = start;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [at],
  });
  return {
    async moveTo(to: Point, steps = 8) {
      const from = at;
      for (let step = 1; step <= steps; step++) {
        at = {
          x: from.x + ((to.x - from.x) * step) / steps,
          y: from.y + ((to.y - from.y) * step) / steps,
        };
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [at],
        });
      }
    },
    async lift() {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await cdp.detach();
    },
  };
}

// Where a finger would press the element. Touches do not scroll it into view.
export async function centerOf(locator: Locator): Promise<Point> {
  await locator.scrollIntoViewIfNeeded();
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
