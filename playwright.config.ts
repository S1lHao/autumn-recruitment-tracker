import { defineConfig, devices } from "@playwright/test";
import nextEnv from "@next/env";
import { loadE2EEnvironment } from "./e2e/helpers/supabase-admin";

// Loading the configuration is an intentional safety gate: browser tests never
// start Next.js or mutate data unless every target is the dedicated local stack.
nextEnv.loadEnvConfig(process.cwd());
const environment = loadE2EEnvironment();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: environment.siteUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: environment.siteUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: environment.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: environment.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: environment.serviceRoleKey,
      NEXT_PUBLIC_SITE_URL: environment.siteUrl,
      INITIAL_ADMIN_EMAIL: environment.initialAdminEmail,
    },
  },
});
