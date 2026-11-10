const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The docker-compose Postgres, on a database of its own so a test run never wipes door_dev. */
const DEFAULT_TEST_DATABASE_URL = "postgres://door:door@localhost:5433/door_test";

/**
 * The database the test suite runs against. The integration tests TRUNCATE
 * every table (see test-helpers.ts), so this deliberately ignores
 * DATABASE_URL — that one is the real database — and refuses anything that
 * isn't on this machine.
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `TEST_DATABASE_URL must point at a local database (got host "${host}"). ` +
        "The tests truncate every table, so they never run against a remote one.",
    );
  }
  return url;
}
