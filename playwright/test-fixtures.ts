import {
  test as base,
  expect,
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

// Scroll with a real wheel event and return the settled position. Firefox can
// pull a page that only scripts scrolled back to a link's fragment after layout
// changes, but not one the visitor scrolled.
export async function wheelScrollBy(
  page: Page,
  deltaY: number,
): Promise<number> {
  const start = await page.evaluate(() => window.scrollY);
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, deltaY);
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
