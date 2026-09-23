import { describe, expect, it } from "vitest";
import type { BulkGuestRow, CreateGuestInput, Guest, UpdateGuestInput } from "../Guest";
import type { IGuestRepository } from "../IGuestRepository";
import { CreateGuestUseCase } from "./CreateGuestUseCase";
import { DeleteGuestUseCase } from "./DeleteGuestUseCase";
import { GetGuestByCodeUseCase } from "./GetGuestByCodeUseCase";
import { GetGuestUseCase } from "./GetGuestUseCase";
import { ImportGuestsUseCase } from "./ImportGuestsUseCase";
import { ListGuestsForEventUseCase } from "./ListGuestsForEventUseCase";
import { UpdateGuestUseCase } from "./UpdateGuestUseCase";

class FakeGuestRepository implements IGuestRepository {
  rows: Guest[] = [];
  private nextId = 1;

  async listForEvent(eventId: number): Promise<Guest[]> {
    return this.rows.filter((row) => row.eventId === eventId);
  }

  async getById(eventId: number, id: number): Promise<Guest | null> {
    return this.rows.find((row) => row.id === id && row.eventId === eventId) ?? null;
  }

  async getByCode(code: string): Promise<Guest | null> {
    return this.rows.find((row) => row.code === code) ?? null;
  }

  async create(input: CreateGuestInput): Promise<Guest> {
    const guest: Guest = { id: this.nextId++, ...input, createdAt: new Date() };
    this.rows.push(guest);
    return guest;
  }

  async createMany(eventId: number, rows: BulkGuestRow[]): Promise<number> {
    for (const row of rows) {
      this.rows.push({ id: this.nextId++, eventId, ...row, source: "invited", createdAt: new Date() });
    }
    return rows.length;
  }

  async update(eventId: number, id: number, input: UpdateGuestInput): Promise<void> {
    const row = this.rows.find((r) => r.id === id && r.eventId === eventId);
    if (row) Object.assign(row, input);
  }

  async delete(eventId: number, id: number): Promise<void> {
    this.rows = this.rows.filter((row) => !(row.id === id && row.eventId === eventId));
  }
}

describe("guest use-cases", () => {
  it("creates an invited guest with a generated code", async () => {
    const repo = new FakeGuestRepository();
    const guest = await new CreateGuestUseCase(repo).execute({
      eventId: 1,
      name: "Sara Ahmed",
      seats: 2,
      phone: null,
      note: null,
    });

    expect(guest.code).toHaveLength(10);
    expect(guest.source).toBe("invited");
  });

  it("lists guests scoped to one event, gets by id and by code", async () => {
    const repo = new FakeGuestRepository();
    await repo.create({ eventId: 1, name: "A", seats: 1, phone: null, note: null, code: "CODEA1", source: "invited" });
    const guestB = await repo.create({ eventId: 2, name: "B", seats: 1, phone: null, note: null, code: "CODEB1", source: "invited" });

    const listed = await new ListGuestsForEventUseCase(repo).execute(1);
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("A");

    expect((await new GetGuestUseCase(repo).execute(2, guestB.id))?.name).toBe("B");
    expect((await new GetGuestByCodeUseCase(repo).execute("CODEB1"))?.id).toBe(guestB.id);
    expect(await new GetGuestByCodeUseCase(repo).execute("NOPE")).toBeNull();
  });

  it("imports guests from pasted lines, one per line as name, seats, note", async () => {
    const repo = new FakeGuestRepository();
    const result = await new ImportGuestsUseCase(repo).execute(
      1,
      "One, 1\nTwo, 3, vegan\nThree",
    );

    expect(result.created).toBe(3);
    const guests = await repo.listForEvent(1);
    expect(guests.map((g) => g.name)).toEqual(["One", "Two", "Three"]);
    expect(guests[1]).toMatchObject({ seats: 3, note: "vegan" });
    expect(guests[2]).toMatchObject({ seats: 1, note: null });
    expect(new Set(guests.map((g) => g.code)).size).toBe(3);
  });

  it("splits on Arabic commas as well as ASCII commas", async () => {
    const repo = new FakeGuestRepository();
    await new ImportGuestsUseCase(repo).execute(1, "عائلة آل فلان، 4، جهة العروس");

    const guests = await repo.listForEvent(1);
    expect(guests).toHaveLength(1);
    expect(guests[0]).toMatchObject({ name: "عائلة آل فلان", seats: 4, note: "جهة العروس" });
  });

  it("rejects an import with no lines or a line with no name", async () => {
    const repo = new FakeGuestRepository();
    await expect(new ImportGuestsUseCase(repo).execute(1, "   \n  ")).rejects.toThrow();
    await expect(new ImportGuestsUseCase(repo).execute(1, ", 2")).rejects.toThrow();
  });

  it("updates and deletes a guest", async () => {
    const repo = new FakeGuestRepository();
    const guest = await repo.create({ eventId: 1, name: "Sara", seats: 1, phone: null, note: null, code: "UPD0001", source: "invited" });

    await new UpdateGuestUseCase(repo).execute(1, guest.id, { name: "Sara Ahmed", seats: 2, phone: "0500000000", note: "front row" });
    expect(await repo.getById(1, guest.id)).toMatchObject({ name: "Sara Ahmed", seats: 2 });

    await new DeleteGuestUseCase(repo).execute(1, guest.id);
    expect(await repo.getById(1, guest.id)).toBeNull();
  });

  it("scopes getById, update, and delete to the given event, no-op across events", async () => {
    const repo = new FakeGuestRepository();
    const guest = await repo.create({
      eventId: 1,
      name: "Sara",
      seats: 1,
      phone: null,
      note: null,
      code: "EVT00001",
      source: "invited",
    });

    // Wrong event: getById returns null, update and delete are no-ops.
    expect(await new GetGuestUseCase(repo).execute(2, guest.id)).toBeNull();

    await new UpdateGuestUseCase(repo).execute(2, guest.id, { name: "Hijacked", seats: 9, phone: null, note: null });
    expect(await repo.getById(1, guest.id)).toMatchObject({ name: "Sara", seats: 1 });

    await new DeleteGuestUseCase(repo).execute(2, guest.id);
    expect(await repo.getById(1, guest.id)).toMatchObject({ name: "Sara" });

    // Correct event: all three succeed.
    expect((await new GetGuestUseCase(repo).execute(1, guest.id))?.name).toBe("Sara");
    await new DeleteGuestUseCase(repo).execute(1, guest.id);
    expect(await repo.getById(1, guest.id)).toBeNull();
  });
});
