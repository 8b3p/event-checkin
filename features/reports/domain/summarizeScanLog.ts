import type { EventScan } from "@/features/check-in/domain/ScanEvent";

export type ScanLogSummary = {
  total: number;
  checkIns: number;
  checkOuts: number;
  /** Scans the door forced past a "party already inside" / "nobody inside" block. */
  overrides: number;
  /** Scans entered by searching the guest list instead of reading a QR code. */
  manual: number;
};

export type ScanLogFilter = "all" | "overrides" | "manual" | "out";

export function summarizeScanLog(scans: EventScan[]): ScanLogSummary {
  return {
    total: scans.length,
    checkIns: scans.filter((scan) => scan.direction === "in").length,
    checkOuts: scans.filter((scan) => scan.direction === "out").length,
    overrides: scans.filter((scan) => scan.override).length,
    manual: scans.filter((scan) => scan.method === "manual").length,
  };
}

export function filterScanLog(scans: EventScan[], filter: ScanLogFilter): EventScan[] {
  switch (filter) {
    case "overrides":
      return scans.filter((scan) => scan.override);
    case "manual":
      return scans.filter((scan) => scan.method === "manual");
    case "out":
      return scans.filter((scan) => scan.direction === "out");
    default:
      return scans;
  }
}
