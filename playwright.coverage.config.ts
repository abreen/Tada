import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './playwright',
  timeout: 10_000,
  retries: 0,
  metadata: { coverage: true },
  use: { baseURL: 'http://localhost:8081', headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'bun run playwright/serve-test-site.ts --coverage',
    url: 'http://localhost:8081/index.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
