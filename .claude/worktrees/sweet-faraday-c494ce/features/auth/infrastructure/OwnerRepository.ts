import { asc, eq } from "drizzle-orm";
import { getDb } from "@/shared/infrastructure/db/client";
import { owner as ownerTable } from "@/shared/infrastructure/db/schema";
import type { IOwnerRepository, Owner } from "../domain/IOwnerRepository";

export class OwnerRepository implements IOwnerRepository {
  async get(): Promise<Owner | null> {
    const rows = await getDb().select().from(ownerTable).orderBy(asc(ownerTable.id)).limit(1);
    const row = rows[0];
    return row ? { id: row.id, email: row.email, passwordHash: row.passwordHash } : null;
  }

  async create(input: { email: string; passwordHash: string }): Promise<void> {
    await getDb()
      .insert(ownerTable)
      .values({ email: input.email.toLowerCase().trim(), passwordHash: input.passwordHash });
  }

  async updatePassword(passwordHash: string): Promise<void> {
    const current = await this.get();
    if (!current) throw new Error("No owner account exists yet.");
    await getDb().update(ownerTable).set({ passwordHash }).where(eq(ownerTable.id, current.id));
  }
}
