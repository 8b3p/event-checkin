import { describe, expect, it } from "vitest";
import { isEventOver } from "./isEventOver";

const NOW = new Date("2026-11-10T12:00:00Z");

describe("isEventOver", () => {
  it("is over once the event is archived, whatever its date", () => {
    expect(isEventOver({ status: "archived", eventDate: null }, NOW)).toBe(true);
    expect(isEventOver({ status: "archived", eventDate: "2030-01-01" }, NOW)).toBe(true);
  });

  it("is over when the date is before today", () => {
    expect(isEventOver({ status: "live", eventDate: "2026-11-09" }, NOW)).toBe(true);
    expect(isEventOver({ status: "draft", eventDate: "2025-12-31" }, NOW)).toBe(true);
  });

  it("is not over on the day itself or before it", () => {
    expect(isEventOver({ status: "live", eventDate: "2026-11-10" }, NOW)).toBe(false);
    expect(isEventOver({ status: "live", eventDate: "2026-11-11" }, NOW)).toBe(false);
  });

  it("is not over without a usable date unless archived", () => {
    expect(isEventOver({ status: "live", eventDate: null }, NOW)).toBe(false);
    expect(isEventOver({ status: "live", eventDate: "" }, NOW)).toBe(false);
    expect(isEventOver({ status: "live", eventDate: "10/11/2026" }, NOW)).toBe(false);
  });

  it("defaults to the current time", () => {
    expect(isEventOver({ status: "live", eventDate: "2000-01-01" })).toBe(true);
    expect(isEventOver({ status: "live", eventDate: "2999-01-01" })).toBe(false);
  });
});
