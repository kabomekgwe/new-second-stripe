import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 * Tests complete user flows including signup, signin, payments
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Sequential for payment tests (shared state)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1, // Retry on failure
  workers: 1, // Single worker for payment tests (Stripe integration)
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    apiBaseURL: process.env.API_URL || 'http://localhost:4917',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
      fullyParallel: false,
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
      },
      fullyParallel: false,
    },
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
      },
      fullyParallel: false,
    },
  ],
  outputDir: 'test-results/',
  // Run specific tests in CI
  grep: process.env.TEST_PATTERN ? new RegExp(process.env.TEST_PATTERN) : undefined,
});
