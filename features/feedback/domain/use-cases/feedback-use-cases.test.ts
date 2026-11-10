import { describe, expect, it } from "vitest";
import type { Event } from "@/features/events/domain/Event";
import type { IEventRepository } from "@/features/events/domain/IEventRepository";
import type { Guest } from "@/features/guests/domain/Guest";
import type { IGuestRepository } from "@/features/guests/domain/IGuestRepository";
import type { EventFeedbackItem, GuestFeedback, SaveFeedbackInput } from "../Feedback";
import type { IFeedbackRepository } from "../IFeedbackRepository";
import { GetFeedbackForGuestUseCase } from "./GetFeedbackForGuestUseCase";
import { ListFeedbackForEventUseCase } from "./ListFeedbackForEventUseCase";
import { SubmitFeedbackUseCase } from "./SubmitFeedbackUseCase";

class FakeFeedbackRepository implements IFeedbackRepository {
  rows: GuestFeedback[] = [];
  private nextId = 1;

  async upsert(input: SaveFeedbackInput): Promise<GuestFeedback> {
    const existing = this.rows.find((row) => row.guestId === input.guestId);
    if (existing) {
      Object.assign(existing, input, { updatedAt: new Date() });
      return existing;
    }
    const row: GuestFeedback = { id: this.nextId++, ...input, createdAt: new Date(), updatedAt: new Date() };
    this.rows.push(row);
    return row;
  }

  async getForGuest(guestId: number): Promise<GuestFeedback | null> {
    return this.rows.find((row) => row.guestId === guestId) ?? null;
  }

  async listForEvent(): Promise<EventFeedbackItem[]> {
    return this.rows.map((row) => ({ ...row, guestName: `guest ${row.guestId}` }));
  }
}

const NOW = new Date("2026-11-10T12:00:00Z");

function makeEvent(overrides: Partial<Event>): Event {
  return {
    id: 1,
    name: "Wedding",
    eventDate: null,
    venue: null,
    locationLink: null,
    description: null,
    doorCode: "DOOR1",
    capacity: null,
    status: "live",
    createdAt: NOW,
    ...overrides,
  };
}

class FakeEventRepository implements Pick<IEventRepository, "getById"> {
  constructor(private readonly event: Event | null) {}
  async getById() {
    return this.event;
  }
}

class FakeGuestRepository implements Pick<IGuestRepository, "getByCode"> {
  constructor(private readonly guest: Guest | null) {}
  async getByCode(code: string) {
    return this.guest && this.guest.code === code ? this.guest : null;
  }
}

const GUEST: Guest = {
  id: 7,
  eventId: 1,
  name: "Sara",
  seats: 2,
  phone: null,
  note: null,
  code: "ABC123XY",
  source: "invited",
  createdAt: NOW,
};

function setup(event: Event | null, guest: Guest | null = GUEST) {
  const feedback = new FakeFeedbackRepository();
  const useCase = new SubmitFeedbackUseCase(feedback, new FakeGuestRepository(guest), new FakeEventRepository(event), () => NOW);
  return { feedback, useCase };
}

describe("SubmitFeedbackUseCase", () => {
  it("saves a trimmed answer once the event is archived", async () => {
    const { feedback, useCase } = setup(makeEvent({ status: "archived" }));
    const result = await useCase.execute({ code: "ABC123XY", rating: "4", comment: "  كان رائعاً  " });

    expect(result).toEqual({ ok: true, rating: 4, comment: "كان رائعاً" });
    expect(feedback.rows).toHaveLength(1);
    expect(feedback.rows[0]).toMatchObject({ guestId: 7, rating: 4, comment: "كان رائعاً" });
  });

  it("stores an empty comment as null and lets the guest revise their answer", async () => {
    const { feedback, useCase } = setup(makeEvent({ eventDate: "2026-11-01" }));
    await useCase.execute({ code: "ABC123XY", rating: "2", comment: "meh" });
    const revised = await useCase.execute({ code: "ABC123XY", rating: 5, comment: "   " });

    expect(revised).toEqual({ ok: true, rating: 5, comment: null });
    expect(feedback.rows).toHaveLength(1);
    expect(feedback.rows[0]).toMatchObject({ rating: 5, comment: null });
  });

  it("refuses an unknown code and a missing event", async () => {
    expect(await setup(makeEvent({ status: "archived" })).useCase.execute({ code: "NOPE", rating: "3", comment: "" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await setup(null).useCase.execute({ code: "ABC123XY", rating: "3", comment: "" })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("refuses while the event is not over yet", async () => {
    const { feedback, useCase } = setup(makeEvent({ status: "live", eventDate: "2026-11-10" }));
    expect(await useCase.execute({ code: "ABC123XY", rating: "3", comment: "" })).toEqual({ ok: false, reason: "not_open" });
    expect(feedback.rows).toHaveLength(0);
  });

  it.each([["0"], ["6"], ["3.5"], ["-1"], ["abc"], [""], [null], [undefined], [4.5], [{}]])("rejects rating %j", async (rating) => {
    const { feedback, useCase } = setup(makeEvent({ status: "archived" }));
    expect(await useCase.execute({ code: "ABC123XY", rating, comment: "" })).toEqual({ ok: false, reason: "invalid_rating" });
    expect(feedback.rows).toHaveLength(0);
  });

  it("caps the comment at 1000 characters", async () => {
    const { feedback, useCase } = setup(makeEvent({ status: "archived" }));
    expect(await useCase.execute({ code: "ABC123XY", rating: "5", comment: "x".repeat(1001) })).toEqual({
      ok: false,
      reason: "comment_too_long",
    });
    expect(feedback.rows).toHaveLength(0);

    const ok = await useCase.execute({ code: "ABC123XY", rating: "5", comment: "x".repeat(1000) });
    expect(ok.ok).toBe(true);
  });

  it("ignores a non-string comment", async () => {
    const { useCase } = setup(makeEvent({ status: "archived" }));
    expect(await useCase.execute({ code: "ABC123XY", rating: "5", comment: { $gt: "" } })).toEqual({
      ok: true,
      rating: 5,
      comment: null,
    });
  });
});

describe("read use-cases", () => {
  it("gets feedback for a guest and lists feedback for an event", async () => {
    const repo = new FakeFeedbackRepository();
    await repo.upsert({ guestId: 7, rating: 3, comment: null });

    expect((await new GetFeedbackForGuestUseCase(repo).execute(7))?.rating).toBe(3);
    expect(await new GetFeedbackForGuestUseCase(repo).execute(8)).toBeNull();
    expect(await new ListFeedbackForEventUseCase(repo).execute(1)).toHaveLength(1);
  });
});
