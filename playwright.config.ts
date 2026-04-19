import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './playwright',
  timeout: 10_000,
  retries: 0,
  use: { baseURL: 'http://localhost:8081', headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'bun run playwright/serve-test-site.ts',
    url: 'http://localhost:8081/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
