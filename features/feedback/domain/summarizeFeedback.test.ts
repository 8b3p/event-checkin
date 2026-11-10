import { describe, expect, it } from "vitest";
import { summarizeFeedback } from "./summarizeFeedback";

describe("summarizeFeedback", () => {
  it("returns an empty summary for no feedback", () => {
    expect(summarizeFeedback([])).toEqual({
      count: 0,
      average: null,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it("counts, averages to one decimal and buckets by rating", () => {
    const summary = summarizeFeedback([{ rating: 5 }, { rating: 5 }, { rating: 4 }, { rating: 1 }]);
    expect(summary.count).toBe(4);
    expect(summary.average).toBe(3.8);
    expect(summary.distribution).toEqual({ 1: 1, 2: 0, 3: 0, 4: 1, 5: 2 });
  });

  it("ignores out-of-range or non-integer ratings", () => {
    const summary = summarizeFeedback([{ rating: 3 }, { rating: 0 }, { rating: 6 }, { rating: 2.5 }]);
    expect(summary.count).toBe(1);
    expect(summary.average).toBe(3);
  });
});
