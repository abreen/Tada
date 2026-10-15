import { defineConfig } from '@playwright/test';
import { assignPorts } from './playwright/ports';

const ports = await assignPorts();

// Chromium runs every spec. WebKit and Firefox run the specs where engines
// differ most: client-side navigation, history and scroll restoration, and
// fragment targets (including tabs and search highlights, which reveal hidden
// content for them), plus a few layout and font specs on WebKit.
const webkitSpecs = [
  'author-byline',
  'breadcrumbs',
  'document-index',
  'details-preview',
  'details-scroll',
  'external-link-wrapping',
  'font-loading',
  'header-layout',
  'navigation',
  'navigation-download',
  'navigation-history',
  'navigation-same-page',
  'navigation-scroll',
  'navigation-target',
  'search-highlight',
  'search-recovery',
  'tabs',
  'toc-highlight',
  'trace-navigation',
];

const firefoxSpecs = [
  'breadcrumbs',
  'details-preview',
  'details-scroll',
  'navigation-download',
  'navigation-history',
  'navigation-same-page',
  'navigation-scroll',
  'navigation-target',
  'search-highlight',
  'search-recovery',
  'tabs',
  'toc-highlight',
  'trace-navigation',
];

const matchSpecs = (specs: string[]) => specs.map(spec => `**/${spec}.spec.ts`);

export default defineConfig({
  testDir: './playwright',
  timeout: 20_000,
  retries: 0,
  use: { baseURL: `http://localhost:${ports.test}`, headless: true },
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
      command: `bun run playwright/serve-test-site.ts --port ${ports.test}`,
      url: `http://localhost:${ports.test}/index.html`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bun run playwright/serve-appearance-defaults-site.ts --port ${ports.appearance}`,
      url: `http://localhost:${ports.appearance}/custom/index.html`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bun run playwright/serve-no-nav-site.ts --port ${ports.noNavSearch}`,
      url: `http://localhost:${ports.noNavSearch}/index.html`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bun run playwright/serve-no-nav-site.ts --no-search --port ${ports.noNavStatic}`,
      url: `http://localhost:${ports.noNavStatic}/index.html`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
