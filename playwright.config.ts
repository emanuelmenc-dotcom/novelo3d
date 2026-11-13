// SPDX-License-Identifier: GPL-3.0-or-later
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  workers: 3,
  timeout: 60_000,
  use: { channel: "msedge", baseURL: "http://localhost:5173" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
