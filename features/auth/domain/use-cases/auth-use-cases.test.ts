import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Event, EventInput } from "@/features/events/domain/Event";
import type { IEventRepository } from "@/features/events/domain/IEventRepository";
import type { IOwnerRepository, Owner } from "../IOwnerRepository";
import { AuthenticateDoorUseCase } from "./AuthenticateDoorUseCase";
import { AuthenticateOwnerUseCase } from "./AuthenticateOwnerUseCase";
import { ChangeOwnerPasswordUseCase } from "./ChangeOwnerPasswordUseCase";
import { CheckSetupStatusUseCase } from "./CheckSetupStatusUseCase";
import { CreateOwnerUseCase } from "./CreateOwnerUseCase";

class FakeOwnerRepository implements IOwnerRepository {
  row: Owner | null = null;

  async get(): Promise<Owner | null> {
    return this.row;
  }

  async create(input: { email: string; passwordHash: string }): Promise<void> {
    this.row = { id: 1, ...input };
  }

  async updatePassword(passwordHash: string): Promise<void> {
    if (!this.row) throw new Error("No owner account exists yet.");
    this.row = { ...this.row, passwordHash };
  }
}

class FakeEventRepository implements IEventRepository {
  private rows: Event[] = [];
  private nextId = 1;

  async list(): Promise<Event[]> {
    return this.rows;
  }
  async getById(id: number): Promise<Event | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async getByDoorCode(doorCode: string): Promise<Event | null> {
    return this.rows.find((r) => r.doorCode === doorCode) ?? null;
  }
  async create(input: EventInput): Promise<Event> {
    const event: Event = { id: this.nextId++, ...input, status: "live", createdAt: new Date() };
    this.rows.push(event);
    return event;
  }
  async update(): Promise<void> {}
  async archive(): Promise<void> {}
}

describe("CheckSetupStatusUseCase", () => {
  it("is false before an owner exists, true after", async () => {
    const repo = new FakeOwnerRepository();
    expect(await new CheckSetupStatusUseCase(repo).execute()).toBe(false);
    await repo.create({ email: "owner@example.com", passwordHash: "x" });
    expect(await new CheckSetupStatusUseCase(repo).execute()).toBe(true);
  });
});

describe("CreateOwnerUseCase", () => {
  it("creates an owner with a hashed password", async () => {
    const repo = new FakeOwnerRepository();
    await new CreateOwnerUseCase(repo).execute({ email: "Owner@Example.com", password: "supersecret" });

    expect(repo.row?.email).toBe("owner@example.com");
    expect(await bcrypt.compare("supersecret", repo.row!.passwordHash)).toBe(true);
  });

  it("rejects a bad email or a short password", async () => {
    const repo = new FakeOwnerRepository();
    await expect(new CreateOwnerUseCase(repo).execute({ email: "not-an-email", password: "supersecret" })).rejects.toThrow();
    await expect(new CreateOwnerUseCase(repo).execute({ email: "owner@example.com", password: "short" })).rejects.toThrow();
  });

  it("rejects creating a second owner account", async () => {
    const repo = new FakeOwnerRepository();
    await new CreateOwnerUseCase(repo).execute({ email: "owner@example.com", password: "supersecret" });

    await expect(
      new CreateOwnerUseCase(repo).execute({ email: "other@example.com", password: "supersecret" }),
    ).rejects.toThrow("يوجد حساب مالك بالفعل.");
    expect(repo.row?.email).toBe("owner@example.com");
  });
});

describe("ChangeOwnerPasswordUseCase", () => {
  it("changes the password when the current one matches", async () => {
    const repo = new FakeOwnerRepository();
    await new CreateOwnerUseCase(repo).execute({ email: "owner@example.com", password: "originalpw" });

    await new ChangeOwnerPasswordUseCase(repo).execute("originalpw", "newpassword");
    expect(await bcrypt.compare("newpassword", repo.row!.passwordHash)).toBe(true);
  });

  it("rejects a wrong current password or a short new one", async () => {
    const repo = new FakeOwnerRepository();
    await new CreateOwnerUseCase(repo).execute({ email: "owner@example.com", password: "originalpw" });

    await expect(new ChangeOwnerPasswordUseCase(repo).execute("wrongpw", "newpassword")).rejects.toThrow();
    await expect(new ChangeOwnerPasswordUseCase(repo).execute("originalpw", "short")).rejects.toThrow();
  });
});

describe("AuthenticateOwnerUseCase", () => {
  it("returns an owner session for a matching email and password", async () => {
    const repo = new FakeOwnerRepository();
    await new CreateOwnerUseCase(repo).execute({ email: "owner@example.com", password: "correctpw" });

    expect(await new AuthenticateOwnerUseCase(repo).execute("owner@example.com", "correctpw")).toEqual({ role: "owner" });
  });

  it("returns null for a wrong email or password", async () => {
    const repo = new FakeOwnerRepository();
    await new CreateOwnerUseCase(repo).execute({ email: "owner@example.com", password: "correctpw" });

    expect(await new AuthenticateOwnerUseCase(repo).execute("owner@example.com", "wrongpw")).toBeNull();
    expect(await new AuthenticateOwnerUseCase(repo).execute("nope@example.com", "correctpw")).toBeNull();
  });
});

describe("AuthenticateDoorUseCase", () => {
  it("resolves the event a door code belongs to", async () => {
    const eventRepo = new FakeEventRepository();
    const event = await eventRepo.create({
      name: "Layla & Omar",
      eventDate: null,
      venue: null,
      locationLink: null,
      description: null,
      doorCode: "PALM1",
      capacity: null,
    });

    const session = await new AuthenticateDoorUseCase(eventRepo).execute("PALM1");
    expect(session).toEqual({ role: "door", eventId: event.id });
  });

  it("returns null for an unknown door code", async () => {
    const eventRepo = new FakeEventRepository();
    expect(await new AuthenticateDoorUseCase(eventRepo).execute("NOPE")).toBeNull();
  });

  it("authenticates a door code entered in lowercase", async () => {
    const eventRepo = new FakeEventRepository();
    const event = await eventRepo.create({
      name: "Layla & Omar",
      eventDate: null,
      venue: null,
      locationLink: null,
      description: null,
      doorCode: "PALM1",
      capacity: null,
    });

    const session = await new AuthenticateDoorUseCase(eventRepo).execute("palm1");
    expect(session).toEqual({ role: "door", eventId: event.id });
  });
});
