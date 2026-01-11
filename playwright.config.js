// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const FRONTEND_BASE_URL = process.env.E2E_UI_BASE_URL || 'http://localhost:3000';

module.exports = defineConfig({
  testDir: './playwright',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: FRONTEND_BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm --prefix frontend start',
    url: FRONTEND_BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      // Ensure the UI suite never points to production/staging.
      E2E: 'true',
      REACT_APP_E2E: 'true',
      REACT_APP_API_BASE_URL: 'http://localhost:5000/api',

      // Keep CRA dev server from opening a browser window.
      BROWSER: 'none',
      PORT: '3000',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
