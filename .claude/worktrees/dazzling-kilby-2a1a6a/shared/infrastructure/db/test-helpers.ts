import { sql } from "drizzle-orm";
import { getDb } from "./client";

/**
 * Wipes every application table. Call in beforeEach so tests never see
 * leftover rows from a previous test. TRUNCATE ... CASCADE also clears
 * guests/scan_events via their foreign keys.
 */
export async function resetDb(): Promise<void> {
  await getDb().execute(
    sql`TRUNCATE TABLE scan_events, guests, events, owner RESTART IDENTITY CASCADE`,
  );
}
