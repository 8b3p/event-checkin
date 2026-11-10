import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { testDatabaseUrl } from "./shared/infrastructure/db/test-database-url";

/** `npm run db:push:test` — pushes the schema to the local test database only. */
export default defineConfig({
  schema: "./shared/infrastructure/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: testDatabaseUrl(),
  },
});
