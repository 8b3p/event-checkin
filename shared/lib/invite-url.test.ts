import { afterEach, describe, expect, it } from "vitest";
import { inviteUrl } from "./invite-url";

describe("inviteUrl", () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("falls back to http://localhost:3000 when NEXT_PUBLIC_APP_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(inviteUrl("ABC23456J9")).toBe("http://localhost:3000/i/ABC23456J9");
  });

  it("builds the invite URL from NEXT_PUBLIC_APP_URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
    expect(inviteUrl("ABC23456J9")).toBe("https://example.com/i/ABC23456J9");
  });
});
