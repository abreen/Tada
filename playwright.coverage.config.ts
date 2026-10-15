import { defineConfig } from '@playwright/test';
import { assignPorts } from './playwright/ports';

const ports = await assignPorts();

export default defineConfig({
  testDir: './playwright',
  timeout: 10_000,
  retries: 0,
  metadata: { coverage: true },
  use: { baseURL: `http://localhost:${ports.test}`, headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: `bun run playwright/serve-test-site.ts --coverage --port ${ports.test}`,
      url: `http://localhost:${ports.test}/index.html`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bun run playwright/serve-appearance-defaults-site.ts --coverage --port ${ports.appearance}`,
      url: `http://localhost:${ports.appearance}/custom/index.html`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bun run playwright/serve-no-nav-site.ts --coverage --port ${ports.noNavSearch}`,
      url: `http://localhost:${ports.noNavSearch}/index.html`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bun run playwright/serve-no-nav-site.ts --no-search --coverage --port ${ports.noNavStatic}`,
      url: `http://localhost:${ports.noNavStatic}/index.html`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
