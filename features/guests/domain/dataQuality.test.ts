import { describe, expect, it } from "vitest";
import {
  defaultMergePicks,
  findDataQualityIssues,
  nameKey,
  suggestKeepAndMerge,
  type CleanupGuest,
} from "./dataQuality";

function guest(overrides: Partial<CleanupGuest> & { id: number }): CleanupGuest {
  return {
    name: `ضيف ${overrides.id}`,
    seats: 2,
    phone: null,
    note: null,
    source: "invited",
    insideSeats: 0,
    firstInAt: null,
    lastOutAt: null,
    ...overrides,
  };
}

describe("nameKey", () => {
  it("folds Arabic spelling variants, punctuation and spacing", () => {
    expect(nameKey("أحمد   علي")).toBe(nameKey("احمد علي."));
    expect(nameKey("فاطمة")).toBe(nameKey("فاطمه"));
    expect(nameKey("  Sara  Ahmed ")).toBe(nameKey("sara ahmed"));
  });

  it("keeps different names apart", () => {
    expect(nameKey("أحمد علي")).not.toBe(nameKey("أحمد عمر"));
  });
});

describe("stillInside", () => {
  it("flags guests with seats still inside, and nobody else", () => {
    const report = findDataQualityIssues([
      guest({ id: 1, insideSeats: 2, firstInAt: new Date() }),
      guest({ id: 2, insideSeats: 0, firstInAt: new Date(), lastOutAt: new Date() }),
      guest({ id: 3 }),
    ]);
    expect(report.stillInside.map((g) => g.id)).toEqual([1]);
  });
});

describe("duplicates", () => {
  it("groups guests with the same normalised name", () => {
    const report = findDataQualityIssues([
      guest({ id: 1, name: "أحمد علي" }),
      guest({ id: 2, name: "احمد  علي" }),
      guest({ id: 3, name: "سارة" }),
    ]);
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0].guests.map((g) => g.id)).toEqual([1, 2]);
    expect(report.duplicates[0].reasons).toEqual(["name"]);
  });

  it("groups guests with the same phone written differently", () => {
    const report = findDataQualityIssues([
      guest({ id: 1, name: "سارة", phone: "0501234567" }),
      guest({ id: 2, name: "أم خالد", phone: "+971 50 123 4567" }),
    ]);
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0].reasons).toEqual(["phone"]);
  });

  it("reports both reasons, and chains A≈B≈C into one group", () => {
    const report = findDataQualityIssues([
      guest({ id: 1, name: "سارة", phone: "0501234567" }),
      guest({ id: 2, name: "سارة", phone: "0509999999" }),
      guest({ id: 3, name: "ليلى", phone: "0509999999" }),
    ]);
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0].guests.map((g) => g.id)).toEqual([1, 2, 3]);
    expect(report.duplicates[0].reasons).toEqual(["name", "phone"]);
  });

  it("does not match on empty phones or empty names", () => {
    const report = findDataQualityIssues([
      guest({ id: 1, name: "!!!", phone: "" }),
      guest({ id: 2, name: "???", phone: null }),
    ]);
    expect(report.duplicates).toEqual([]);
  });

  it("leaves an invited guest and a lookalike walk-in to the walk-in match", () => {
    const report = findDataQualityIssues([
      guest({ id: 1, name: "سارة" }),
      guest({ id: 2, name: "سارة", source: "walk_in" }),
    ]);
    expect(report.duplicates).toEqual([]);
  });

  it("still groups two walk-ins that look alike", () => {
    const report = findDataQualityIssues([
      guest({ id: 1, name: "سارة", source: "walk_in" }),
      guest({ id: 2, name: "سارة", source: "walk_in" }),
    ]);
    expect(report.duplicates).toHaveLength(1);
  });
});

describe("walkInMatches", () => {
  it("matches a walk-in to an invited guest by name", () => {
    const report = findDataQualityIssues([
      guest({ id: 1, name: "أحمد علي" }),
      guest({ id: 2, name: "احمد علي", source: "walk_in" }),
    ]);
    expect(report.walkInMatches).toHaveLength(1);
    expect(report.walkInMatches[0].walkIn.id).toBe(2);
    expect(report.walkInMatches[0].matches).toEqual([{ guest: expect.objectContaining({ id: 1 }), reasons: ["name"] }]);
  });

  it("matches by phone when the names differ, ranking name+phone first", () => {
    const report = findDataQualityIssues([
      guest({ id: 1, name: "ليلى", phone: "0501234567" }),
      guest({ id: 2, name: "سارة", phone: "0501234567" }),
      guest({ id: 3, name: "سارة", phone: "00971501234567", source: "walk_in" }),
    ]);
    const [match] = report.walkInMatches;
    expect(match.matches.map((m) => m.guest.id)).toEqual([2, 1]);
    expect(match.matches[0].reasons).toEqual(["name", "phone"]);
  });

  it("ignores walk-ins with no invited lookalike", () => {
    const report = findDataQualityIssues([
      guest({ id: 1, name: "ليلى" }),
      guest({ id: 2, name: "سارة", source: "walk_in" }),
    ]);
    expect(report.walkInMatches).toEqual([]);
  });
});

describe("merge helpers", () => {
  it("keeps the invited guest over a walk-in, whatever the order", () => {
    const invited = guest({ id: 9 });
    const walkIn = guest({ id: 1, source: "walk_in" });
    expect(suggestKeepAndMerge(walkIn, invited)).toEqual({ keep: invited, merge: walkIn });
  });

  it("keeps the older of two of the same kind", () => {
    const [a, b] = [guest({ id: 1 }), guest({ id: 2 })];
    expect(suggestKeepAndMerge(b, a)).toEqual({ keep: a, merge: b });
  });

  it("falls back to the other guest's phone/note only when the kept one is empty", () => {
    expect(defaultMergePicks({ phone: null, note: "x" }, { phone: "0501234567", note: "y" })).toEqual({
      phone: "merge",
      note: "keep",
    });
    expect(defaultMergePicks({ phone: "1", note: "" }, { phone: "2", note: "y" })).toEqual({
      phone: "keep",
      note: "merge",
    });
  });
});
