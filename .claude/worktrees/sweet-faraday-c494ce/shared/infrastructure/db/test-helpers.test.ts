import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "./client";
import { owner } from "./schema";
import { resetDb } from "./test-helpers";

describe("resetDb", () => {
  beforeEach(resetDb);

  it("wipes rows inserted by a previous call", async () => {
    await getDb().insert(owner).values({ email: "a@example.com", passwordHash: "x" });
    await resetDb();

    const rows = await getDb().select().from(owner).where(eq(owner.email, "a@example.com"));
    expect(rows).toHaveLength(0);
  });

  it("resets auto-increment ids", async () => {
    const [first] = await getDb()
      .insert(owner)
      .values({ email: "a@example.com", passwordHash: "x" })
      .returning({ id: owner.id });
    await resetDb();

    const [second] = await getDb()
      .insert(owner)
      .values({ email: "b@example.com", passwordHash: "x" })
      .returning({ id: owner.id });

    expect(second.id).toBe(first.id);
  });
});
