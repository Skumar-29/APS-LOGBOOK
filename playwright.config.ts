import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    locale: "en-AU",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.TEST_BROWSER_PATH || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote"],
    },
  },
  projects: [
    {
      name: "phone",
      use: {
        viewport: { width: 440, height: 956 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: "node scripts/test-server.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
