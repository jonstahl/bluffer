import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // shared SQLite DB — don't parallelise writes
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    storageState: 'tests/.auth.json',
  },
  globalSetup: './tests/global-setup.ts',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
