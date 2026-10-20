import { defineConfig } from "vitest/config";
import { loadEnvFile } from "node:process";
loadEnvFile(".env.local");
export default defineConfig({
  resolve: { preserveSymlinks: true },
  test: {
    environment: "node",
    pool: "threads",
    maxWorkers: 1,
    include: ["integration/live-providers.test.ts"],
    testTimeout: 180000,
  },
});
