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

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { EventRepository } from "@/features/events/infrastructure/EventRepository";
import { resetDb } from "@/shared/infrastructure/db/test-helpers";
import { setSessionCookie } from "./session-cookie";
import { requireDoor, requireOwner, requireSetUp } from "./guard";
import { OwnerRepository } from "@/features/auth/infrastructure/OwnerRepository";

process.env.SESSION_SECRET = "test-secret-at-least-16-chars";

describe("guard", () => {
  beforeEach(async () => {
    cookieStore.clear();
    await resetDb();
  });

  it("requireSetUp redirects to /setup when there is no owner yet", async () => {
    await expect(requireSetUp()).rejects.toThrow("NEXT_REDIRECT:/setup");
  });

  it("requireOwner redirects to /login when signed out", async () => {
    await new OwnerRepository().create({ email: "owner@example.com", passwordHash: "hash" });
    await expect(requireOwner()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("requireOwner passes for an owner session", async () => {
    await new OwnerRepository().create({ email: "owner@example.com", passwordHash: "hash" });
    await setSessionCookie({ role: "owner" });
    await expect(requireOwner()).resolves.toBeUndefined();
  });

  it("requireOwner redirects a door session to /login", async () => {
    await new OwnerRepository().create({ email: "owner@example.com", passwordHash: "hash" });
    const event = await new EventRepository().create({
      name: "Test Event",
      eventDate: null,
      venue: null,
      description: null,
      doorCode: "DOOR1",
      capacity: null,
    });
    await setSessionCookie({ role: "door", eventId: event.id });
    await expect(requireOwner()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("requireDoor returns the event id for a door session", async () => {
    await new OwnerRepository().create({ email: "owner@example.com", passwordHash: "hash" });
    const event = await new EventRepository().create({
      name: "Test Event",
      eventDate: null,
      venue: null,
      description: null,
      doorCode: "DOOR1",
      capacity: null,
    });
    await setSessionCookie({ role: "door", eventId: event.id });
    await expect(requireDoor()).resolves.toBe(event.id);
  });

  it("requireDoor redirects to /door when signed out", async () => {
    await new OwnerRepository().create({ email: "owner@example.com", passwordHash: "hash" });
    await expect(requireDoor()).rejects.toThrow("NEXT_REDIRECT:/door");
  });
});
