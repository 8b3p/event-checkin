import { describe, expect, it } from "vitest";
import { cardFileName } from "./card-file-name";

describe("cardFileName", () => {
  it("keeps a plain Arabic name as-is", () => {
    expect(cardFileName({ name: "فاطمة الزهراء", code: "ABC23456J9" })).toBe("فاطمة الزهراء-ABC23456J9.png");
  });

  it("replaces path separators so a name can't create folders inside the ZIP", () => {
    expect(cardFileName({ name: "أحمد / سارة", code: "ABC23456J9" })).toBe("أحمد - سارة-ABC23456J9.png");
    expect(cardFileName({ name: "a\\b", code: "ABC23456J9" })).toBe("a-b-ABC23456J9.png");
  });

  it("replaces characters Windows refuses in file names", () => {
    expect(cardFileName({ name: 'x:*?"<>|y', code: "ABC23456J9" })).toBe("x-y-ABC23456J9.png");
  });

  it("collapses whitespace and trims", () => {
    expect(cardFileName({ name: "  أم   خالد \n", code: "ABC23456J9" })).toBe("أم خالد-ABC23456J9.png");
  });

  it("falls back to دعوة when nothing usable is left of the name", () => {
    expect(cardFileName({ name: " / ", code: "ABC23456J9" })).toBe("دعوة-ABC23456J9.png");
  });
});
