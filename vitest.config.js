import "dotenv/config";
import { randomBytes } from "node:crypto";
import { defineConfig } from "vitest/config";

// Integration tests only ever use TEST_DATABASE_URL (a separate database).
// They are skipped when it is not set - they never fall back to DATABASE_URL.
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";

// Evaluated once in the main process, so every worker shares one throwaway
// schema. Integration tests never touch the real "public" schema.
const testSchema = `test_${Date.now()}_${randomBytes(3).toString("hex")}`;

const env = {
  NODE_ENV: "test",
  TEST_DATABASE_URL: testDatabaseUrl,
  DATABASE_URL: testDatabaseUrl,
  DIRECT_URL: testDatabaseUrl,
  DB_SCHEMA: testSchema,
  JWT_SECRET: "test-jwt-secret",
  SUPER_ADMINS: '["Test Super", "Second Super"]',
  FRONTEND_URL: "https://frontend.example.com",
  LOGIN_RATE_LIMIT: "1000",
};

export default defineConfig({
  test: {
    environment: "node",
    // Integration files share one database schema, so never run files in
    // parallel (a per-project setting is not honoured for this option).
    fileParallelism: false,
    projects: [
      {
        test: { name: "unit", include: ["tests/unit/**/*.test.js"], env },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.js"],
          env,
          globalSetup: ["./tests/helpers/globalSetup.js"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
