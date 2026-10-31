import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  use: {
    actionTimeout: 10000,
    baseURL: process.env.DEMO_URL || "http://127.0.0.1:3500",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: process.env.DEMO_URL
    ? undefined
    : {
        command: "PORT=3500 npm start",
        url: "http://127.0.0.1:3500/api/health",
        reuseExistingServer: false,
        timeout: 30000,
      },
  reporter: "list",
});
