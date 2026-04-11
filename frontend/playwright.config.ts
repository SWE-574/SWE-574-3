import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E test configuration.
 *
 * The full stack (nginx + backend + frontend + db + redis) is expected to
 * already be running before `npm run test:e2e` is invoked.
 * In CI this is handled by the ci-e2e.yml workflow via docker compose.
 * Locally use `make test-e2e` which does the same.
 *
 * Override the base URL with:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 npm run test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* Two workers gives a good balance — cuts test time roughly in half
     without overloading the CI backend container.  Each test authenticates
     via a fast API call (loginAs), so concurrent sessions are lightweight.
     Locally you can bump this further if your machine can handle it. */
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,

  /* Fail CI fast if someone left `.only` in a test file */
  forbidOnly: !!process.env.CI,

  /* Retry flaky tests only on CI */
  retries: process.env.CI ? 2 : 0,

  /* CI Docker can be slow — give each test enough headroom */
  timeout: process.env.CI ? 60_000 : 30_000,

  /* Reporters */
  reporter: [
    ['list'],
    ['html',  { outputFolder: 'tests/reports/playwright', open: 'never' }],
    ['junit', { outputFile: 'tests/reports/playwright-junit.xml' }],
  ],

  use: {
    /* Where the app is served (nginx proxy → backend + frontend) */
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost',

    /* Collect trace / screenshot / video on first retry so failures are debuggable */
    trace:      'on-first-retry',
    screenshot: 'only-on-failure',
    video:      'on-first-retry',

    /* Be generous with navigation timeouts – docker cold-starts can be slow */
    navigationTimeout: 30_000,
    actionTimeout:     15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
