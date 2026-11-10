import { describe, expect, it } from "vitest";
import { formatDuration } from "./formatDuration";

describe("formatDuration", () => {
  it("says less than a minute under thirty seconds", () => {
    expect(formatDuration(0)).toBe("أقل من دقيقة");
    expect(formatDuration(0.4)).toBe("أقل من دقيقة");
  });

  it("uses minutes alone under an hour, with Arabic number agreement", () => {
    expect(formatDuration(1)).toBe("دقيقة واحدة");
    expect(formatDuration(2)).toBe("دقيقتان");
    expect(formatDuration(5)).toBe("5 دقائق");
    expect(formatDuration(45)).toBe("45 دقيقة");
  });

  it("uses hours alone on the hour and joins hours and minutes otherwise", () => {
    expect(formatDuration(60)).toBe("ساعة واحدة");
    expect(formatDuration(120)).toBe("ساعتان");
    expect(formatDuration(180)).toBe("3 ساعات");
    expect(formatDuration(125)).toBe("ساعتان و 5 دقائق");
    expect(formatDuration(61)).toBe("ساعة واحدة ودقيقة واحدة");
  });

  it("rounds to the nearest minute", () => {
    expect(formatDuration(89.6)).toBe("ساعة واحدة و 30 دقيقة");
  });
});
