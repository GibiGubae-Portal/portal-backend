import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations must use a direct (non-pooled) connection; fall back to DATABASE_URL.
// `prisma generate` does not connect, so an empty value is fine there.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
