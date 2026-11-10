import "dotenv/config";
import { testDatabaseUrl } from "./shared/infrastructure/db/test-database-url";

// Overrides whatever .env loaded: the suite truncates tables, so it only ever
// talks to the local test database.
process.env.DATABASE_URL = testDatabaseUrl();
