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
