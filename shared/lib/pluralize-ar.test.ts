import { describe, expect, it } from "vitest";
import { pluralizeAr } from "./pluralize-ar";

const FORMS = { one: "دعوة واحدة", two: "دعوتان", few: "دعوات", many: "دعوة" };

describe("pluralizeAr", () => {
  it("uses the one-form for 1, with no number prefixed", () => {
    expect(pluralizeAr(1, FORMS)).toBe("دعوة واحدة");
  });

  it("uses the dual form for 2, with no number prefixed", () => {
    expect(pluralizeAr(2, FORMS)).toBe("دعوتان");
  });

  it("uses the few-form with the number for 3-10", () => {
    expect(pluralizeAr(3, FORMS)).toBe("3 دعوات");
    expect(pluralizeAr(10, FORMS)).toBe("10 دعوات");
  });

  it("uses the many-form with the number for 11-99", () => {
    expect(pluralizeAr(11, FORMS)).toBe("11 دعوة");
    expect(pluralizeAr(50, FORMS)).toBe("50 دعوة");
    expect(pluralizeAr(99, FORMS)).toBe("99 دعوة");
  });

  it("uses the many-form for 0 and for round hundreds", () => {
    expect(pluralizeAr(0, FORMS)).toBe("0 دعوة");
    expect(pluralizeAr(100, FORMS)).toBe("100 دعوة");
  });

  it("uses the few-form again for 103-110 (n % 100 in 3-10)", () => {
    expect(pluralizeAr(103, FORMS)).toBe("103 دعوات");
  });
});
