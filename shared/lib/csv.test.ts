import { describe, expect, it } from "vitest";
import { csvField, csvResponse, toCsv } from "./csv";

describe("csvField", () => {
  it("defuses a leading formula character", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("+966500000000")).toBe("'+966500000000");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvField('a,"b"\nc')).toBe('"a,""b""\nc"');
  });
});

describe("csvResponse", () => {
  it("prefixes a BOM and carries the Arabic filename in filename*", async () => {
    const response = csvResponse([["الاسم"], ["سارة"]], "report-1.csv", "تقرير-1.csv");

    // Read raw bytes: Response.text() strips a leading BOM while decoding.
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe("﻿" + toCsv([["الاسم"], ["سارة"]]));
    expect(response.headers.get("Content-Disposition")).toBe(
      `attachment; filename="report-1.csv"; filename*=UTF-8''${encodeURIComponent("تقرير-1.csv")}`,
    );
  });
});
