import { SignJWT } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { JwtSessionRepository } from "./JwtSessionRepository";

describe("JwtSessionRepository", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-at-least-16-chars";
  });

  it("round-trips an owner session", async () => {
    const repo = new JwtSessionRepository();
    const token = await repo.sign({ role: "owner" });
    expect(await repo.verify(token)).toEqual({ role: "owner" });
  });

  it("round-trips a door session with its event id", async () => {
    const repo = new JwtSessionRepository();
    const token = await repo.sign({ role: "door", eventId: 42 });
    expect(await repo.verify(token)).toEqual({ role: "door", eventId: 42 });
  });

  it("rejects a garbage token", async () => {
    const repo = new JwtSessionRepository();
    expect(await repo.verify("not-a-real-token")).toBeNull();
  });

  it("throws when SESSION_SECRET is missing or too short", async () => {
    process.env.SESSION_SECRET = "short";
    const repo = new JwtSessionRepository();
    await expect(repo.sign({ role: "owner" })).rejects.toThrow();
  });

  it("rejects a door-role token with no eventId claim", async () => {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    const token = await new SignJWT({ role: "door" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);

    const repo = new JwtSessionRepository();
    expect(await repo.verify(token)).toBeNull();
  });

  it("rejects a door-role token with a non-number eventId claim", async () => {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    const token = await new SignJWT({ role: "door", eventId: "42" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);

    const repo = new JwtSessionRepository();
    expect(await repo.verify(token)).toBeNull();
  });
});
