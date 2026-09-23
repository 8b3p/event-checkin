import { describe, expect, it } from "vitest";
import { normalizeAr } from "./normalize-ar";

describe("normalizeAr", () => {
  it("folds hamza-bearing alef variants to bare alef", () => {
    expect(normalizeAr("أحمد")).toBe(normalizeAr("احمد"));
    expect(normalizeAr("إحمد")).toBe(normalizeAr("احمد"));
    expect(normalizeAr("آحمد")).toBe(normalizeAr("احمد"));
  });

  it("folds teh marbuta to heh", () => {
    expect(normalizeAr("فاطمة")).toBe(normalizeAr("فاطمه"));
  });

  it("folds alef maksura to yeh", () => {
    expect(normalizeAr("ليلى")).toBe(normalizeAr("ليلي"));
  });

  it("strips tashkeel (diacritics)", () => {
    expect(normalizeAr("مُحَمَّد")).toBe(normalizeAr("محمد"));
  });

  it("normalizes Arabic-Indic digits to Western digits", () => {
    expect(normalizeAr("٢٠٢٤")).toBe("2024");
  });

  it("lowercases Latin text", () => {
    expect(normalizeAr("Ahmad")).toBe("ahmad");
  });

  it("leaves an already-normalized string unchanged", () => {
    expect(normalizeAr("احمد")).toBe("احمد");
  });
});
