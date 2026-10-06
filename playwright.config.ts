import { defineConfig } from '@playwright/test';

// Chromium runs every spec. WebKit and Firefox run the specs where engines
// differ most: client-side navigation, history and scroll restoration, and
// fragment targets, plus a few layout and font specs on WebKit.
const webkitSpecs = [
  'author-byline',
  'breadcrumbs',
  'external-link-wrapping',
  'font-loading',
  'header-layout',
  'navigation',
  'navigation-download',
  'navigation-history',
  'navigation-same-page',
  'navigation-scroll',
  'navigation-target',
  'search-recovery',
  'trace-navigation',
];

const firefoxSpecs = [
  'breadcrumbs',
  'navigation-download',
  'navigation-history',
  'navigation-same-page',
  'navigation-scroll',
  'navigation-target',
  'search-recovery',
  'trace-navigation',
];

const matchSpecs = (specs: string[]) =>
  specs.map(spec => `**/${spec}.spec.ts`);

export default defineConfig({
  testDir: './playwright',
  timeout: 20_000,
  retries: 0,
  use: { baseURL: 'http://localhost:8081', headless: true },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    {
      name: 'webkit',
      testMatch: matchSpecs(webkitSpecs),
      use: { browserName: 'webkit' },
    },
    {
      name: 'firefox',
      testMatch: matchSpecs(firefoxSpecs),
      use: { browserName: 'firefox' },
    },
  ],
  webServer: [
    {
      command: 'bun run playwright/serve-test-site.ts',
      url: 'http://localhost:8081/index.html',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'bun run playwright/serve-appearance-defaults-site.ts',
      url: 'http://localhost:8082/custom/index.html',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
