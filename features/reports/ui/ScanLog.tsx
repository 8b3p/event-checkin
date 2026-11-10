"use client";

import { useState } from "react";
import type { EventScan } from "@/features/check-in/domain/ScanEvent";
import { Badge } from "@/shared/component/ui/badge";
import { filterScanLog, type ScanLogFilter, type ScanLogSummary } from "../domain/summarizeScanLog";
import LocalTime from "./LocalTime";

const FILTERS: { key: ScanLogFilter; label: string; count: (summary: ScanLogSummary) => number }[] = [
  { key: "all", label: "الكل", count: (summary) => summary.total },
  { key: "overrides", label: "تجاوزات", count: (summary) => summary.overrides },
  { key: "manual", label: "إدخال يدوي", count: (summary) => summary.manual },
  { key: "out", label: "خروج", count: (summary) => summary.checkOuts },
];

/** The audit trail: every scan, newest first, narrowed to whatever needs explaining. */
export default function ScanLog({ scans, summary }: { scans: EventScan[]; summary: ScanLogSummary }) {
  const [filter, setFilter] = useState<ScanLogFilter>("all");
  const visible = [...filterScanLog(scans, filter)].reverse();

  return (
    <div>
      <div className="flex flex-wrap gap-2 px-5 print:hidden" role="tablist" aria-label="تصفية السجل">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={filter === option.key}
            onClick={() => setFilter(option.key)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              filter === option.key
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label} <span className="tabular">{option.count(summary)}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">لا شيء هنا.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-start text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-2 text-start font-medium">الوقت</th>
                <th className="px-3 py-2 text-start font-medium">الضيف</th>
                <th className="px-3 py-2 text-start font-medium">الحركة</th>
                <th className="px-3 py-2 text-start font-medium">الطريقة</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((scan) => (
                <tr key={scan.id} className="border-b border-border last:border-b-0">
                  <td className="px-5 py-2.5">
                    <LocalTime value={scan.at} />
                  </td>
                  <td className="px-3 py-2.5 text-foreground">{scan.guestName}</td>
                  <td className="px-3 py-2.5 tabular">
                    {scan.direction === "in" ? "دخول" : "خروج"} · {scan.seats}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {scan.method === "qr" ? "رمز QR" : "يدوي"}
                      {scan.override ? (
                        <Badge className="border-transparent bg-warn-soft text-warn-ink">تجاوز</Badge>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="px-5 pt-4 text-xs text-muted-foreground">
        التجاوز يعني أن الباب أدخل أو أخرج أشخاصاً رغم تنبيه النظام. المحاولات التي أوقفها النظام ولم يتجاوزها أحد لا تُسجَّل.
      </p>
    </div>
  );
}
