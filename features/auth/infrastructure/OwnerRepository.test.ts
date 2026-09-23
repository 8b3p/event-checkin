import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/shared/infrastructure/db/test-helpers";
import { OwnerRepository } from "./OwnerRepository";

describe("OwnerRepository (integration)", () => {
  beforeEach(resetDb);

  it("has no owner before setup", async () => {
    expect(await new OwnerRepository().get()).toBeNull();
  });

  it("creates, retrieves, and updates the owner's password", async () => {
    const repo = new OwnerRepository();
    await repo.create({ email: "Owner@Example.com", passwordHash: "hash1" });

    const owner = await repo.get();
    expect(owner?.email).toBe("owner@example.com");
    expect(owner?.passwordHash).toBe("hash1");

    await repo.updatePassword("hash2");
    expect((await repo.get())?.passwordHash).toBe("hash2");
  });

  it("throws updating a password with no owner set up", async () => {
    await expect(new OwnerRepository().updatePassword("hash2")).rejects.toThrow();
  });
});
