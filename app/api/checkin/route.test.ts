import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

import { EventRepository } from "@/features/events/infrastructure/EventRepository";
import { GuestRepository } from "@/features/guests/infrastructure/GuestRepository";
import { resetDb } from "@/shared/infrastructure/db/test-helpers";
import { setSessionCookie } from "@/shared/lib/session-cookie";
import { GET, PATCH, POST } from "./route";

process.env.SESSION_SECRET = "test-secret-at-least-16-chars";

function jsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/checkin", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedDoorSession() {
  const events = new EventRepository();
  const event = await events.create({
    name: "Test Event",
    eventDate: null,
    venue: null,
    locationLink: null,
    description: null,
    doorCode: "DOOR1",
    capacity: null,
  });
  const guest = await new GuestRepository().create({
    eventId: event.id,
    name: "Guest",
    seats: 2,
    phone: null,
    note: null,
    code: "GUEST-CODE-1",
    source: "invited",
  });
  await setSessionCookie({ role: "door", eventId: event.id });
  return { events, event, guest };
}

describe("/api/checkin on an archived event", () => {
  beforeEach(async () => {
    cookieStore.clear();
    await resetDb();
  });

  it("serves a live event normally", async () => {
    const { guest } = await seedDoorSession();

    expect((await GET()).status).toBe(200);
    expect((await POST(jsonRequest("POST", { guestId: guest.id }))).status).toBe(200);
    expect((await PATCH(jsonRequest("PATCH", { guestId: guest.id, seats: 1 }))).status).toBe(200);
  });

  it("returns 401 to GET, POST and interactive PATCH once archived", async () => {
    const { events, event, guest } = await seedDoorSession();
    await events.archive(event.id);

    expect((await GET()).status).toBe(401);
    expect((await POST(jsonRequest("POST", { guestId: guest.id }))).status).toBe(401);
    expect((await PATCH(jsonRequest("PATCH", { guestId: guest.id, seats: 1 }))).status).toBe(401);
  });

  it("still records a late offline sync (PATCH with a clientScanId) after archiving", async () => {
    const { events, event, guest } = await seedDoorSession();
    await events.archive(event.id);

    const response = await PATCH(
      jsonRequest("PATCH", { guestId: guest.id, seats: 2, direction: "in", clientScanId: "offline-scan-1" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "recorded", insideSeats: 2 });
  });

  it("accepts interactive requests again after the event is restored", async () => {
    const { events, event } = await seedDoorSession();
    await events.archive(event.id);
    await events.restore(event.id);

    expect((await GET()).status).toBe(200);
  });
});
